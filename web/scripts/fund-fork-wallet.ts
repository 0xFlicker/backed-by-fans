import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  erc20Abi,
  getAddress,
  http,
  parseEther,
  formatUnits,
} from "viem";
import { anvil } from "viem/chains";
import manifest from "../../contracts/external/verification/4663/sources.json";
import { iWrappedNativeAbi } from "../src/contracts";
import { readAdminContext, validateAdminRpc } from "./protocol-admin";

// Transfer real fork assets from the funded browser fixture; never modify token storage.
const [recipientArg, evidence] = process.argv.slice(2);
if (!recipientArg || !evidence)
  throw new Error(
    "Usage: bun scripts/fund-fork-wallet.ts ADDRESS EVIDENCE_DIRECTORY",
  );
const recipient = getAddress(recipientArg);
const rpc = process.env.BBF_ADMIN_RPC_URL ?? "http://127.0.0.1:18557";
validateAdminRpc("forknet", rpc);
const transport = http(rpc, { retryCount: 0 });
const client = createPublicClient({ chain: anvil, transport });
if ((await client.getChainId()) !== anvil.id)
  throw new Error("Funding is restricted to the local Anvil chain (31337).");
const bootstrap = JSON.parse(
  await readFile(resolve(evidence, "bootstrap.json"), "utf8"),
);
await readAdminContext(client, anvil.id, bootstrap.factory);
const donor = getAddress("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
if (recipient === donor)
  throw new Error("Choose a wallet other than the fixture donor.");
const wallet = createWalletClient({ chain: anvil, transport, account: donor });
const test = createTestClient({ chain: anvil, mode: "anvil", transport });
const assets = [
  {
    symbol: "USDG",
    address: getAddress("0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168"),
    amount: 100_000_000n,
  },
  {
    symbol: "AMD",
    address: getAddress("0x86923f96303D656E4aa86D9d42D1e57ad2023fdC"),
    amount: parseEther("0.1"),
  },
];
// Check all reserves before changing any balances.
for (const asset of assets) {
  const balance = await client.readContract({
    address: asset.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [donor],
  });
  if (balance < asset.amount) asset.amount = balance / 2n;
  if (asset.amount === 0n)
    throw new Error(
      `Fixture donor lacks ${asset.symbol}; prepare a fresh fork fixture before funding.`,
    );
}
const funding: Record<string, unknown>[] = [];
await test.setBalance({
  address: recipient,
  value: (await client.getBalance({ address: recipient })) + parseEther("10"),
});
await test.setBalance({
  address: donor,
  value: (await client.getBalance({ address: donor })) + parseEther("2"),
});
const weth = getAddress(manifest.records.weth.address);
const wrap = await client.simulateContract({
  account: donor,
  address: weth,
  abi: iWrappedNativeAbi,
  functionName: "deposit",
  value: parseEther("1"),
});
const wrapHash = await wallet.writeContract(wrap.request);
if (
  (await client.waitForTransactionReceipt({ hash: wrapHash })).status !==
  "success"
)
  throw new Error(`Wrapping reverted: ${wrapHash}`);
for (const asset of [
  ...assets,
  { symbol: "WETH", address: weth, amount: parseEther("1") },
]) {
  const before = await client.readContract({
    address: asset.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [recipient],
  });
  const transfer = await client.simulateContract({
    account: donor,
    address: asset.address,
    abi: erc20Abi,
    functionName: "transfer",
    args: [recipient, asset.amount],
  });
  const hash = await wallet.writeContract(transfer.request);
  if ((await client.waitForTransactionReceipt({ hash })).status !== "success")
    throw new Error(`Transfer reverted: ${hash}`);
  const after = await client.readContract({
    address: asset.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [recipient],
  });
  if (after - before !== asset.amount)
    throw new Error(`Unexpected ${asset.symbol} balance after ${hash}`);
  const decimals = await client.readContract({
    address: asset.address,
    abi: erc20Abi,
    functionName: "decimals",
  });
  console.log(
    `${asset.symbol}: added ${formatUnits(asset.amount, decimals)}; balance ${formatUnits(after, decimals)}; transaction ${hash}`,
  );
  funding.push({
    symbol: asset.symbol,
    address: asset.address,
    addedRaw: asset.amount.toString(),
    balanceRaw: after.toString(),
    decimals,
    transactionHash: hash,
  });
}
await writeFile(
  resolve(evidence, `wallet-funding-${recipient.toLowerCase()}.json`),
  JSON.stringify(
    {
      chainId: 31337,
      wallet: recipient,
      ethBalanceWei: (
        await client.getBalance({ address: recipient })
      ).toString(),
      assets: funding,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Added 10 local ETH to ${recipient}. Execution chain: 31337. No live funds used.`,
);
