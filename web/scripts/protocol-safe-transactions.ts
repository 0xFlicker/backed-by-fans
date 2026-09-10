import { anvil } from "viem/chains";
import {
  createPublicClient,
  createWalletClient,
  http,
  concatHex,
  decodeEventLog,
  decodeFunctionData,
  encodeFunctionData,
  toEventSelector,
  zeroAddress,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  iSafeAbi,
  membershipFactoryAbi,
  protocolBuybackVaultAbi,
} from "../src/contracts";
import { readAdminContext, validateAdminRpc } from "./protocol-admin";

type PreparedPayload = {
  chainId: number;
  safe: Hex;
  safeNonce: string;
  to: Hex;
  data: Hex;
  value: string;
  operation: number;
  targetVersion: string;
  targetCodeHash: Hex;
  safeTxGas: string;
  baseGas: string;
  gasPrice: string;
  gasToken: Hex;
  refundReceiver: Hex;
  previousRevision?: string | null;
  expectedRevision?: string | null;
};

/// Local harness only. viem owns signing, simulation, submission and receipt/replacement handling.
/// A failed or unknown transaction outcome is thrown, never automatically resubmitted.
export async function executeForkSafePayload(input: {
  rpcUrl: string;
  factory: Hex;
  payload: PreparedPayload;
  signerKeys: readonly Hex[];
  relayerKey: Hex;
}) {
  validateAdminRpc("forknet", input.rpcUrl);
  const client = createPublicClient({
    chain: anvil,
    transport: http(input.rpcUrl, { retryCount: 0 }),
  });
  const relayer = privateKeyToAccount(input.relayerKey);
  const wallet = createWalletClient({
    chain: anvil,
    account: relayer,
    transport: http(input.rpcUrl, { retryCount: 0 }),
  });
  const context = await readAdminContext(client, 31337, input.factory);
  const payload = input.payload;
  if (
    payload.chainId !== 31337 ||
    payload.safe.toLowerCase() !== context.safe.toLowerCase() ||
    BigInt(payload.safeNonce) !== context.safeNonce ||
    payload.operation !== 0 ||
    payload.value !== "0" ||
    payload.baseGas !== "0" ||
    payload.gasPrice !== "0" ||
    payload.gasToken !== zeroAddress ||
    payload.refundReceiver !== zeroAddress ||
    payload.targetVersion !== context.version ||
    payload.safeTxGas !== "2000000"
  )
    throw new Error("Stale or forbidden Safe payload");
  const registry = payload.to.toLowerCase() === context.factory.toLowerCase();
  if (!registry && payload.to.toLowerCase() !== context.vault.toLowerCase())
    throw new Error("Unrecognized Safe target");
  if (
    payload.targetCodeHash !==
    (registry ? context.factoryCodeHash : context.vaultCodeHash)
  )
    throw new Error("Target code changed");
  const abi = registry ? membershipFactoryAbi : protocolBuybackVaultAbi;
  const decoded = decodeFunctionData({ abi, data: payload.data });
  if (
    !(
      registry
        ? ["setPaymentTokenEnabled", "setMinimumPayment"]
        : [
            "setRoute",
            "setLimits",
            "setGlobalMinInterval",
            "setBuybacksPaused",
            "setAssetBuybacksPaused",
          ]
    ).includes(decoded.functionName)
  )
    throw new Error("Unsupported configuration call");
  if (
    decoded.functionName === "setRoute" ||
    decoded.functionName === "setLimits"
  ) {
    const revision = await client.readContract({
      address: context.vault,
      abi: protocolBuybackVaultAbi,
      functionName: "revision",
      args: [decoded.args[0]],
      blockNumber: context.blockNumber,
    });
    if (
      payload.previousRevision !== revision.toString() ||
      payload.expectedRevision !== (revision + 1n).toString()
    )
      throw new Error("Stale configuration revision");
  }
  const threshold = await client.readContract({
    address: context.safe,
    abi: iSafeAbi,
    functionName: "getThreshold",
    blockNumber: context.blockNumber,
  });
  const owners = await client.readContract({
    address: context.safe,
    abi: iSafeAbi,
    functionName: "getOwners",
    blockNumber: context.blockNumber,
  });
  if (threshold < 1n || BigInt(input.signerKeys.length) !== threshold)
    throw new Error("Signer count must satisfy the Safe threshold");
  const signers = input.signerKeys
    .map((key) => privateKeyToAccount(key))
    .sort((a, b) => (BigInt(a.address) < BigInt(b.address) ? -1 : 1));
  if (
    new Set(signers.map((s) => s.address.toLowerCase())).size !==
      signers.length ||
    signers.some(
      (account) =>
        !owners.some(
          (owner) => owner.toLowerCase() === account.address.toLowerCase(),
        ),
    )
  )
    throw new Error("Signers do not satisfy the test Safe threshold");
  const common = [
    payload.to,
    0n,
    payload.data,
    0,
    2000000n,
    0n,
    0n,
    zeroAddress,
    zeroAddress,
  ] as const;
  const safeTransactionHash = await client.readContract({
    address: context.safe,
    abi: iSafeAbi,
    functionName: "getTransactionHash",
    args: [...common, context.safeNonce],
  });
  const signatures = concatHex(
    await Promise.all(
      signers.map((account) => account.sign({ hash: safeTransactionHash })),
    ),
  );
  const simulation = await client.simulateContract({
    address: context.safe,
    abi: iSafeAbi,
    functionName: "execTransaction",
    args: [...common, signatures],
    account: relayer,
    gasPrice: 2000000000n,
  });
  if (!simulation.result)
    throw new Error("Safe simulation reported an inner failure");
  const hash = await wallet.writeContract(simulation.request);
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success")
    throw new Error("Safe transaction reverted");
  let inner: "ExecutionSuccess" | "ExecutionFailure" | undefined;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== context.safe.toLowerCase()) continue;
    if (
      !iSafeAbi.some(
        (item) =>
          item.type === "event" && toEventSelector(item) === log.topics[0],
      )
    )
      continue;
    const event = decodeEventLog({
      abi: iSafeAbi,
      data: log.data,
      topics: log.topics,
      strict: false,
    });
    if (
      (event.eventName === "ExecutionSuccess" ||
        event.eventName === "ExecutionFailure") &&
      event.args.txHash === safeTransactionHash
    )
      inner = event.eventName;
  }
  if (inner !== "ExecutionSuccess")
    throw new Error(`Safe inner outcome: ${inner ?? "missing"}`);
  const blockNumber = receipt.blockNumber;
  const nonceAfter = await client.readContract({
    address: context.safe,
    abi: iSafeAbi,
    functionName: "nonce",
    blockNumber,
  });
  if (nonceAfter !== context.safeNonce + 1n)
    throw new Error("Unexpected Safe nonce after execution");
  if (
    decoded.functionName === "setRoute" ||
    decoded.functionName === "setLimits"
  ) {
    const revision = await client.readContract({
      address: context.vault,
      abi: protocolBuybackVaultAbi,
      functionName: "revision",
      args: [decoded.args[0]],
      blockNumber,
    });
    if (revision.toString() !== payload.expectedRevision)
      throw new Error("Configuration revision postcondition failed");
  }
  // Verify the configuration named by the supplied receipt against canonical state.
  if (decoded.functionName === "setPaymentTokenEnabled") {
    const [token, expected] = decoded.args;
    const enabled = await client.readContract({
      address: context.factory,
      abi: membershipFactoryAbi,
      functionName: "isPaymentTokenEnabled",
      args: [token],
      blockNumber,
    });
    if (enabled !== expected)
      throw new Error("Token eligibility postcondition failed");
  } else if (decoded.functionName === "setMinimumPayment") {
    const [token, expected] = decoded.args;
    const observed = await client.readContract({
      address: context.factory,
      abi: membershipFactoryAbi,
      functionName: "minimumPayment",
      args: [token],
      blockNumber,
    });
    if (observed !== expected)
      throw new Error("Minimum payment postcondition failed");
  } else if (decoded.functionName === "setRoute") {
    const [asset] = decoded.args;
    const route = await client.readContract({
      address: context.vault,
      abi: protocolBuybackVaultAbi,
      functionName: "route",
      args: [asset],
      blockNumber,
    });
    if (
      encodeFunctionData({
        abi: protocolBuybackVaultAbi,
        functionName: "setRoute",
        args: [asset, route],
      }) !== payload.data
    )
      throw new Error("Route postcondition failed");
  } else if (decoded.functionName === "setLimits") {
    const [asset] = decoded.args;
    const limits = await client.readContract({
      address: context.vault,
      abi: protocolBuybackVaultAbi,
      functionName: "limits",
      args: [asset],
      blockNumber,
    });
    if (
      encodeFunctionData({
        abi: protocolBuybackVaultAbi,
        functionName: "setLimits",
        args: [asset, limits],
      }) !== payload.data
    )
      throw new Error("Limits postcondition failed");
  } else if (decoded.functionName === "setGlobalMinInterval") {
    const interval = await client.readContract({
      address: context.vault,
      abi: protocolBuybackVaultAbi,
      functionName: "globalMinInterval",
      blockNumber,
    });
    if (interval !== decoded.args[0])
      throw new Error("Global interval postcondition failed");
  } else if (decoded.functionName === "setBuybacksPaused") {
    if (
      (await client.readContract({
        address: context.vault,
        abi: protocolBuybackVaultAbi,
        functionName: "buybacksPaused",
        blockNumber,
      })) !== decoded.args[0]
    )
      throw new Error("Global pause postcondition failed");
  } else if (decoded.functionName === "setAssetBuybacksPaused") {
    if (
      (await client.readContract({
        address: context.vault,
        abi: protocolBuybackVaultAbi,
        functionName: "assetBuybacksPaused",
        args: [decoded.args[0]],
        blockNumber,
      })) !== decoded.args[1]
    )
      throw new Error("Asset pause postcondition failed");
  }
  return {
    hash,
    safeTransactionHash,
    receipt,
    safe: context.safe,
    nonceBefore: context.safeNonce,
    nonceAfter,
    inner,
    decoded,
  };
}
