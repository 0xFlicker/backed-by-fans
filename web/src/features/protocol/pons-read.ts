import {
  encodeAbiParameters,
  keccak256,
  zeroAddress,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import {
  iPonsBondingCurveAbi,
  iPonsBuybackVaultAbi,
  iPonsFeeEscrowAbi,
  iPonsLaunchFactoryAbi,
  iPonsLauncherTokenAbi,
  iPonsMemeHookAbi,
} from "@/contracts";
import { classifyReadError, type ReadState } from "@/lib/read-state";

type Context = {
  chainId: number;
  protocolToken: Address;
  blockNumber?: bigint;
};
export type PonsCompensation = {
  factory: Address;
  curve: Address;
  vault: Address;
  escrow: Address;
  hook: Address;
  externalOwner: Address;
  sweepOperator: Address;
  creator: Address;
  launchDeveloper: Address;
  phase: number;
  curveReady: boolean;
  buybackEnabled: boolean;
  pendingRecipientOverride: {
    recipient: Address;
    effectiveAt: bigint;
    expiresAt: bigint;
  };
  bondingPending: {
    tradingFees: bigint;
    buybackEarmark: bigint;
    creatorExtraTax: bigint;
  };
  poolPending: readonly {
    currency: Address;
    tradingFees: bigint;
    buybackEarmark: bigint;
    creatorExtraTax: bigint;
  }[];
  vesting: {
    deposited: bigint;
    released: bigint;
    vested: bigint;
    unvested: bigint;
    releasable: bigint;
    start: bigint;
    duration: bigint;
    creator: Address;
    protocol: Address;
    protocolShareBps: number;
  };
  // Pons's escrow is shared across launches. These balances and native claims
  // cannot honestly be attributed to a single launch, or to BBF membership fees.
  creatorEscrow: {
    nativeETH: bigint;
    protocolTokens: bigint;
    scope: "shared-recipient-ledger";
  };
  protocolEscrow: {
    nativeETH: bigint;
    protocolTokens: bigint;
    scope: "shared-recipient-ledger";
  };
};

export async function readPonsCompensation(
  client: PublicClient,
  context: Context,
): Promise<ReadState<PonsCompensation>> {
  if (context.protocolToken === zeroAddress)
    return {
      status: "unavailable",
      reason: "not-deployed",
      label: "Protocol token has not been deployed.",
    };
  try {
    const actualChainId = await client.getChainId();
    if (actualChainId !== context.chainId)
      return {
        status: "wrong-chain",
        expectedChainId: context.chainId,
        actualChainId,
        label: "Pons reads require the selected protocol network.",
      };
    const blockNumber =
      context.blockNumber ?? (await client.getBlockNumber({ cacheTime: 0 }));
    const token = context.protocolToken;
    const factory = await client.readContract({
      address: token,
      abi: iPonsLauncherTokenAbi,
      functionName: "launchFactory",
      blockNumber,
    });
    const [launch, vault, escrow, hook, externalOwner, pending] =
      await Promise.all([
        client.readContract({
          address: factory,
          abi: iPonsLaunchFactoryAbi,
          functionName: "getLaunchedToken",
          args: [token],
          blockNumber,
        }),
        client.readContract({
          address: factory,
          abi: iPonsLaunchFactoryAbi,
          functionName: "buybackVault",
          blockNumber,
        }),
        client.readContract({
          address: factory,
          abi: iPonsLaunchFactoryAbi,
          functionName: "feeEscrow",
          blockNumber,
        }),
        client.readContract({
          address: factory,
          abi: iPonsLaunchFactoryAbi,
          functionName: "memeHook",
          blockNumber,
        }),
        client.readContract({
          address: factory,
          abi: iPonsLaunchFactoryAbi,
          functionName: "owner",
          blockNumber,
        }),
        client.readContract({
          address: factory,
          abi: iPonsLaunchFactoryAbi,
          functionName: "pendingCreatorFeeRecipient",
          args: [token],
          blockNumber,
        }),
      ]);
    if (
      !launch.exists ||
      launch.token.toLowerCase() !== token.toLowerCase() ||
      launch.pairToken !== zeroAddress
    )
      throw new Error("Pons ETH launch identity mismatch");
    const [
      vaultFactory,
      curveFactory,
      sweepOperator,
      tradingProtocolRecipient,
      tradingFees,
      buybackEarmark,
      creatorExtraTax,
      terms,
      deposited,
      released,
      vested,
      releasable,
      start,
      duration,
      curveReady,
    ] = await Promise.all([
      client.readContract({
        address: vault,
        abi: iPonsBuybackVaultAbi,
        functionName: "factory",
        blockNumber,
      }),
      client.readContract({
        address: launch.curve,
        abi: iPonsBondingCurveAbi,
        functionName: "factory",
        blockNumber,
      }),
      client.readContract({
        address: hook,
        abi: iPonsMemeHookAbi,
        functionName: "feeSweepOperator",
        blockNumber,
      }),
      client.readContract({
        address: launch.curve,
        abi: iPonsBondingCurveAbi,
        functionName: "protocolFeeRecipient",
        blockNumber,
      }),
      client.readContract({
        address: launch.curve,
        abi: iPonsBondingCurveAbi,
        functionName: "quoteFeeBalance",
        blockNumber,
      }),
      client.readContract({
        address: launch.curve,
        abi: iPonsBondingCurveAbi,
        functionName: "buybackQuoteBalance",
        blockNumber,
      }),
      client.readContract({
        address: launch.curve,
        abi: iPonsBondingCurveAbi,
        functionName: "creatorTaxBalance",
        blockNumber,
      }),
      client.readContract({
        address: vault,
        abi: iPonsBuybackVaultAbi,
        functionName: "vestingTerms",
        args: [token],
        blockNumber,
      }),
      client.readContract({
        address: vault,
        abi: iPonsBuybackVaultAbi,
        functionName: "totalLocked",
        args: [token],
        blockNumber,
      }),
      client.readContract({
        address: vault,
        abi: iPonsBuybackVaultAbi,
        functionName: "totalReleased",
        args: [token],
        blockNumber,
      }),
      client.readContract({
        address: vault,
        abi: iPonsBuybackVaultAbi,
        functionName: "vestedAmount",
        args: [token],
        blockNumber,
      }),
      client.readContract({
        address: vault,
        abi: iPonsBuybackVaultAbi,
        functionName: "releasable",
        args: [token],
        blockNumber,
      }),
      client.readContract({
        address: vault,
        abi: iPonsBuybackVaultAbi,
        functionName: "vestingStart",
        args: [token],
        blockNumber,
      }),
      client.readContract({
        address: vault,
        abi: iPonsBuybackVaultAbi,
        functionName: "VESTING_DURATION",
        blockNumber,
      }),
      client.readContract({
        address: launch.curve,
        abi: iPonsBondingCurveAbi,
        functionName: "readyToGraduate",
        blockNumber,
      }),
    ]);
    if (
      vaultFactory.toLowerCase() !== factory.toLowerCase() ||
      curveFactory.toLowerCase() !== factory.toLowerCase() ||
      released > vested ||
      vested > deposited ||
      releasable !== vested - released
    )
      throw new Error("Inconsistent external vesting state");
    const readEscrow = async (recipient: Address) => {
      const [nativeETH, protocolTokens] = await Promise.all([
        client.readContract({
          address: escrow,
          abi: iPonsFeeEscrowAbi,
          functionName: "balanceOf",
          args: [recipient],
          blockNumber,
        }),
        client.readContract({
          address: escrow,
          abi: iPonsFeeEscrowAbi,
          functionName: "balanceOfToken",
          args: [recipient, token],
          blockNumber,
        }),
      ]);
      return {
        nativeETH,
        protocolTokens,
        scope: "shared-recipient-ledger" as const,
      };
    };
    const poolId = keccak256(
      encodeAbiParameters(
        [
          { type: "address" },
          { type: "address" },
          { type: "uint24" },
          { type: "int24" },
          { type: "address" },
        ],
        [zeroAddress, token, launch.poolFee, launch.tickSpacing, hook],
      ),
    );
    const [creatorEscrow, protocolEscrow, poolPending] = await Promise.all([
      readEscrow(launch.creatorFeeRecipient),
      readEscrow(tradingProtocolRecipient),
      launch.phase === 2
        ? Promise.all(
            [zeroAddress, token].map(async (currency) => {
              const [fees, earmark, extraTax] = await Promise.all([
                client.readContract({
                  address: hook,
                  abi: iPonsMemeHookAbi,
                  functionName: "pendingFees",
                  args: [poolId, currency],
                  blockNumber,
                }),
                client.readContract({
                  address: hook,
                  abi: iPonsMemeHookAbi,
                  functionName: "pendingBuyback",
                  args: [poolId, currency],
                  blockNumber,
                }),
                client.readContract({
                  address: hook,
                  abi: iPonsMemeHookAbi,
                  functionName: "pendingCreatorTax",
                  args: [poolId, currency],
                  blockNumber,
                }),
              ]);
              return {
                currency,
                tradingFees: fees,
                buybackEarmark: earmark,
                creatorExtraTax: extraTax,
              };
            }),
          )
        : Promise.resolve([]),
    ]);
    return {
      status: "valid",
      capturedBlock: blockNumber,
      data: {
        factory,
        curve: launch.curve,
        vault,
        escrow,
        hook,
        externalOwner,
        sweepOperator,
        creator: launch.creatorFeeRecipient,
        launchDeveloper: launch.deployer,
        phase: launch.phase,
        curveReady,
        buybackEnabled: launch.buybackEnabled,
        pendingRecipientOverride: {
          recipient: pending[0],
          effectiveAt: pending[1],
          expiresAt: pending[2],
        },
        bondingPending: { tradingFees, buybackEarmark, creatorExtraTax },
        poolPending,
        vesting: {
          deposited,
          released,
          vested,
          unvested: deposited - vested,
          releasable,
          start,
          duration,
          creator: terms[0],
          protocol: terms[1],
          protocolShareBps: terms[2],
        },
        creatorEscrow,
        protocolEscrow,
      },
    };
  } catch (error) {
    const classified = classifyReadError(error);
    return classified.status === "rate-limited"
      ? classified
      : {
          status: "unavailable",
          reason: "rpc-unavailable",
          label:
            "Pons compensation is unavailable. BBF membership balances are separate.",
        };
  }
}

export type PonsHistoryCursor = { blockNumber: bigint; logIndex: number };
type HistoryContext = Omit<Context, "blockNumber"> & {
  factory: Address;
  vault: Address;
  escrow: Address;
  curve: Address;
  creator: Address;
  capturedBlock: bigint;
  fromBlock: bigint;
  cursor?: PonsHistoryCursor;
};
export type PonsHistoryEvent = {
  address: Address;
  blockNumber: bigint;
  logIndex: number;
  transactionHash: Hex;
  eventName: string;
  args: Record<string, unknown>;
  scope: "launch" | "shared-recipient-ledger";
};

// Public history pagination only. This never discovers a pending wallet receipt.
// Return page-local events, with explicit coverage, rather than fabricated lifetime totals.
export async function readPonsHistoryPage(
  client: PublicClient,
  context: HistoryContext,
) {
  if ((await client.getChainId()) !== context.chainId)
    throw new Error("History RPC chain mismatch");
  const cursor = context.cursor ?? {
    blockNumber: context.fromBlock,
    logIndex: 0,
  };
  if (
    cursor.blockNumber < context.fromBlock ||
    cursor.blockNumber > context.capturedBlock ||
    !Number.isSafeInteger(cursor.logIndex) ||
    cursor.logIndex < 0
  )
    throw new Error("Invalid Pons history cursor");
  const throughBlock =
    cursor.blockNumber + 1999n < context.capturedBlock
      ? cursor.blockNumber + 1999n
      : context.capturedBlock;
  const groups = await Promise.all([
    client.getLogs({
      address: context.factory,
      events: iPonsLaunchFactoryAbi.filter((item) => item.type === "event"),
      fromBlock: cursor.blockNumber,
      toBlock: throughBlock,
      strict: true,
    }),
    client.getLogs({
      address: context.vault,
      events: iPonsBuybackVaultAbi.filter((item) => item.type === "event"),
      fromBlock: cursor.blockNumber,
      toBlock: throughBlock,
      strict: true,
    }),
    client.getLogs({
      address: context.escrow,
      events: iPonsFeeEscrowAbi.filter((item) => item.type === "event"),
      fromBlock: cursor.blockNumber,
      toBlock: throughBlock,
      strict: true,
    }),
  ]);
  const events: PonsHistoryEvent[] = [];
  for (const log of groups.flat()) {
    if (
      log.blockNumber === null ||
      log.logIndex === null ||
      !log.transactionHash ||
      !log.eventName
    )
      throw new Error("Incomplete historical Pons log");
    if (
      log.blockNumber === cursor.blockNumber &&
      log.logIndex < cursor.logIndex
    )
      continue;
    const args = log.args as Record<string, unknown>;
    const sameToken =
      typeof args.token === "string" &&
      args.token.toLowerCase() === context.protocolToken.toLowerCase();
    const sameRecipient =
      typeof args.recipient === "string" &&
      args.recipient.toLowerCase() === context.creator.toLowerCase();
    const nativeRecipientEvent =
      log.address.toLowerCase() === context.escrow.toLowerCase() &&
      !args.token &&
      sameRecipient;
    if (!sameToken && !nativeRecipientEvent) continue;
    events.push({
      address: log.address,
      blockNumber: log.blockNumber,
      logIndex: log.logIndex,
      transactionHash: log.transactionHash,
      eventName: log.eventName,
      args,
      scope:
        log.address.toLowerCase() === context.escrow.toLowerCase()
          ? "shared-recipient-ledger"
          : "launch",
    });
  }
  events.sort((a, b) =>
    a.blockNumber < b.blockNumber
      ? -1
      : a.blockNumber > b.blockNumber
        ? 1
        : a.logIndex - b.logIndex,
  );
  const nextCursor =
    events.length > 50
      ? { blockNumber: events[50].blockNumber, logIndex: events[50].logIndex }
      : throughBlock < context.capturedBlock
        ? { blockNumber: throughBlock + 1n, logIndex: 0 }
        : null;
  return {
    events: events.slice(0, 50),
    nextCursor,
    coverage: {
      fromBlock: cursor.blockNumber,
      throughBlock,
      capturedBlock: context.capturedBlock,
      complete: nextCursor === null,
    },
  };
}
