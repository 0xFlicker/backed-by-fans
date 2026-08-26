import {
  parseEventLogs,
  TransactionReceiptNotFoundError,
  type Address,
  type Log,
  type PublicClient,
} from "viem";

import { factoryAbi, tierAbi, tokenAbi } from "@/contracts/abis";
import { readGiftRecipientState } from "@/features/membership/membership-read";
import type {
  DurableRecoveryResolution,
  PendingWrite,
  WriteIntent,
} from "@/features/protocol/pending-write";
import {
  receiptProvesMembershipRefund,
  receiptProvesPayment,
  receiptProvesReferralClaim,
  receiptProvesRewardClaim,
} from "@/features/protocol/payout-reconciliation";
import { recoverCreatedTier } from "@/features/protocol/registry-recovery";
import {
  receiptProvesCreatorWithdrawal,
  receiptProvesProtocolWithdrawal,
} from "@/features/protocol/withdrawal-reconciliation";
import type { WriteReceipt } from "@/features/protocol/write-transaction";
import { isSameAddress } from "@/lib/address";

type ReceiptLookup =
  | { status: "missing" }
  | { status: "reverted" | "cancelled" }
  | { status: "success"; receipt: WriteReceipt };

type RecoveryAttempt =
  | { status: "reconciled"; result?: unknown }
  | {
      status: "uncertain";
      error?: string;
      replacementDisposition: "retry" | "blocked";
    };

async function lookupReceipt(
  client: PublicClient,
  pending: PendingWrite,
): Promise<ReceiptLookup> {
  const hash = pending.replacementHash ?? pending.hash;
  if (!hash) return { status: "missing" };
  try {
    const receipt = await client.getTransactionReceipt({ hash });
    if (pending.replacementHash && pending.replacementReason === "cancelled") {
      return { status: "cancelled" };
    }
    if (receipt.status === "reverted") return { status: "reverted" };
    return {
      status: "success",
      receipt: {
        status: "success",
        blockNumber: receipt.blockNumber,
        logs: receipt.logs,
      },
    };
  } catch (error) {
    if (!(error instanceof TransactionReceiptNotFoundError)) throw error;
    return { status: "missing" };
  }
}

async function receiptOrHistoricalLogs(
  client: PublicClient,
  receipt: WriteReceipt | undefined,
  address: Address,
  fromBlock: bigint,
): Promise<WriteReceipt> {
  if (receipt) return receipt;
  const logs = (await client.getLogs({
    address,
    fromBlock,
    toBlock: "latest",
  })) as Log[];
  return { status: "success", logs };
}

function reconciled(result?: unknown): RecoveryAttempt {
  return { status: "reconciled", result };
}

function uncertain(
  error?: string,
  replacementDisposition: "retry" | "blocked" = "retry",
): RecoveryAttempt {
  return { status: "uncertain", error, replacementDisposition };
}

type TierGrantIntent = Extract<WriteIntent, { kind: "tier-grant" }>;

function balancesAt(
  intent: TierGrantIntent,
  timestamp: bigint,
): { paidSeconds: bigint; grantSeconds: bigint } | undefined {
  if (timestamp < intent.baselineTimestamp) return undefined;
  const elapsed = timestamp - intent.baselineTimestamp;
  const total = intent.baselinePaidSeconds + intent.baselineGrantSeconds;
  if (elapsed >= total) return { paidSeconds: 0n, grantSeconds: 0n };
  if (elapsed < intent.baselinePaidSeconds) {
    return {
      paidSeconds: intent.baselinePaidSeconds - elapsed,
      grantSeconds: intent.baselineGrantSeconds,
    };
  }
  return {
    paidSeconds: 0n,
    grantSeconds:
      intent.baselineGrantSeconds - (elapsed - intent.baselinePaidSeconds),
  };
}

export async function recoverTierGrant(
  client: PublicClient,
  intent: TierGrantIntent,
  receipt?: WriteReceipt,
): Promise<RecoveryAttempt> {
  const tokenId = await client.readContract({
    address: intent.tier,
    abi: tierAbi,
    functionName: "tokenOf",
    args: [intent.recipient],
  });
  if (tokenId === 0n || (intent.tokenId !== 0n && tokenId !== intent.tokenId)) {
    return uncertain();
  }

  const proofReceipt = await receiptOrHistoricalLogs(
    client,
    receipt,
    intent.tier,
    intent.fromBlock,
  );
  const events = parseEventLogs({
    abi: tierAbi,
    eventName: "MembershipTimeUpdated",
    logs: proofReceipt.logs ?? [],
    strict: true,
  }).filter(
    (event) =>
      isSameAddress(event.address, intent.tier) &&
      event.args.tokenId === tokenId,
  );

  for (const event of events) {
    const blockNumber = event.blockNumber ?? proofReceipt.blockNumber;
    if (blockNumber === undefined || blockNumber === null) continue;
    const block = await client.getBlock({ blockNumber });
    const previous = balancesAt(intent, block.timestamp);
    if (!previous) continue;
    const paidSeconds = previous.paidSeconds;
    const grantSeconds = previous.grantSeconds + intent.grantedSeconds;
    if (
      event.args.paidSeconds === paidSeconds &&
      event.args.grantSeconds === grantSeconds &&
      event.args.expiration === block.timestamp + paidSeconds + grantSeconds
    ) {
      return reconciled({
        tokenId,
        paidSeconds: event.args.paidSeconds,
        grantSeconds: event.args.grantSeconds,
        expiration: event.args.expiration,
      });
    }
  }
  return uncertain();
}

