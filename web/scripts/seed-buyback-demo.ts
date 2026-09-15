import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  createTestClient,
  http,
  getAddress,
  zeroAddress,
  zeroHash,
  erc20Abi,
  parseEther,
  parseEventLogs,
  keccak256,
  toBytes,
  type Address,
  type Hex,
  type Abi,
  type ContractFunctionArgs,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { anvil } from "viem/chains";
import {
  membershipFactoryAbi,
  protocolBuybackVaultAbi,
  membershipTierAbi,
  iWrappedNativeAbi,
  iSafeAbi,
} from "../src/contracts";
import {
  validateAdminRpc,
  readAdminContext,
  prepareBuybackPayload,
} from "./protocol-admin";
import { executeForkSafePayload } from "./protocol-safe-transactions";
import { readMarketState, quoteMarket } from "../src/lib/buyback-policy/live";

const [evidenceArg, ownerArg, ...flags] = process.argv.slice(2);
if (flags.some((flag) => flag !== "--permissionless") || flags.length > 1)
  throw new Error("Unknown demo option");
const permissionless = flags.includes("--permissionless");
if (!evidenceArg || !ownerArg)
  throw new Error(
    "Usage: seed-buyback-demo.ts EVIDENCE_DIRECTORY WALLET_ADDRESS [--permissionless]",
  );
const evidence = resolve(evidenceArg),
  owner = getAddress(ownerArg);
const bootstrap = JSON.parse(
  await readFile(resolve(evidence, "bootstrap.json"), "utf8"),
);
const fixture = JSON.parse(
  await readFile(resolve(evidence, "fixture.json"), "utf8"),
);
const rpc = process.env.BBF_ADMIN_RPC_URL ?? "http://127.0.0.1:18557";
validateAdminRpc("forknet", rpc);
const transport = http(rpc, { retryCount: 0, timeout: 15000 });
const client = createPublicClient({ chain: anvil, transport });
if ((await client.getChainId()) !== 31337)
  throw new Error("Demo setup requires the local Anvil chain");
await readAdminContext(client, 31337, bootstrap.factory);
const test = createTestClient({ chain: anvil, transport, mode: "anvil" });
const donor = getAddress(fixture.accounts[0]);
const wallet = createWalletClient({ chain: anvil, transport });
const json = (v: unknown) =>
  JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x), 2) +
  "\n";
const marker = resolve(evidence, "buyback-demo.json");
const testKey = (value: number) =>
  `0x${value.toString(16).padStart(64, "0")}` as Hex;
// Explicit disposable-fork opt-in. Complete this before transferring the Safe to a personal wallet.
const configurePermissionless = async () => {
  const context = await readAdminContext(client, 31337, bootstrap.factory);
  const [owners, threshold] = await Promise.all([
    client.readContract({
      address: context.safe,
      abi: iSafeAbi,
      functionName: "getOwners",
    }),
    client.readContract({
      address: context.safe,
      abi: iSafeAbi,
      functionName: "getThreshold",
    }),
  ]);
  const signerKeys = [40961, 40962, 40963]
    .map(testKey)
    .filter((key) =>
      owners.some(
        (address) =>
          address.toLowerCase() ===
          privateKeyToAccount(key).address.toLowerCase(),
      ),
    )
    .slice(0, Number(threshold));
  if (signerKeys.length !== Number(threshold))
    throw new Error(
      "Permissionless demo setup requires the disposable Safe test keys before owner handoff",
    );
  const receipts = [];
  const safe = async (action: string, input: Record<string, unknown>) => {
    const current = await readAdminContext(client, 31337, bootstrap.factory);
    const payload = await prepareBuybackPayload(client, current, action, {
      ...input,
      expectedSafeNonceRaw: String(current.safeNonce),
    });
    const receipt = await executeForkSafePayload({
      rpcUrl: rpc,
      factory: bootstrap.factory,
      payload,
      signerKeys,
      relayerKey: testKey(49153),
    });
    receipts.push({ action, payload, receipt });
  };
  for (const [asset, batch] of [
    [zeroAddress, parseEther("0.02")],
    [getAddress(fixture.assets.usdg), 50_000_000n],
    [getAddress(fixture.assets.amd), parseEther("0.01")],
  ] as const) {
    const revision = () =>
      client.readContract({
        address: bootstrap.buybackVault,
        abi: protocolBuybackVaultAbi,
        functionName: "revision",
        args: [asset],
      });
    await safe("limits", {
      asset,
      expectedRevisionRaw: String(await revision()),
      limits: { minInput: "1", maxInput: String(batch), minInterval: "0" },
    });
    const market = await readMarketState(client, {
      vault: bootstrap.buybackVault,
      asset,
      protocolToken: bootstrap.protocolToken,
      blockNumber: await client.getBlockNumber(),
    });
    const quote = await quoteMarket(client, market, batch);
    const rates = quote.map((leg, index) => ({
      numerator: String(leg.outputRaw * 8000n),
      denominator: String(
        (index === 0 ? batch : quote[index - 1].outputRaw) * 10000n,
      ),
    }));
    await safe("policy", {
      asset,
      expectedRevisionRaw: String(await revision()),
      lifecycle: market.lifecycle,
      rates,
      expiresAt: "0",
      inputBudget: "0",
    });
    receipts.push({ asset, batch, quote, rates, fixtureToleranceBps: 2000 });
  }
  await safe("interval", { minInterval: "0" });
  await safe("mode", { mode: 1 });
  await safe("pause", { paused: false });
  await writeFile(
    resolve(evidence, "buyback-demo-permissionless.json"),
    json({ fixtureOnly: true, receipts }),
  );
};
let saved:
  | {
      factory: Address;
      owner: Address;
      advanceTo: string;
      completed?: boolean;
      permissionless?: boolean;
      tiers?: { address: Address; tokenId: string }[];
    }
  | undefined;
