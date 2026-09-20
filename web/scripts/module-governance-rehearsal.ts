import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createPublicClient,
  createTestClient,
  http,
  BaseError,
  ContractFunctionRevertedError,
  type Address,
  type Hex,
} from "viem";
import { anvil } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { protocolBuybackVaultAbi } from "../src/contracts";
import {
  readAdminContext,
  prepareModulePayload,
  prepareBuybackPayload,
  validateAdminRpc,
} from "./protocol-admin";
import { executeForkSafePayload } from "./protocol-safe-transactions";

// Disposable fork only. Every governance mutation and time jump is restored.
const [evidence] = process.argv.slice(2);
if (!evidence)
  throw new Error("Usage: module-governance-rehearsal.ts EVIDENCE_DIR");
const rpcUrl = process.env.BBF_ADMIN_RPC_URL ?? "";
validateAdminRpc("forknet", rpcUrl);
const transport = http(rpcUrl, { retryCount: 0 });
const client = createPublicClient({ chain: anvil, transport });
const node = createTestClient({ chain: anvil, mode: "anvil", transport });
if ((await client.getChainId()) !== 31337)
  throw new Error("Disposable chain required");
const bootstrap = JSON.parse(
  await readFile(resolve(evidence, "bootstrap.json"), "utf8"),
);
const factory = bootstrap.factory as Address;
const key = `0x${(40961).toString(16).padStart(64, "0")}` as Hex;
const signer = privateKeyToAccount(key);
const initial = await readAdminContext(client, 31337, factory);
const initialPause = await client.readContract({
  address: initial.vault,
  abi: protocolBuybackVaultAbi,
  functionName: "buybacksPaused",
});
const snapshot = await node.snapshot();
const receipts: {
  action: string;
  hash: Hex;
  block: string;
  receipt: unknown;
}[] = [];
const rejections: { action: string; error: string }[] = [];
const delays: {
  action: string;
  proposedAt: bigint;
  readyAt: bigint;
  seconds: bigint;
}[] = [];
const read = (
  functionName:
    | "moduleRevision"
    | "moduleActivationAt"
    | "moduleFreezeAt"
    | "moduleReplacementFrozen"
    | "buybacksPaused",
) =>
  client.readContract({
    address: initial.vault,
    abi: protocolBuybackVaultAbi,
    functionName,
  });
async function prepare(action: Parameters<typeof prepareModulePayload>[2]) {
  const context = await readAdminContext(client, 31337, factory);
  return prepareModulePayload(client, context, action, {
    expectedSafeNonceRaw: context.safeNonce.toString(),
    expectedModuleRevisionRaw: String(await read("moduleRevision")),
    ...(action === "module-propose" ? { candidate: context.activeModule } : {}),
  });
}
async function execute(action: Parameters<typeof prepareModulePayload>[2]) {
  const payload = await prepare(action);
  const result = await executeForkSafePayload({
    rpcUrl,
    factory,
    payload,
    signerKeys: [key],
    relayerKey: key,
  });
  receipts.push({
    action,
    hash: result.hash,
    block: result.receipt.blockNumber.toString(),
    receipt: result.receipt,
  });
  if (action === "module-propose" || action === "module-freeze-propose") {
    const proposedAt = (
      await client.getBlock({ blockNumber: result.receipt.blockNumber })
    ).timestamp;
    const readyAt = BigInt(
      await read(
        action === "module-propose" ? "moduleActivationAt" : "moduleFreezeAt",
      ),
    );
    const seconds = action === "module-propose" ? 172800n : 604800n;
    if (readyAt !== proposedAt + seconds)
      throw new Error("Governance delay mismatch");
    delays.push({ action, proposedAt, readyAt, seconds });
  }
}
async function rejects(
  action: Parameters<typeof prepareModulePayload>[2],
  expectedError: string,
) {
  let rejected = false;
  try {
    await prepare(action);
  } catch (error) {
    const cause =
      error instanceof BaseError
        ? error.walk((item) => item instanceof ContractFunctionRevertedError)
        : undefined;
    if (
      !(cause instanceof ContractFunctionRevertedError) ||
      cause.data?.errorName !== expectedError
    )
      throw error;
    rejected = true;
  }
  if (!rejected) throw new Error(`Expected rejection: ${action}`);
  rejections.push({ action, error: expectedError });
}
try {
  await node.setBalance({ address: signer.address, value: 10n ** 19n });
  const pausePayload = await prepareBuybackPayload(client, initial, "pause", {
    expectedSafeNonceRaw: initial.safeNonce.toString(),
    paused: true,
  });
  const pause = await executeForkSafePayload({
    rpcUrl,
    factory,
    payload: pausePayload,
    signerKeys: [key],
    relayerKey: key,
  });
  receipts.push({
    action: "pause",
    hash: pause.hash,
    block: pause.receipt.blockNumber.toString(),
    receipt: pause.receipt,
  });
  await execute("module-propose");
  await rejects("module-activate", "DelayNotElapsed");
  await rejects("module-freeze-propose", "PendingGovernanceAction");
  await execute("module-cancel");
  await execute("module-propose");
  await node.setNextBlockTimestamp({
    timestamp: BigInt(await read("moduleActivationAt")),
  });
  await node.mine({ blocks: 1 });
  await execute("module-activate");
  if (
    (await read("moduleRevision")) !== 2n ||
    (await read("buybacksPaused")) !== true
  )
    throw new Error("Activation identity/pause mismatch");
  await execute("module-freeze-propose");
  await rejects("module-propose", "PendingGovernanceAction");
  await rejects("module-freeze-finalize", "DelayNotElapsed");
  await execute("module-freeze-cancel");
  await execute("module-freeze-propose");
  await node.setNextBlockTimestamp({
    timestamp: BigInt(await read("moduleFreezeAt")),
  });
  await node.mine({ blocks: 1 });
  await execute("module-freeze-finalize");
  if ((await read("moduleReplacementFrozen")) !== true)
    throw new Error("Freeze not finalized");
  await rejects("module-propose", "ModuleReplacementFrozen");
  await rejects("module-freeze-cancel", "ModuleReplacementFrozen");
} finally {
  await node.revert({ id: snapshot });
}
if (
  (await read("moduleRevision")) !== 1n ||
  (await read("moduleReplacementFrozen")) !== false ||
  (await read("buybacksPaused")) !== initialPause
)
  throw new Error("Review snapshot restoration failed");
await writeFile(
  resolve(evidence, "module-governance-rehearsal.json"),
  JSON.stringify(
    {
      scope:
        "local Safe transactions, snapshot restored; not public deployment",
      receipts,
      delays,
      rejections,
      restored: {
        moduleRevision: 1,
        moduleReplacementFrozen: false,
        buybacksPaused: initialPause,
      },
    },
    (_, value) => (typeof value === "bigint" ? value.toString() : value),
    2,
  ) + "\n",
);
console.log(
  "Module replacement/freeze Safe rehearsal passed; original review state restored.",
);
