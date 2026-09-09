import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import {
  createPublicClient,
  http,
  erc20Abi,
  zeroAddress,
  parseEther,
  type Address,
} from "viem";
import {
  membershipFactoryAbi,
  protocolBuybackVaultAbi,
  iSafeAbi,
  membershipTierAbi,
} from "../src/contracts";
import { rehearseBuybacks, type RehearsalInput } from "./buyback-rehearsal";
import { validateAdminRpc } from "./protocol-admin";

const [bootstrapPath, outputDir] = process.argv.slice(2);
if (!bootstrapPath || !outputDir)
  throw new Error(
    "Usage: buyback-standing-acceptance.ts BOOTSTRAP OUTPUT_DIRECTORY",
  );
const rpc = process.env.BBF_ADMIN_RPC_URL ?? "";
validateAdminRpc("forknet", rpc);
const boot = JSON.parse(await readFile(bootstrapPath, "utf8"));
const client = createPublicClient({
  transport: http(rpc, { retryCount: 0, timeout: 15000 }),
  cacheTime: 0,
});
const demo = JSON.parse(
  await readFile(resolve(bootstrapPath, "../buyback-demo.json"), "utf8"),
);
const snapshot = async () => ({
  supply: await client.readContract({
    address: boot.protocolToken,
    abi: erc20Abi,
    functionName: "totalSupply",
  }),
  nonce: await client.readContract({
    address: boot.safe,
    abi: iSafeAbi,
    functionName: "nonce",
  }),
  count: await client.readContract({
    address: boot.factory,
    abi: membershipFactoryAbi,
    functionName: "tierCount",
  }),
  balance: await client.getBalance({ address: demo.owner }),
  tiers: await Promise.all(
    demo.tiers.map(async (t: { address: Address }) => ({
      address: t.address,
      creator: await client.readContract({
        address: t.address,
        abi: membershipTierAbi,
        functionName: "creatorProceeds",
      }),
      feeHoldings: await client.readContract({
        address: t.address,
        abi: membershipTierAbi,
        functionName: "protocolFeeHoldings",
      }),
    })),
  ),
  inventory: await Promise.all(
    [
      zeroAddress,
      ...demo.tiers
        .filter((t: { symbol: string }) => t.symbol !== "WETH")
        .map((t: { paymentToken: Address }) => t.paymentToken),
    ].map(async (asset) => ({
      asset,
      state: await client.readContract({
        address: boot.buybackVault,
        abi: protocolBuybackVaultAbi,
        functionName: "inventory",
        args: [asset, 0],
      }),
      revision: await client.readContract({
        address: boot.buybackVault,
        abi: protocolBuybackVaultAbi,
        functionName: "revision",
        args: [asset],
      }),
    })),
  ),
});
await mkdir(outputDir, { recursive: true });
const before = await snapshot();
const block = await client.getBlockNumber();
const input: RehearsalInput = {
  chainId: 31337,
  factory: boot.factory,
  vault: boot.buybackVault,
  capturedBlock: String(block),
  globalMinInterval: "60",
  targetPercent: 100,
  horizonHours: 1,
  maxGasPercent: 100,
  assets: [
    {
      asset: zeroAddress,
      minInput: "1",
      maxInput: parseEther("0.02").toString(),
      minInterval: "600",
    },
    ...demo.tiers
      .filter((t: { symbol: string }) => t.symbol !== "WETH")
      .map((t: { paymentToken: Address; pricePerPeriod: string }) => ({
        asset: t.paymentToken,
        minInput: "1",
        maxInput: t.pricePerPeriod,
        minInterval: "600",
      })),
  ],
};
const first = await rehearseBuybacks(rpc, input, AbortSignal.timeout(120000));
assert.ok(first.totals.batches >= 3, "Expected multiple sequential buys");
assert.ok(BigInt(first.totals.burnedRaw) > 0n);
const second = await rehearseBuybacks(rpc, input, AbortSignal.timeout(120000));
// Prices may change between calls; token output and timing must remain deterministic at the pinned snapshot.
assert.equal(second.totals.burnedRaw, first.totals.burnedRaw);
assert.deepEqual(
  second.rows.map((r) => [r.status, r.inputRaw, r.burnedRaw, r.simulatedAt]),
  first.rows.map((r) => [r.status, r.inputRaw, r.burnedRaw, r.simulatedAt]),
);
const times = first.rows
  .filter((r) => r.status === "burned")
  .map((r) => BigInt(r.simulatedAt!));
for (let i = 1; i < times.length; i++)
  assert.ok(times[i] - times[i - 1] >= 60n);
assert.deepEqual(
  await snapshot(),
  before,
  "Rehearsal changed the source chain",
);
const rejected = await rehearseBuybacks(
  rpc,
  { ...input, maxGasPercent: 0.01 },
  AbortSignal.timeout(120000),
);
assert.ok(rejected.rows.some((r) => r.status === "gas-deferred" && r.estimate));
assert.deepEqual(
  await snapshot(),
  before,
  "Rejected rehearsal changed the source chain",
);
const report = {
  input,
  first,
  second,
  rejected,
  sourceUnchanged: true,
  scope:
    "Real RPC eth_simulateV1, repeated sequential purchases, cooldowns, gas rejection; no nested fork or chain writes",
};
await writeFile(
  resolve(outputDir, "report.json"),
  JSON.stringify(
    report,
    (_, v) => (typeof v === "bigint" ? v.toString() : v),
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({
    batches: first.totals.batches,
    burnedRaw: first.totals.burnedRaw,
    sourceUnchanged: true,
    repeatable: true,
  }),
);