async function recoverIntent(
  client: PublicClient,
  pending: PendingWrite,
  receipt: WriteReceipt | undefined,
): Promise<RecoveryAttempt> {
  const intent = pending.intent;

  switch (intent.kind) {
    case "create-tier": {
      const recovered = await recoverCreatedTier(client, intent);
      if (recovered.status === "found") return reconciled(recovered.tier);
      return uncertain(
        recovered.status === "ambiguous"
          ? "Multiple exact tier matches appeared after the recovered deployment. Review their addresses before continuing."
          : "The factory has not registered the exact reviewed tier yet.",
        recovered.status === "ambiguous" ? "blocked" : "retry",
      );
    }
    case "protocol-fee-recipient": {
      const proofReceipt = await receiptOrHistoricalLogs(
        client,
        receipt,
        intent.factory,
        intent.fromBlock,
      );
      const proven = parseEventLogs({
        abi: factoryAbi,
        eventName: "FeeRecipientUpdated",
        logs: proofReceipt.logs ?? [],
        strict: true,
      }).some(
        (event) =>
          isSameAddress(event.address, intent.factory) &&
          isSameAddress(event.args.previousRecipient, intent.previous) &&
          isSameAddress(event.args.newRecipient, intent.expected),
      );
      return proven ? reconciled(intent.expected) : uncertain();
    }
    case "protocol-withdrawal": {
      const [balance, proofReceipt] = await Promise.all([
        client.readContract({
          address: intent.paymentToken,
          abi: tokenAbi,
          functionName: "balanceOf",
          args: [intent.factory],
        }),
        receiptOrHistoricalLogs(
          client,
          receipt,
          intent.factory,
          intent.fromBlock,
        ),
      ]);
      return balance === 0n ||
        receiptProvesProtocolWithdrawal(proofReceipt, intent)
        ? reconciled(balance)
        : uncertain();
    }
    case "protocol-pending-owner": {
      const proofReceipt = await receiptOrHistoricalLogs(
        client,
        receipt,
        intent.factory,
        intent.fromBlock,
      );
      const proven = parseEventLogs({
        abi: factoryAbi,
        eventName: "OwnershipTransferStarted",
        logs: proofReceipt.logs ?? [],
        strict: true,
      }).some(
        (event) =>
          isSameAddress(event.address, intent.factory) &&
          isSameAddress(event.args.newOwner, intent.expected),
      );
      return proven ? reconciled(intent.expected) : uncertain();
    }
    case "protocol-accept-owner": {
      const proofReceipt = await receiptOrHistoricalLogs(
        client,
        receipt,
        intent.factory,
        intent.fromBlock,
      );
      const proven = parseEventLogs({
        abi: factoryAbi,
        eventName: "OwnershipTransferred",
        logs: proofReceipt.logs ?? [],
        strict: true,
      }).some(
        (event) =>
          isSameAddress(event.address, intent.factory) &&
          isSameAddress(event.args.previousOwner, intent.previousOwner) &&
          isSameAddress(event.args.newOwner, intent.expected),
      );
      return proven ? reconciled(intent.expected) : uncertain();
    }
    case "tier-paused": {
      const proofReceipt = await receiptOrHistoricalLogs(
        client,
        receipt,
        intent.tier,
        intent.fromBlock,
      );
      const proven = parseEventLogs({
        abi: tierAbi,
        eventName: "PauseUpdated",
        logs: proofReceipt.logs ?? [],
        strict: true,
      }).some(
        (event) =>
          isSameAddress(event.address, intent.tier) &&
          event.args.paused === intent.expected,
      );
      return intent.previous !== intent.expected && proven
        ? reconciled(intent.expected)
        : uncertain();
    }
    case "tier-supply-cap": {
      const proofReceipt = await receiptOrHistoricalLogs(
        client,
        receipt,
        intent.tier,
        intent.fromBlock,
      );
      const proven = parseEventLogs({
        abi: tierAbi,
        eventName: "SupplyCapUpdated",
        logs: proofReceipt.logs ?? [],
        strict: true,
      }).some(
        (event) =>
          isSameAddress(event.address, intent.tier) &&
          event.args.previousCap === intent.previous &&
          event.args.newCap === intent.expected,
      );
      return intent.previous !== intent.expected && proven
        ? reconciled(intent.expected)
        : uncertain();
    }
    case "tier-prepayment": {
      const proofReceipt = await receiptOrHistoricalLogs(
        client,
        receipt,
        intent.tier,
        intent.fromBlock,
      );
      const proven = parseEventLogs({
        abi: tierAbi,
        eventName: "MaxPrepaidPeriodsUpdated",
        logs: proofReceipt.logs ?? [],
        strict: true,
      }).some(
        (event) =>
          isSameAddress(event.address, intent.tier) &&
          event.args.previousMaximum === intent.previous &&
          event.args.newMaximum === intent.expected,
      );
      return intent.previous !== intent.expected && proven
        ? reconciled(intent.expected)
        : uncertain();
    }
    case "tier-metadata": {
      const changed =
        intent.description !== intent.previousDescription ||
        intent.imageURI !== intent.previousImageURI ||
        intent.externalURI !== intent.previousExternalURI;
      const proofReceipt = await receiptOrHistoricalLogs(
        client,
        receipt,
        intent.tier,
        intent.fromBlock,
      );
      const proven = parseEventLogs({
        abi: tierAbi,
        eventName: "TierMetadataUpdated",
        logs: proofReceipt.logs ?? [],
        strict: true,
      }).some(
        (event) =>
          isSameAddress(event.address, intent.tier) &&
          event.args.description === intent.description &&
          event.args.imageURI === intent.imageURI &&
          event.args.externalURI === intent.externalURI,
      );
      return changed && proven
        ? reconciled({
            description: intent.description,
            imageURI: intent.imageURI,
            externalURI: intent.externalURI,
          })
        : uncertain();
    }
    case "tier-grant": {
      return recoverTierGrant(client, intent, receipt);
    }
    case "tier-revoke-grant": {
      const proofReceipt = await receiptOrHistoricalLogs(
        client,
        receipt,
        intent.tier,
        intent.fromBlock,
      );
      const proven = parseEventLogs({
        abi: tierAbi,
        eventName: "MembershipTimeUpdated",
        logs: proofReceipt.logs ?? [],
        strict: true,
      }).some(
        (event) =>
          isSameAddress(event.address, intent.tier) &&
          event.args.tokenId === intent.tokenId &&
          event.args.grantSeconds === 0n,
      );
      return intent.previousGrantSeconds > 0n && proven
        ? reconciled(intent.tokenId)
        : uncertain();
    }
    case "tier-refund": {
      const [balances, refund, proofReceipt] = await Promise.all([
        client.readContract({
          address: intent.tier,
          abi: tierAbi,
          functionName: "timeBalances",
          args: [intent.tokenId],
        }),
        client.readContract({
          address: intent.tier,
          abi: tierAbi,
          functionName: "previewRefund",
          args: [intent.tokenId],
        }),
        receiptOrHistoricalLogs(client, receipt, intent.tier, intent.fromBlock),
      ]);
      return receiptProvesMembershipRefund(proofReceipt, intent) &&
        balances[0] === 0n &&
        balances[1] === 0n &&
        refund[0] === 0n
        ? reconciled({ balances, refund })
        : uncertain();
    }
    case "tier-withdrawal": {
      const [current, proofReceipt] = await Promise.all([
        client.readContract({
          address: intent.tier,
          abi: tierAbi,
          functionName: "creatorProceeds",
        }),
        receiptOrHistoricalLogs(client, receipt, intent.tier, intent.fromBlock),
      ]);
      return current === 0n ||
        receiptProvesCreatorWithdrawal(proofReceipt, intent)
        ? reconciled(current)
        : uncertain();
    }
    case "tier-pending-owner": {
      const proofReceipt = await receiptOrHistoricalLogs(
        client,
        receipt,
        intent.tier,
        intent.fromBlock,
      );
      const proven = parseEventLogs({
        abi: tierAbi,
        eventName: "OwnershipTransferStarted",
        logs: proofReceipt.logs ?? [],
        strict: true,
      }).some(
        (event) =>
          isSameAddress(event.address, intent.tier) &&
          isSameAddress(event.args.newOwner, intent.expected),
      );
      return !isSameAddress(intent.previous, intent.expected) && proven
        ? reconciled(intent.expected)
        : uncertain();
    }
    case "tier-accept-owner": {
      const proofReceipt = await receiptOrHistoricalLogs(
        client,
        receipt,
        intent.tier,
        intent.fromBlock,
      );
      const proven = parseEventLogs({
        abi: tierAbi,
        eventName: "OwnershipTransferred",
        logs: proofReceipt.logs ?? [],
        strict: true,
      }).some(
        (event) =>
          isSameAddress(event.address, intent.tier) &&
          isSameAddress(event.args.previousOwner, intent.previousOwner) &&
          isSameAddress(event.args.newOwner, intent.expected),
      );
      return !isSameAddress(intent.previousOwner, intent.expected) && proven
        ? reconciled(intent.expected)
        : uncertain();
    }
    case "membership-payment": {
      const tokenId = await client.readContract({
        address: intent.tier,
        abi: tierAbi,
        functionName: "tokenOf",
        args: [intent.recipient],
      });
      if (tokenId === 0n) return uncertain();
      const [expiration, shares, referral, proofReceipt] = await Promise.all([
        client.readContract({
          address: intent.tier,
          abi: tierAbi,
          functionName: "expiresAt",
          args: [tokenId],
        }),
        client.readContract({
          address: intent.tier,
          abi: tierAbi,
          functionName: "sharesOf",
          args: [tokenId],
        }),
        client.readContract({
          address: intent.tier,
          abi: tierAbi,
          functionName: "referralOf",
          args: [tokenId],
        }),
        receiptOrHistoricalLogs(client, receipt, intent.tier, intent.fromBlock),
      ]);
      return receiptProvesPayment(proofReceipt, intent) &&
        expiration >= intent.minimumExpiration &&
        shares >= intent.minimumShares &&
        referral[0] === intent.referralStatus
        ? reconciled({ tokenId, expiration, shares, referral })
        : uncertain();
    }
    case "membership-gift": {
      const blockNumber = await client.getBlockNumber();
      const [recipient, proofReceipt] = await Promise.all([
        readGiftRecipientState(client, {
          tier: intent.tier,
          recipient: intent.recipient,
          blockNumber,
        }),
        receiptOrHistoricalLogs(client, receipt, intent.tier, intent.fromBlock),
      ]);
      return receiptProvesPayment(proofReceipt, intent) &&
        recipient.expiration >= intent.minimumExpiration &&
        recipient.occupied
        ? reconciled(recipient)
        : uncertain();
    }
    case "reward-claim": {
      const [claimable, proofReceipt] = await Promise.all([
        client.readContract({
          address: intent.tier,
          abi: tierAbi,
          functionName: "claimableReward",
          args: [intent.tokenId],
        }),
        receiptOrHistoricalLogs(client, receipt, intent.tier, intent.fromBlock),
      ]);
      return claimable === 0n || receiptProvesRewardClaim(proofReceipt, intent)
        ? reconciled(claimable)
        : uncertain();
    }
    case "referral-claim": {
      const [claimable, proofReceipt] = await Promise.all([
        client.readContract({
          address: intent.tier,
          abi: tierAbi,
          functionName: "claimableReferral",
          args: [intent.referrer],
        }),
        receiptOrHistoricalLogs(client, receipt, intent.tier, intent.fromBlock),
      ]);
      return claimable === 0n ||
        receiptProvesReferralClaim(proofReceipt, intent)
        ? reconciled(claimable)
        : uncertain();
    }
    case "synchronize": {
      const proofReceipt = await receiptOrHistoricalLogs(
        client,
        receipt,
        intent.tier,
        intent.fromBlock,
      );
      const proven = parseEventLogs({
        abi: tierAbi,
        eventName: "MembershipSynchronized",
        logs: proofReceipt.logs ?? [],
        strict: true,
      }).some(
        (event) =>
          isSameAddress(event.address, intent.tier) &&
          event.args.tokenId === intent.tokenId,
      );
      return intent.previousOccupied && !intent.previousActive && proven
        ? reconciled(intent.tokenId)
        : uncertain();
    }
  }
}

export async function recoverPendingWrite(
  client: PublicClient,
  pending: PendingWrite,
): Promise<DurableRecoveryResolution> {
  const receiptLookup = await lookupReceipt(client, pending);
  if (receiptLookup.status === "reverted") {
    return {
      status: "reverted",
      error: "The recovered transaction reverted onchain.",
    };
  }
  if (receiptLookup.status === "cancelled") {
    return {
      status: "cancelled",
      error: "The recovered replacement cancelled this action onchain.",
    };
  }
  const receipt =
    receiptLookup.status === "success" ? receiptLookup.receipt : undefined;
  const resolution = await recoverIntent(client, pending, receipt);
  if (
    resolution.status === "uncertain" &&
    resolution.replacementDisposition === "retry" &&
    receiptLookup.status === "success" &&
    pending.replacementReason === "replaced"
  ) {
    return {
      status: "cancelled",
      error:
        "The wallet confirmed a different same-nonce replacement, and the exact protected action was not found onchain.",
    };
  }
  if (resolution.status === "uncertain") {
    return { status: "uncertain", error: resolution.error };
  }
  return resolution;
}
