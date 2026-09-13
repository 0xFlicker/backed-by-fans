/** Disposable fork review fixture. Real ERC20 purchases and memberships; no storage edits. */
import Safe from "@safe-global/protocol-kit";
import {
  getMultiSendDeployment,
  getMultiSendCallOnlyDeployment,
  getSafeL2SingletonDeployment,
  getProxyFactoryDeployment,
  getCompatibilityFallbackHandlerDeployment,
  getSignMessageLibDeployment,
  getCreateCallDeployment,
  getSimulateTxAccessorDeployment,
} from "@safe-global/safe-deployments";
import { readFile, writeFile, access } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  createTestClient,
  http,
  getAddress,
  parseEther,
  erc20Abi,
  keccak256,
  zeroAddress,
  type Abi,
  type Address,
} from "viem";
import { anvil } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import {
  membershipFactoryAbi,
  membershipTierAbi,
  iWrappedNativeAbi,
  iSafeAbi,
} from "../src/contracts";
import { validateAdminRpc } from "./protocol-admin";
const [directory, first, second] = process.argv.slice(2);
if (!directory || !first || !second)
  throw new Error("Usage: seed-protocol-review.ts EVIDENCE WALLET WALLET");
const output = resolve(directory, "review-seed.json");
const exists = await access(output).then(
  () => true,
  (error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
    return false;
  },
);
if (exists) throw new Error("This run already has a review seed.");
const wallets = [getAddress(first), getAddress(second)];
const rpc = process.env.BBF_ADMIN_RPC_URL ?? "http://127.0.0.1:18557";
validateAdminRpc("forknet", rpc);
const transport = http(rpc, { retryCount: 0 });
const client = createPublicClient({ chain: anvil, transport });
const test = createTestClient({ chain: anvil, mode: "anvil", transport });
if ((await client.getChainId()) !== 31337)
  throw new Error("Local Anvil chain required.");
const fixture = JSON.parse(
  await readFile(resolve(directory, "fixture.json"), "utf8"),
);
const bootstrap = fixture.bootstrap;
const donor = getAddress(fixture.accounts[0]);
const usdg = getAddress(fixture.assets.usdg),
  weth = getAddress(fixture.assets.weth),
  amd = getAddress(fixture.assets.amd);
const receipts = [];
async function transact(
  account: Address,
  address: Address,
  abi: Abi,
  functionName: string,
  args: readonly unknown[] = [],
  value = 0n,
) {
  const simulation = await client.simulateContract({
    account,
    address,
    abi,
    functionName,
    args,
    value,
  });
  const wallet = createWalletClient({ chain: anvil, account, transport });
  const hash = await wallet.writeContract(simulation.request);
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success")
    throw new Error(`${functionName} reverted: ${hash}`);
  receipts.push({ functionName, hash, blockNumber: receipt.blockNumber });
  return simulation.result;
}
const signer = privateKeyToAccount(
  `0x${(40961).toString(16).padStart(64, "0")}`,
);
const owners = await client.readContract({
  address: bootstrap.safe,
  abi: iSafeAbi,
  functionName: "getOwners",
});
if (!owners.includes(signer.address))
  throw new Error("Unexpected fixture Safe owner.");
await test.setBalance({ address: signer.address, value: parseEther("1") });
// Chain 31337 contains the forked Robinhood deployments, not fresh Anvil Safe contracts.
const originSafe = { version: "1.5.0", network: "4663" } as const;
const safe = await Safe.init({
  contractNetworks: {
    "31337": {
      safeSingletonAddress: getSafeL2SingletonDeployment(originSafe)!
        .networkAddresses["4663"] as string,
      safeProxyFactoryAddress: getProxyFactoryDeployment(originSafe)!
        .networkAddresses["4663"] as string,
      multiSendAddress: getMultiSendDeployment(originSafe)!.networkAddresses[
        "4663"
      ] as string,
      multiSendCallOnlyAddress: getMultiSendCallOnlyDeployment(originSafe)!
        .networkAddresses["4663"] as string,
      fallbackHandlerAddress: getCompatibilityFallbackHandlerDeployment(
        originSafe,
      )!.networkAddresses["4663"] as string,
      signMessageLibAddress: getSignMessageLibDeployment(originSafe)!
        .networkAddresses["4663"] as string,
      createCallAddress: getCreateCallDeployment(originSafe)!.networkAddresses[
        "4663"
      ] as string,
      simulateTxAccessorAddress: getSimulateTxAccessorDeployment(originSafe)!
        .networkAddresses["4663"] as string,
    },
  },
  provider: rpc,
  signer: `0x${(40961).toString(16).padStart(64, "0")}`,
  safeAddress: bootstrap.safe,
});
if (!owners.some((a) => a.toLowerCase() === wallets[1].toLowerCase())) {
  const transaction = await safe.createAddOwnerTx({
    ownerAddress: wallets[1],
    threshold: 1,
  });
  const result = await safe.executeTransaction(transaction);
  const receipt = await client.waitForTransactionReceipt({
    hash: result.hash as `0x${string}`,
  });
  if (receipt.status !== "success")
    throw new Error("Safe owner addition reverted.");
  receipts.push({
    functionName: "addOwnerWithThreshold",
    hash: result.hash,
    blockNumber: receipt.blockNumber,
  });
}
const finalOwners = await client.readContract({
  address: bootstrap.safe,
  abi: iSafeAbi,
  functionName: "getOwners",
});
const threshold = await client.readContract({
  address: bootstrap.safe,
  abi: iSafeAbi,
  functionName: "getThreshold",
});
if (!finalOwners.includes(wallets[1]) || threshold !== 1n)
  throw new Error("Safe signer verification failed.");
