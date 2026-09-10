import { anvil } from "viem/chains";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  createTestClient,
  http,
  zeroAddress,
  type Address,
  type Hex,
  type Abi,
  type LocalAccount,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import Ajv from "ajv";
import schema from "../../scripts/protocol-fork/manifest.schema.json";
import { executeForkSafePayload } from "./protocol-safe-transactions";
import {
  readAdminContext,
  preparePaymentTokenPayload,
  prepareMinimumPaymentPayload,
  prepareBuybackPayload,
  validateAdminRpc,
} from "./protocol-admin";
import { readPonsCompensation } from "../src/features/protocol/pons-read";
import {
  iPonsBondingCurveAbi,
  iPonsMemeHookAbi,
  iPonsBuybackVaultAbi,
  iPonsFeeEscrowAbi,
} from "../src/contracts";

// Run by the disposable local harness after its actual Foundry broadcast. This
// proves launch/native compensation/configuration only, never complete acceptance.
export async function main() {
  const [bootstrapPath, evidenceDir] = process.argv.slice(2);
  if (!bootstrapPath || !evidenceDir)
    throw new Error(
      "Usage: launch-safe-checkpoint.ts BOOTSTRAP_JSON EVIDENCE_DIR",
    );
  const rpcUrl = process.env.BBF_ADMIN_RPC_URL ?? "";
  validateAdminRpc("forknet", rpcUrl);
  const bootstrap = JSON.parse(await readFile(bootstrapPath, "utf8"));
  const validate = new Ajv({ strict: true }).compile<{
    factory: Address;
    protocolToken: Address;
    curve: Address;
    safeThreshold: number;
  }>({ $ref: "#/definitions/bootstrap", definitions: schema.definitions });
  if (!validate(bootstrap))
    throw new Error(
      `Invalid bootstrap fragment: ${JSON.stringify(validate.errors)}`,
    );
  const client = createPublicClient({
    chain: anvil,
    transport: http(rpcUrl, { retryCount: 0 }),
  });
  const test = createTestClient({
    chain: anvil,
    mode: "anvil",
    transport: http(rpcUrl, { retryCount: 0 }),
  });
  const factory = bootstrap.factory as Address;
  const token = bootstrap.protocolToken as Address;
  const curve = bootstrap.curve as Address;
  const developer = privateKeyToAccount(
    process.env.BBF_CHECKPOINT_DEVELOPER_KEY as Hex,
  );
  const relayerKey = process.env.BBF_CHECKPOINT_RELAYER_KEY as Hex;
  const relayer = privateKeyToAccount(relayerKey);
  const signerKeys = [
    process.env.BBF_CHECKPOINT_SAFE_KEY_A,
    process.env.BBF_CHECKPOINT_SAFE_KEY_B,
  ].slice(0, bootstrap.safeThreshold) as Hex[];
  await mkdir(resolve(evidenceDir, "transactions"), { recursive: true });
  await test.setBalance({ address: relayer.address, value: 20n * 10n ** 18n });
  const receipts: unknown[] = [];
  let sequence = 0;
  const retain = async (
    kind: string,
    evidenceClass: string,
    value: unknown,
  ) => {
    const path = `transactions/${String(++sequence).padStart(3, "0")}-${kind}.json`;
    await writeFile(
      resolve(evidenceDir, path),
      JSON.stringify(
        { kind, evidenceClass, ...(value as object) },
        (_, item) => (typeof item === "bigint" ? item.toString() : item),
        2,
      ) + "\n",
    );
    receipts.push({ kind, evidenceClass, path });
    console.log(`Verified ${kind}`);
  };
  const configure = async (
    action: string,
    input?: unknown,
    paymentToken?: Address,
  ) => {
    const context = await readAdminContext(client, 31337, factory);
    const payload = paymentToken
      ? action === "minimum"
        ? await prepareMinimumPaymentPayload(
            client,
            context,
            paymentToken,
            input as bigint,
          )
        : await preparePaymentTokenPayload(client, context, paymentToken, true)
      : await prepareBuybackPayload(client, context, action, {
          ...(input as object),
          expectedSafeNonceRaw: context.safeNonce.toString(),
        });
    const result = await executeForkSafePayload({
      rpcUrl,
      factory,
      payload,
      signerKeys,
      relayerKey,
    });
    await retain(`safe-${action}`, "authentic-fork", { payload, ...result });
  };
  const usdg = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" as Address;
  const amd = "0x86923f96303D656E4aa86D9d42D1e57ad2023fdC" as Address;
  const weth = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73" as Address;
  for (const paymentToken of [amd, weth, token]) {
    // The launch token is fixture-only onboarding, outside the supported currency calibration.
    await configure(
      "minimum",
      paymentToken === amd
        ? 2_000_000_000_000_000n
        : paymentToken === weth
          ? 410_000_000_000_000n
          : 1n,
      paymentToken,
    );
    await configure("onboard", undefined, paymentToken);
  }
  const usdPool = {
    currency0: zeroAddress,
    currency1: usdg,
    fee: 100,
    tickSpacing: 1,
    hooks: zeroAddress,
  };
  const amdPool = {
    currency0: usdg,
    currency1: amd,
    fee: 10000,
    tickSpacing: 200,
    hooks: zeroAddress,
  };
  for (const [asset, pools] of [
    [zeroAddress, []],
    [usdg, [usdPool]],
    [amd, [amdPool, usdPool]],
  ] as const) {
    await configure("route", { asset, expectedRevisionRaw: "0", pools });
  }
  // Standing fixture settings persist until explicitly changed by the Safe.
  for (const [asset, cap] of [
    [zeroAddress, 10n ** 15n],
    [usdg, 2400000n],
    [amd, 5n * 10n ** 15n],
  ] as const) {
    await configure("limits", {
      asset,
      expectedRevisionRaw: "1",
      limits: { minInput: "1", maxInput: cap.toString(), minInterval: "0" },
    });
  }
  await configure("pause", { paused: false });
  await configure("asset-pause", { asset: usdg, paused: true });
  await configure("asset-pause", { asset: usdg, paused: false });
  if (process.env.BBF_FORK_SINGLE_OWNER === "true") {
    console.log(
      "Manual fork: standing settings ready; compensation time-travel reserved for acceptance mode.",
    );
    return;
  }
  const transact = async (
    account: LocalAccount | Address,
    contract: Address,
    abi: Abi,
    functionName: string,
    args: readonly unknown[],
    kind: string,
    evidenceClass: string,
  ) => {
    const wallet = createWalletClient({
      chain: anvil,
      account,
      transport: http(rpcUrl, { retryCount: 0 }),
    });
    const simulation = await client.simulateContract({
      address: contract,
      abi,
      functionName,
      args,
      account,
      gasPrice: 2000000000n,
    });
    const hash = await wallet.writeContract(simulation.request);
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`${kind} reverted`);
    await retain(kind, evidenceClass, { hash, receipt });
  };
  const state = await readPonsCompensation(client, {
    chainId: 31337,
    protocolToken: token,
  });
  if (state.status !== "valid")
    throw new Error("External launch snapshot unavailable");
  const before = state.data;
  const supplyBefore = await client.readContract({
    address: token,
    abi: bindingsERC20,
    functionName: "totalSupply",
  });
  const earmark = before.bondingPending.buybackEarmark;
  if (earmark === 0n) throw new Error("No authentic pending native buyback");
  const [tokenReserve, quoteReserve] = await Promise.all([
    client.readContract({
      address: curve,
      abi: iPonsBondingCurveAbi,
      functionName: "tokenReserve",
    }),
    client.readContract({
      address: curve,
      abi: iPonsBondingCurveAbi,
      functionName: "quoteReserve",
    }),
  ]);
  const floor = (earmark * tokenReserve) / (quoteReserve + earmark);
  const operator = await client.readContract({
    address: before.hook,
    abi: iPonsMemeHookAbi,
    functionName: "feeSweepOperator",
  });
  await test.setBalance({ address: operator, value: 10n ** 18n });
  await test.impersonateAccount({ address: operator });
  try {
    await transact(
      operator,
      curve,
      iPonsBondingCurveAbi,
      "sweepFees",
      [floor],
      "native-bonding-sweep",
      "simulated-external-participant",
    );
  } finally {
    await test.stopImpersonatingAccount({ address: operator });
  }
  const deposited = await client.readContract({
    address: before.vault,
    abi: iPonsBuybackVaultAbi,
    functionName: "totalLocked",
    args: [token],
  });
  if (deposited < floor)
    throw new Error("Native sweep did not create a real vesting deposit");
  await transact(
    developer,
    before.escrow,
    iPonsFeeEscrowAbi,
    "claim",
    [],
    "developer-native-claim",
    "authentic-fork",
  );
  await test.increaseTime({ seconds: Number(before.vesting.duration / 2n) });
  await test.mine({ blocks: 1 });
  await transact(
    developer,
    before.vault,
    iPonsBuybackVaultAbi,
    "release",
    [token],
    "partial-vesting-release",
    "authentic-fork",
  );
  await transact(
    developer,
    before.escrow,
    iPonsFeeEscrowAbi,
    "claimToken",
    [token],
    "developer-vested-token-claim",
    "authentic-fork",
  );
  await test.increaseTime({ seconds: Number(before.vesting.duration) });
  await test.mine({ blocks: 1 });
  const protocol =
    before.vesting.protocol === zeroAddress
      ? await client.readContract({
          address: curve,
          abi: iPonsBondingCurveAbi,
          functionName: "protocolFeeRecipient",
        })
      : before.vesting.protocol;
  await test.setBalance({ address: protocol, value: 10n ** 18n });
  await test.impersonateAccount({ address: protocol });
  try {
    await transact(
      protocol,
      before.vault,
      iPonsBuybackVaultAbi,
      "release",
      [token],
      "final-vesting-release",
      "simulated-external-participant",
    );
  } finally {
    await test.stopImpersonatingAccount({ address: protocol });
  }
  const after = await readPonsCompensation(client, {
    chainId: 31337,
    protocolToken: token,
  });
  if (
    after.status !== "valid" ||
    after.data.vesting.released !== deposited ||
    after.data.vesting.unvested !== 0n
  )
    throw new Error("Vesting conservation failed");
  const supplyAfter = await client.readContract({
    address: token,
    abi: bindingsERC20,
    functionName: "totalSupply",
  });
  if (supplyAfter !== supplyBefore)
    throw new Error("Native vesting unexpectedly changed token supply");
  await writeFile(
    resolve(evidenceDir, "checkpoint.json"),
    JSON.stringify(
      {
        scope: "launch-safe-native-compensation-checkpoint",
        status: "passed",
        completeProtocolAcceptance: false,
        bootstrap,
        receipts,
        before: state,
        after,
        supplyBefore,
        supplyAfter,
        notes: [
          "Pons operator and other vesting beneficiary participation are explicitly simulated.",
          "Vesting is not a membership burn.",
          "The initial 15-minute policy is expired after intentional vesting time travel.",
        ],
      },
      (_, x) => (typeof x === "bigint" ? x.toString() : x),
      2,
    ) + "\n",
  );
}
import { erc20Abi as bindingsERC20 } from "viem";
