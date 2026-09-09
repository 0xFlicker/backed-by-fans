import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  createTestClient,
  encodeFunctionData,
  getAddress,
  http,
  isAddressEqual,
  zeroAddress,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { anvil } from "viem/chains";
import { iSafeAbi } from "../src/contracts";
import { readAdminContext, validateAdminRpc } from "./protocol-admin";

// One-time, local-only handoff from the known disposable deployment signer.
const [evidence, recipientArg] = process.argv.slice(2);
if (!evidence || !recipientArg)
  throw new Error(
    "Usage: handoff-fork-safe.ts EVIDENCE_DIR PUBLIC_OWNER_ADDRESS",
  );
const recipient = getAddress(recipientArg);
const rpc = process.env.BBF_ADMIN_RPC_URL ?? "";
validateAdminRpc("forknet", rpc);
const transport = http(rpc, { retryCount: 0 });
const client = createPublicClient({ chain: anvil, transport });
const node = createTestClient({ chain: anvil, transport, mode: "anvil" });
const path = resolve(evidence, "bootstrap.json");
const bootstrap = JSON.parse(await readFile(path, "utf8"));
const context = await readAdminContext(client, 31337, bootstrap.factory);
const account = privateKeyToAccount(
  `0x${(40961).toString(16).padStart(64, "0")}`,
);
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
if (
  threshold !== 1n ||
  owners.length !== 1 ||
  !isAddressEqual(owners[0], account.address)
)
  throw new Error(
    "Handoff requires the untouched one-owner disposable fixture Safe",
  );
if (
  isAddressEqual(recipient, account.address) ||
  isAddressEqual(recipient, zeroAddress) ||
  isAddressEqual(recipient, context.safe)
)
  throw new Error("Choose a new wallet owner");
const data = encodeFunctionData({
  abi: iSafeAbi,
  functionName: "swapOwner",
  args: [
    "0x0000000000000000000000000000000000000001",
    account.address,
    recipient,
  ],
});
const fields = [
  context.safe,
  0n,
  data,
  0,
  200000n,
  0n,
  0n,
  zeroAddress,
  zeroAddress,
] as const;
const safeHash = await client.readContract({
  address: context.safe,
  abi: iSafeAbi,
  functionName: "getTransactionHash",
  args: [...fields, context.safeNonce],
});
const signature = await account.sign({ hash: safeHash });
await node.setBalance({ address: account.address, value: 10n ** 18n });
const wallet = createWalletClient({ chain: anvil, transport, account });
const simulation = await client.simulateContract({
  address: context.safe,
  abi: iSafeAbi,
  functionName: "execTransaction",
  args: [...fields, signature as Hex],
  account,
});
if (!simulation.result) throw new Error("Safe handoff simulation failed");
const receipt = await client.waitForTransactionReceipt({
  hash: await wallet.writeContract(simulation.request),
});
if (receipt.status !== "success") throw new Error("Safe handoff reverted");
const finalOwners = await client.readContract({
  address: context.safe,
  abi: iSafeAbi,
  functionName: "getOwners",
  blockNumber: receipt.blockNumber,
});
if (finalOwners.length !== 1 || !isAddressEqual(finalOwners[0], recipient))
  throw new Error("Safe owner postcondition failed");
bootstrap.safeOwners = finalOwners;
await writeFile(path, JSON.stringify(bootstrap, null, 2) + "\n");
await writeFile(
  resolve(evidence, "owner-handoff.json"),
  JSON.stringify(
    {
      safe: context.safe,
      owner: recipient,
      threshold: 1,
      transactionHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber.toString(),
    },
    null,
    2,
  ) + "\n",
  { flag: "wx" },
);
console.log(`Local Safe ${context.safe} now has one owner: ${recipient}`);
