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
  keccak256,
  toBytes,
  type Address,
  type Abi,
} from "viem";
import { anvil } from "viem/chains";
import {
  membershipFactoryAbi,
  membershipTierAbi,
  iWrappedNativeAbi,
} from "../src/contracts";
import { validateAdminRpc, readAdminContext } from "./protocol-admin";

const [evidenceArg, ownerArg] = process.argv.slice(2);
if (!evidenceArg || !ownerArg)
  throw new Error(
    "Usage: seed-buyback-demo.ts EVIDENCE_DIRECTORY WALLET_ADDRESS",
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
let saved:
  | {
      factory: Address;
      owner: Address;
      advanceTo: string;
      completed?: boolean;
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
    const tokenId = await client.readContract({
      address: tier.address,
      abi: membershipTierAbi,
      functionName: "tokenOf",
      args: [owner],
    });
    if (tokenId !== BigInt(tier.tokenId))
      throw new Error(
        "Demo membership changed; inspect the current fork before reseeding",
      );
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
  });
  const hash = await wallet.writeContract(simulation.request);
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success")
    throw new Error(`${functionName} reverted: ${hash}`);
  return simulation.result;
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
            periodDuration: 2592000n,
            protocolFeeBps: 2500,
            rewardBps: 2500,
            referralBps: 1000,
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
          },
        ],
      );
      tier = await client.readContract({
        address: bootstrap.factory,
        abi: membershipFactoryAbi,
        functionName: "tierForIdentity",
        args: [identity],
      });
    }
    let tokenId = await client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "tokenOf",
      args: [owner],
    });
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
      await transact(owner, tier, membershipTierAbi, "purchase", [
        4n,
        zeroAddress,
      ]);
      tokenId = await client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "tokenOf",
        args: [owner],
      });
    }
    tiers.push({
      symbol: currency.symbol,
      paymentToken: currency.address,
      address: tier,
      tokenId,
      pricePerPeriod: currency.price,
    });
  }
  if ((await client.getBlock()).timestamp < BigInt(plan.advanceTo)) {
    await test.setNextBlockTimestamp({ timestamp: BigInt(plan.advanceTo) });
    await test.mine({ blocks: 1 });
  }
  if ((await client.getBalance({ address: owner })) < parseEther("20"))
    await test.setBalance({ address: owner, value: parseEther("20") });
  const result = { ...plan, completed: true, tiers };
  await writeFile(marker, json(result));
  console.log(json(result));
} finally {
  await test.stopImpersonatingAccount({ address: owner });
}