try {
  saved = JSON.parse(await readFile(marker, "utf8"));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
if (
  saved &&
  (saved.factory.toLowerCase() !== bootstrap.factory.toLowerCase() ||
    saved.owner.toLowerCase() !== owner.toLowerCase())
)
  throw new Error("Demo evidence belongs to a different factory or wallet");
if (saved?.completed) {
  if (saved.tiers?.length !== 3) throw new Error("Incomplete demo evidence");
  for (const tier of saved.tiers) {
    const currentOwner = await client.readContract({
      address: tier.address,
      abi: membershipTierAbi,
      functionName: "ownerOf",
      args: [BigInt(tier.tokenId)],
    });
    if (currentOwner.toLowerCase() !== owner.toLowerCase())
      throw new Error(
        "Demo membership changed; inspect the current fork before reseeding",
      );
  }
  if (permissionless && !saved.permissionless) {
    await configurePermissionless();
    await writeFile(marker, json({ ...saved, permissionless: true }));
  }
  console.log(
    "Demo already prepared. Memberships, purchases and chain time were left unchanged.",
  );
  process.exit(0);
}
const plan = saved ?? {
  factory: bootstrap.factory,
  owner,
  advanceTo: ((await client.getBlock()).timestamp + 15n * 86400n).toString(),
};
await writeFile(marker, json(plan));
const transact = async (
  account: Address,
  address: Address,
  abi: Abi,
  functionName: string,
  args: readonly unknown[] = [],
  value = 0n,
) => {
  const simulation = await client.simulateContract({
    address,
    abi,
    functionName,
    args,
    account,
    value,
    gasPrice: 100_000_000n,
  });
  const hash = await wallet.writeContract(simulation.request);
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success")
    throw new Error(`${functionName} reverted: ${hash}`);
  return receipt;
};
const art = await client.readContract({
  address: fixture.tier,
  abi: membershipTierAbi,
  functionName: "artConfig",
});
const currencies = [
  {
    symbol: "WETH",
    address: getAddress(fixture.assets.weth),
    price: parseEther("0.5"),
  },
  {
    symbol: "USDG",
    address: getAddress(fixture.assets.usdg),
    price: 50_000_000n,
  },
  {
    symbol: "AMD",
    address: getAddress(fixture.assets.amd),
    price: parseEther("0.01"),
  },
];
await test.impersonateAccount({ address: owner });
const tiers = [];
try {
  if ((await client.getBalance({ address: owner })) < parseEther("25"))
    await test.setBalance({ address: owner, value: parseEther("25") });
  for (const currency of currencies) {
    const salt = keccak256(toBytes(`buyback-demo-${currency.symbol}`));
    const identity = await client.readContract({
      address: bootstrap.factory,
      abi: membershipFactoryAbi,
      functionName: "predictTierIdentity",
      args: [owner, salt],
    });
    let tier = await client.readContract({
      address: bootstrap.factory,
      abi: membershipFactoryAbi,
      functionName: "tierForIdentity",
      args: [identity],
    });
    if (tier === zeroAddress) {
      await transact(
        owner,
        bootstrap.factory,
        membershipFactoryAbi,
        "createTier",
        [
          {
            creator: owner,
            tierSalt: salt,
            renderer: bootstrap.renderer,
            paymentToken: currency.address,
            name: `${currency.symbol} Fans`,
            symbol: `${currency.symbol}FANS`,
            pricePerPeriod: currency.price,
            minimumPayment: await client.readContract({
              address: bootstrap.factory,
              abi: membershipFactoryAbi,
              functionName: "minimumPayment",
              args: [currency.address],
            }),
            periodDuration: 2592000n,
            protocolFeeBps: 2500,
            rewardBps: 2500,
            referralBps: 1000,
            startingBoostBps: 10000,
            earlySupportGross: 0n,
            supplyCap: 0n,
            maxPrepaidPeriods: 12n,
            metadata: {
              description: "Local buyback testing membership.",
              externalURI: "",
            },
            art,
            media: {
              mime: 0,
              store: zeroAddress,
              length: 0,
              digest: zeroHash,
              runtimeCodehash: zeroHash,
            },
          } satisfies ContractFunctionArgs<
            typeof membershipFactoryAbi,
            "nonpayable",
            "createTier"
          >[0],
        ],
      );
      tier = await client.readContract({
        address: bootstrap.factory,
        abi: membershipFactoryAbi,
        functionName: "tierForIdentity",
        args: [identity],
      });
    }
    const recorded = saved?.tiers?.find(
      (item) => item.address.toLowerCase() === tier.toLowerCase(),
    );
    let tokenId = recorded ? BigInt(recorded.tokenId) : 0n;
    if (
      tokenId === 0n &&
      (await client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "balanceOf",
        args: [owner],
      })) !== 0n
    ) {
      throw new Error(
        "An existing demo position has no saved receipt identity; use a fresh fixture.",
      );
    }
    if (tokenId === 0n) {
      const gross = currency.price * 4n;
      const balance = await client.readContract({
        address: currency.address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [owner],
      });
      if (balance < gross) {
        const needed = gross - balance;
        if (currency.symbol === "WETH")
          await transact(
            owner,
            currency.address,
            iWrappedNativeAbi,
            "deposit",
            [],
            needed,
          );
        else {
          const available = await client.readContract({
            address: currency.address,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [donor],
          });
          if (available < needed)
            throw new Error(
              `Fixture needs ${currency.symbol}; restart with fresh market acquisitions`,
            );
          await transact(donor, currency.address, erc20Abi, "transfer", [
            owner,
            needed,
          ]);
        }
      }
      await transact(owner, currency.address, erc20Abi, "approve", [
        tier,
        gross,
      ]);
      const receipt = await transact(
        owner,
        tier,
        membershipTierAbi,
        "createMembership",
        [4n, zeroAddress, 25n],
      );
      const created = parseEventLogs({
        abi: membershipTierAbi,
        eventName: "Transfer",
        logs: receipt.logs,
        strict: true,
      }).find(
        (event) =>
          event.address.toLowerCase() === tier.toLowerCase() &&
          event.args.from === zeroAddress &&
          event.args.to.toLowerCase() === owner.toLowerCase(),
      );
      if (!created)
        throw new Error(
          "The successful receipt did not identify a new demo membership.",
        );
      tokenId = created.args.tokenId;
    }
    tiers.push({
      symbol: currency.symbol,
      paymentToken: currency.address,
      address: tier,
      tokenId,
      pricePerPeriod: currency.price,
    });
    await writeFile(marker, json({ ...plan, completed: false, tiers }));
  }
  if ((await client.getBlock()).timestamp < BigInt(plan.advanceTo)) {
    await test.setNextBlockTimestamp({ timestamp: BigInt(plan.advanceTo) });
    await test.mine({ blocks: 1 });
  }
  if ((await client.getBalance({ address: owner })) < parseEther("20"))
    await test.setBalance({ address: owner, value: parseEther("20") });
  if (permissionless) await configurePermissionless();
  const result = { ...plan, completed: true, tiers, permissionless };
  await writeFile(marker, json(result));
  console.log(json(result));
} finally {
  await test.stopImpersonatingAccount({ address: owner });
}