const balance = (token: Address, account: Address) =>
  client.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account],
  });
const topups = await Promise.all(
  wallets.map(async (account) => ({
    account,
    usd: 2_500_000_000n - (await balance(usdg, account)),
    weth: parseEther("1.1") - (await balance(weth, account)),
    stock: await balance(amd, account),
  })),
);
const requiredUSDG = topups.reduce(
  (sum, p) => sum + (p.usd > 0n ? p.usd : 0n),
  0n,
);
if ((await balance(usdg, donor)) < requiredUSDG)
  throw new Error("Insufficient fixture USDG.");
const positions = [];
try {
  for (const account of [donor, ...wallets]) {
    await test.impersonateAccount({ address: account });
    if ((await client.getBalance({ address: account })) < parseEther("10"))
      await test.setBalance({ address: account, value: parseEther("10") });
  }
  const wrap =
    topups.reduce((sum, p) => sum + (p.weth > 0n ? p.weth : 0n), 0n) -
    (await balance(weth, donor));
  if (wrap > 0n)
    await transact(donor, weth, iWrappedNativeAbi, "deposit", [], wrap);
  for (const p of topups) {
    if (p.usd > 0n)
      await transact(donor, usdg, erc20Abi, "transfer", [p.account, p.usd]);
    if (p.weth > 0n)
      await transact(donor, weth, erc20Abi, "transfer", [p.account, p.weth]);
    const stock = await balance(amd, donor);
    if (p.stock === 0n && stock > 0n)
      await transact(donor, amd, erc20Abi, "transfer", [
        p.account,
        stock / 10n,
      ]);
  }
  for (const [name, token, price, count, engine] of [
    ["USDG Fans", usdg, 500_000_000n, 3, 1],
    ["WETH Fans", weth, parseEther("0.1"), 1, 5],
  ] as const) {
    const config = {
      creator: wallets[1],
      tierSalt: keccak256(new TextEncoder().encode(bootstrap.runId + name)),
      renderer: bootstrap.renderer,
      paymentToken: token,
      name,
      symbol: token === usdg ? "USDGF" : "WETHF",
      pricePerPeriod: price,
      minimumPayment: await client.readContract({
        address: bootstrap.factory,
        abi: membershipFactoryAbi,
        functionName: "minimumPayment",
        args: [token],
      }),
      periodDuration: 2592000n,
      protocolFeeBps: 1000,
      rewardBps: 2000,
      referralBps: 500,
      startingBoostBps: 15000,
      earlySupportGross: price * 1000n,
      supplyCap: 0n,
      maxPrepaidPeriods: 12n,
      metadata: {
        description:
          "Creator-owned memberships, funded for a month of local protocol testing.",
        externalURI: "",
      },
      art: {
        engine,
        collectionSeed: 123456789n,
        palette: 0,
        intensity: 64,
        density: 56,
        symmetry: 2,
        typographyScale: 52,
        typographyStyle: 0,
        textVisibility: 1,
        imageFit: 0,
        focalX: 50,
        focalY: 50,
        grain: 36,
        mediaMix: 0,
        primary: 52,
        secondary: 48,
        tertiary: 44,
      },
      media: {
        mime: 0,
        store: zeroAddress,
        length: 0,
        digest: `0x${"0".repeat(64)}`,
        runtimeCodehash: `0x${"0".repeat(64)}`,
      },
    };
    const tier = (await transact(
      wallets[1],
      bootstrap.factory,
      membershipFactoryAbi,
      "createTier",
      [config],
    )) as Address;
    for (const [index, account] of wallets.entries()) {
      await transact(account, token, erc20Abi, "approve", [
        tier,
        price * BigInt(count),
      ]);
      for (let i = 0; i < count; i++) {
        const id = await transact(
          account,
          tier,
          membershipTierAbi,
          "createMembership",
          [1n, wallets[1 - index], 256n],
        );
        positions.push({
          name,
          tier,
          owner: account,
          tokenId: id,
          price,
          periodSeconds: 2592000,
          protocolFunding: price / 10n,
        });
      }
    }
  }
} finally {
  for (const account of [donor, ...wallets])
    await test.stopImpersonatingAccount({ address: account });
}
const usdgProtocolFunding = positions
  .filter((p) => p.name === "USDG Fans")
  .reduce((sum, p) => sum + p.protocolFunding, 0n);
if (usdgProtocolFunding < 250_000_000n)
  throw new Error("First-month protocol funding below target.");
await writeFile(
  output,
  JSON.stringify(
    {
      runId: bootstrap.runId,
      chainId: 31337,
      safe: bootstrap.safe,
      safeOwners: finalOwners,
      safeThreshold: threshold,
      wallets,
      firstMonthUSDGProtocolFunding: usdgProtocolFunding,
      positions,
      receipts,
    },
    (_, v) => (typeof v === "bigint" ? v.toString() : v),
    2,
  ) + "\n",
);
console.log(
  `Seeded ${positions.length} memberships; ${usdgProtocolFunding / 1_000_000n} USDG first-month protocol funding; signer ${wallets[1]}.`,
);
