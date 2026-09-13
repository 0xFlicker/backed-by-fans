"use client";
import { StreamingAmount } from "@/components/StreamingAmount";
import { earningsStream } from "@/lib/streaming-amount";

import { RewardPurchaseCurve } from "./RewardPurchaseCurve";

import Link from "next/link";
import type { Route } from "next";
import { useLayoutEffect, useReducer, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TransferMembership } from "./TransferMembership";
import { simulateContract } from "@wagmi/core";
import {
  erc20Abi,
  formatEther,
  parseEventLogs,
  getAddress,
  isAddress,
  zeroAddress,
  type Address,
  type Hash,
} from "viem";
import { useConfig, usePublicClient, useWriteContract } from "wagmi";

import { WalletControl } from "@/components/WalletControl";
import { ResilientArtworkImage } from "@/components/ResilientArtworkImage";
import { membershipTierAbi, iWrappedNativeAbi } from "@/contracts";
import { isWrappedNative } from "@/lib/wrapped-native";
import type { TierSupporterSnapshot } from "@/contracts/types";
import { parseUint64Input, parseTokenId } from "@/features/creator/management";
import {
  readGiftRecipientState,
  readMembershipPosition,
} from "@/features/membership/membership-read";
import { formatMembershipDate } from "@/features/membership/date";
import { captureSharedReferrer } from "@/features/membership/referral";
import { CopyableAddress } from "@/features/membership/RendererDetails";
import { ShareMembership } from "@/features/membership/ShareMembership";
import {
  buildPaymentPreview,
  classifyMembershipState,
  parsePaymentAmount,
  validateGift,
  readRewardQuote,
  reconcilePaymentWeight,
  averageRewardBoost,
  membershipPaymentCall,
} from "@/features/membership/state";
import {
  receiptMembershipMaintenance,
  receiptRetiredReward,
  receiptProvesPayment,
  receiptReferralClaim,
  receiptRewardClaim,
} from "@/features/protocol/payout-reconciliation";
import { assertSufficientGas } from "@/features/protocol/gas-readiness";
import { receiptCreatorWithdrawal } from "@/features/protocol/withdrawal-reconciliation";
import { VestingSummary } from "@/features/membership/VestingSummary";
import {
  MembershipMaintenance,
  type MaintenanceOutcome,
} from "./MembershipMaintenance";
import { RetiredRewardClaim } from "./RetiredRewardClaim";
import { PositionSelector } from "./PositionSelector";
import { ReleaseTierFees } from "@/features/protocol/ReleaseTierFees";
import {
  isSuccessfulWriteReceipt,
  invalidateMembershipReads,
  reconcileMembershipTransfer,
  reconcileSuccessfulWrite,
  type SuccessfulWriteReceipt,
} from "@/features/protocol/write-reconciliation";
import { getWriteGuard, type AuthenticityResult } from "@/lib/authenticity";
import { isSameAddress } from "@/lib/address";
import { getDeployment, publicConfig } from "@/lib/config";
import { getSupportedChain } from "@/lib/chains";
import { tierArtworkRevision } from "@/lib/tier-artwork-revision";
import { useHydratedAccount } from "@/lib/use-hydrated-account";
import type { ReadState } from "@/lib/read-state";
import { robinhoodTestnetFaucetUrl } from "@/lib/testnet-funding";
import {
  formatRawTokenAmount,
  scheduledDisplayAdjustment,
} from "@/lib/token-amount";
import {
  decodeTransactionError,
  initialTransactionState,
  isTransactionInFlight,
  transactionReducer,
} from "@/lib/transaction-state";

type SendWrite = () => Promise<Hash>;

function formatPeriod(seconds: bigint) {
  const days = seconds / 86_400n;
  return days > 0n ? `${days} days` : `${seconds} seconds`;
}

function transactionStatusCopy(phase: string, symbol: string) {
  switch (phase) {
    case "simulation":
      return "Checking the details…";
    case "approval":
      return `Approve ${symbol} in your wallet.`;
    case "signature":
      return "Confirm in your wallet.";
    case "submission":
    case "confirmation":
    case "replacement":
      return "Waiting for the network…";
    case "reconciliation":
      return "Updating your membership…";
    case "confirmed":
      return "Done.";
    case "cancelled":
      return "Cancelled.";
    case "reverted":
    case "retry":
      return "That did not go through.";
    case "uncertain":
      return "Check your wallet before trying again.";
    default:
      return "";
  }
}

function referralAddress(
  snapshot: TierSupporterSnapshot,
  sharedReferrer: Address | undefined,
) {
  const locked = snapshot.credential?.referralStatus;
  if (locked === "locked-none") return zeroAddress;
  if (locked === "locked-address") return snapshot.credential!.referrer;
  return sharedReferrer ?? zeroAddress;
}

function statusCopy(
  state: ReturnType<typeof classifyMembershipState>,
  tokenId?: bigint,
) {
  switch (state) {
    case "unready":
      return [
        "New membership",
        "Connect your wallet to choose your membership time.",
      ];
    case "joinable":
      return ["New membership", "Choose how long you would like to join."];
    case "active":
      return [
        `Renew membership #${tokenId}`,
        "Extend this selected position. Other memberships stay independent.",
      ];
    case "expired-pending":
      return [
        "Membership ended",
        "Choose New membership to return with a fresh position.",
      ];
    case "retired":
      return ["Membership ended", "Choose a new membership period to return."];
  }
}

function membershipStatusTitle(credential: {
  active: boolean;
  occupied: boolean;
}) {
  if (credential.active) return "Membership active";
  return credential.occupied ? "Membership expired" : "Previous membership";
}

function publicExternalUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function CollectionArtwork({ name, src }: { name: string; src: string }) {
  return (
    <ResilientArtworkImage
      alt={`${name} collection artwork`}
      className="membership-artwork-image"
      fallback={
        <div className="membership-artwork-placeholder" role="alert">
          <strong>Collection artwork is temporarily unavailable.</strong>
          <span>The membership details are still available below.</span>
        </div>
      }
      fetchPriority="high"
      height={1200}
      priority
      sizes="(max-width: 1100px) 100vw, 58vw"
      src={src}
      unoptimized
      width={1200}
    />
  );
}

export function MembershipExperience({
  snapshot,
  capturedBlock,
  fresh,
  onRefresh,
  expectedChainId,
  onSelectPosition,
}: {
  snapshot: TierSupporterSnapshot;
  capturedBlock: bigint;
  fresh: boolean;
  expectedChainId: 4663 | 46630 | 31337;
  onRefresh: (
    tokenId?: bigint,
  ) => Promise<ReadState<TierSupporterSnapshot> | undefined>;
  onSelectPosition: (tokenId: bigint) => void;
}) {
  const account = useHydratedAccount();
  const write = useWriteContract();
  const wagmiConfig = useConfig();
  const client = usePublicClient({ chainId: expectedChainId })!;
  const queries = useQueryClient();
  const [transferOutcome, setTransferOutcome] = useState("");
  const deployment = getDeployment(publicConfig, expectedChainId);
  const [transaction, dispatch] = useReducer(
    transactionReducer,
    initialTransactionState,
  );
  const operationInFlight = useRef(false);
  const [periods, setPeriods] = useState("1");
  const [contribution, setContribution] = useState("0");
  const sharedReferrer = useRef<Address | undefined>(undefined);
  const [giftRecipient, setGiftRecipient] = useState("");
  const [giftPeriods, setGiftPeriods] = useState("1");
  const [preparedAction, setPreparedAction] = useState("");
  const [issuedWeight, setIssuedWeight] = useState<bigint>();
  const [giftMode, setGiftMode] = useState<"new" | "renew">("new");
  const [giftToken, setGiftToken] = useState("");
  const [payout, setPayout] = useState<{
    amount: bigint;
    recipient: Address;
  }>();
  const paymentTokenState = snapshot.paymentTokenState;
  const eligibleWeight = snapshot.credential?.rewardEligible
    ? snapshot.credential.shares
    : 0n;
  const totalWeight = snapshot.totalEligibleRewardShares;
  const rewardShare =
    eligibleWeight === 0n || totalWeight === 0n
      ? "0%"
      : totalWeight === undefined
        ? "Unavailable"
        : eligibleWeight * 10000n < totalWeight
          ? "<0.01%"
          : `${Number((eligibleWeight * 10000n) / totalWeight) / 100}%`;
  const paymentLabel = (raw: bigint) =>
    paymentTokenState
      ? `${formatRawTokenAmount({
          raw,
          decimals: paymentTokenState.decimals,
          multiplier: paymentTokenState.uiMultiplier,
        })} ${paymentTokenState.symbol}`
      : "Payment token unavailable";
  // Weight uses the token's fixed decimal denomination, never its changing
  // display multiplier: a stock split must not change permanent reward weight.
  const weightLabel = (raw: bigint) =>
    paymentTokenState
      ? formatRawTokenAmount({
          raw,
          decimals: paymentTokenState.decimals,
          multiplier: 10n ** 18n,
        })
      : "Unavailable";
  const scheduledPeriodPrice = paymentTokenState
    ? scheduledDisplayAdjustment({
        raw: snapshot.pricePerPeriod,
        decimals: paymentTokenState.decimals,
        currentMultiplier: paymentTokenState.uiMultiplier,
        futureMultiplier: paymentTokenState.newUIMultiplier,
        effectiveAt: new Date(Number(paymentTokenState.effectiveAt) * 1_000),
        referenceTime: new Date(Number(snapshot.capturedTimestamp) * 1_000),
      })
    : undefined;
  const artworkRevision = tierArtworkRevision(snapshot);
  const artworkSrc = `/api/chains/${expectedChainId}/tiers/${snapshot.address}/artwork?v=${artworkRevision}`;
  const externalUrl = publicExternalUrl(snapshot.externalURI);
  useLayoutEffect(() => {
    const captured = captureSharedReferrer({
      chainId: expectedChainId,
      tier: snapshot.address,
      url: new URL(window.location.href),
      storage: window.localStorage,
    });
    sharedReferrer.current = captured.referrer;
    if (captured.cleanPath) {
      window.history.replaceState(window.history.state, "", captured.cleanPath);
    }
  }, [expectedChainId, snapshot.address]);

  const authenticity: AuthenticityResult = {
    status: "verified",
    capturedBlock,
    tier: snapshot.address,
    tierIdentity: snapshot.tierIdentity,
    paymentToken: snapshot.paymentToken,
    renderer: snapshot.renderer,
    art: snapshot.art,
    media: snapshot.media,
    protocolDependencies: snapshot.protocolDependencies,
  };
  const guard = getWriteGuard({
    deployment,
    walletChainId: account.isConnected ? account.chainId : undefined,
    expectedChainId,
    authenticity,
  });
  const walletReady =
    account.isConnected &&
    account.chainId === expectedChainId &&
    Boolean(snapshot.wallet);
  const actionState = classifyMembershipState({
    walletReady,
    tokenId: snapshot.credential?.tokenId ?? 0n,
    active: snapshot.credential?.active,
    occupied: snapshot.credential?.occupied,
  });
  const [primaryTitle, primaryDescription] = statusCopy(
    actionState,
    snapshot.credential?.tokenId,
  );
  const writesVerified =
    fresh &&
    guard.enabled &&
    Boolean(paymentTokenState) &&
    (snapshot.walletEthBalance ?? 0n) > 0n &&
    !write.isPending &&
    !isTransactionInFlight(transaction.phase);
  const periodValue = parseUint64Input(periods, { allowZero: false });
  const contributionValue = paymentTokenState
    ? parsePaymentAmount(contribution, paymentTokenState)
    : undefined;
  const primaryInputEmpty =
    (snapshot.pricePerPeriod === 0n ? contribution : periods).trim() === "";
  const primaryInputValid =
    !primaryInputEmpty &&
    (snapshot.pricePerPeriod === 0n
      ? contributionValue !== undefined &&
        (contributionValue === 0n ||
          contributionValue >= snapshot.minimumPayment)
      : periodValue !== undefined);
  const selfPreview = buildPaymentPreview({
    now: snapshot.capturedTimestamp,
    currentExpiration: snapshot.credential?.expiration ?? 0n,
    periodDuration: snapshot.periodDuration,
    periods:
      snapshot.pricePerPeriod === 0n
        ? primaryInputEmpty
          ? 0n
          : 1n
        : (periodValue ?? 0n),
    pricePerPeriod: snapshot.pricePerPeriod,
    contribution: contributionValue ?? 0n,
    allowance: snapshot.allowance ?? 0n,
    rewardBps: snapshot.rewardBps,
    protocolFeeBps: snapshot.protocolFeeBps,
    referralBps: snapshot.referralBps,
    referralApplies: snapshot.credential?.referralStatus === "locked-address",
  });
  const reacquiring = !snapshot.credential;
  const rewardQuote = useQuery({
    queryKey: [
      "reward-shares",
      expectedChainId,
      snapshot.address,
      capturedBlock.toString(),
      selfPreview.gross.toString(),
    ],
    enabled: Boolean(primaryInputValid && fresh && client),
    queryFn: () =>
      readRewardQuote(client, {
        tier: snapshot.address,
        gross: selfPreview.gross,
        blockNumber: capturedBlock,
      }),
  });
  const capacityFull =
    reacquiring &&
    snapshot.supplyCap !== 0n &&
    snapshot.occupiedSupply >= snapshot.supplyCap;
  const exceedsPrepaymentLimit =
    snapshot.maxPrepaidPeriods !== 0n &&
    (snapshot.credential?.paidSeconds ?? 0n) + selfPreview.duration >
      snapshot.maxPrepaidPeriods * snapshot.periodDuration;

  const normalizedGift = isAddress(giftRecipient.trim())
    ? getAddress(giftRecipient.trim())
    : undefined;
  const giftError = account.address
    ? validateGift(account.address, giftRecipient, snapshot.pricePerPeriod)
    : "Connect the gifting wallet first.";
  const giftTokenValue = giftMode === "new" ? 0n : parseTokenId(giftToken);
  const giftState = useQuery({
    queryKey: [
      "gift-recipient",
      giftTokenValue?.toString(),
      expectedChainId,
      snapshot.address,
      normalizedGift,
      capturedBlock.toString(),
    ],
    enabled: Boolean(
      normalizedGift &&
      !giftError &&
      giftTokenValue !== undefined &&
      fresh &&
      client,
    ),
    queryFn: () =>
      readGiftRecipientState(client!, {
        tier: snapshot.address,
        recipient: normalizedGift!,
        tokenId: giftTokenValue,
        blockNumber: capturedBlock,
      }),
  });
  const giftPeriodValue = parseUint64Input(giftPeriods, { allowZero: false });
  const giftPreview =
    giftPeriodValue !== undefined && giftState.data
      ? buildPaymentPreview({
          now: snapshot.capturedTimestamp,
          currentExpiration: giftState.data.expiration,
          periodDuration: snapshot.periodDuration,
          periods: giftPeriodValue,
          pricePerPeriod: snapshot.pricePerPeriod,
          contribution: 0n,
          allowance: snapshot.allowance ?? 0n,
          rewardBps: snapshot.rewardBps,
          protocolFeeBps: snapshot.protocolFeeBps,
          referralBps: snapshot.referralBps,
          referralApplies: giftState.data.referralStatus === "locked-address",
        })
      : undefined;
  const giftRewardQuote = useQuery({
    queryKey: [
      "reward-shares",
      expectedChainId,
      snapshot.address,
      capturedBlock.toString(),
      giftPreview?.gross.toString(),
    ],
    enabled: Boolean(giftPreview && fresh && client),
    queryFn: () =>
      readRewardQuote(client, {
        tier: snapshot.address,
        gross: giftPreview!.gross,
        blockNumber: capturedBlock,
      }),
  });
  const giftReacquiresCapacity =
    giftState.data !== undefined && !giftState.data.occupied;
  const giftCapacityFull =
    giftReacquiresCapacity &&
    snapshot.supplyCap !== 0n &&
    snapshot.occupiedSupply >= snapshot.supplyCap;
  const giftExceedsPrepaymentLimit =
    giftPreview !== undefined &&
    giftState.data !== undefined &&
    snapshot.maxPrepaidPeriods !== 0n &&
    giftState.data.paidSeconds + giftPreview.duration >
      snapshot.maxPrepaidPeriods * snapshot.periodDuration;

  function tierWrite(
    functionName:
      | "createMembership"
      | "renewMembership"
      | "createContributionMembership"
      | "renewContributionMembership"
      | "giftMembership"
      | "giftRenewal"
      | "claimReward"
      | "claimReferral"
      | "withdrawCreatorProceeds"
      | "claimRewards"
      | "processAccounting"
      | "claimRetiredRewards"
      | "safeTransferFrom"
      | "approve"
      | "setApprovalForAll",
    args: readonly unknown[] = [],
  ) {
    return async (): Promise<SendWrite> => {
      if (!account.address)
        throw new Error("Connect the acting wallet before simulation.");
      const { request } = await simulateContract(wagmiConfig, {
        account: account.address,
        chainId: expectedChainId,
        address: snapshot.address,
        abi: membershipTierAbi,
        functionName,
        args,
      } as never);
      await assertSufficientGas(client, account.address, request);
      return () => write.writeContractAsync(request);
    };
  }

  function approval(amount: bigint) {
    if (amount === 0n) return undefined;
    return async (): Promise<SendWrite> => {
      if (!account.address)
        throw new Error("Connect the paying wallet before approval.");
      const { request } = await simulateContract(wagmiConfig, {
        account: account.address,
        chainId: expectedChainId,
        address: snapshot.paymentToken,
        abi: erc20Abi,
        functionName: "approve",
        args: [snapshot.address, amount],
      });
      await assertSufficientGas(client, account.address, request);
      return () => write.writeContractAsync(request);
    };
  }

  async function performUnlocked(
    label: string,
    simulate: () => Promise<SendWrite>,
    reconcile: (
      receipt: SuccessfulWriteReceipt,
    ) => Promise<unknown | undefined>,
    approve?: () => Promise<SendWrite>,
  ) {
    setPreparedAction(label);
    setIssuedWeight(undefined);
    setPayout(undefined);
    let waitingForReceipt = false;
    try {
      dispatch({ type: "SIMULATE" });
      if (approve) {
        const sendApproval = await approve();
        dispatch({ type: "SIMULATED", approvalRequired: true });
        const approvalHash = await sendApproval();
        dispatch({ type: "SUBMITTED", hash: approvalHash });
        waitingForReceipt = true;
        let approvalCancelled = false;
        const approvalReceipt = await client.waitForTransactionReceipt({
          hash: approvalHash,
          onReplaced: (replacement) => {
            approvalCancelled ||= replacement.reason === "cancelled";
            dispatch({
              type: "REPLACED",
              replacementHash: replacement.transaction.hash,
              reason: replacement.reason,
            });
          },
        });
        waitingForReceipt = false;
        if (approvalCancelled) {
          dispatch({
            type: "CANCELLED",
            error: `The wallet cancelled the ${paymentTokenState?.symbol ?? "token"} approval.`,
          });
          return undefined;
        }
        if (approvalReceipt.status === "reverted") {
          dispatch({
            type: "REVERTED",
            error: `The ${paymentTokenState?.symbol ?? "token"} approval reverted onchain.`,
          });
          return undefined;
        }
        dispatch({ type: "APPROVED" });
      }

      const send = await simulate();
      if (!approve) dispatch({ type: "SIMULATED", approvalRequired: false });
      dispatch({ type: "SIGN" });
      const hash = await send();
      dispatch({ type: "SIGNED" });
      dispatch({ type: "SUBMITTED", hash });
      waitingForReceipt = true;
      let cancelled = false;
      const receipt = await client.waitForTransactionReceipt({
        hash,
        onReplaced: (replacement) => {
          cancelled ||= replacement.reason === "cancelled";
          dispatch({
            type: "REPLACED",
            replacementHash: replacement.transaction.hash,
            reason: replacement.reason,
          });
        },
      });
      waitingForReceipt = false;
      if (cancelled) {
        dispatch({
          type: "CANCELLED",
          error: "The wallet cancelled this action.",
        });
        return undefined;
      }
      if (!isSuccessfulWriteReceipt(receipt)) {
        dispatch({
          type: "REVERTED",
          error: "The transaction reverted onchain.",
        });
        return undefined;
      }
      dispatch({ type: "CONFIRM" });
      return reconcileSuccessfulWrite({
        dispatch,
        receipt,
        reconcile: async (confirmed) => {
          const result = await reconcile(confirmed);
          if (result !== undefined)
            await invalidateMembershipReads(queries, confirmed, {
              chainId: expectedChainId,
              tier: snapshot.address,
              owners: snapshot.wallet ? [snapshot.wallet] : [],
            });
          return result;
        },
      });
    } catch (error) {
      dispatch({
        type: waitingForReceipt ? "UNCERTAIN" : "FAILED",
        error: decodeTransactionError(error),
      });
      return undefined;
    }
  }

  async function perform(
    label: string,
    simulate: () => Promise<SendWrite>,
    reconcile: (
      receipt: SuccessfulWriteReceipt,
    ) => Promise<unknown | undefined>,
    approve?: () => Promise<SendWrite>,
  ) {
    if (operationInFlight.current) return undefined;
    operationInFlight.current = true;
    try {
      return await performUnlocked(label, simulate, reconcile, approve);
    } finally {
      operationInFlight.current = false;
    }
  }

  async function reconcileSnapshot(
    provesAction: (next: TierSupporterSnapshot) => boolean,
  ) {
    const state = await onRefresh();
    if (state?.status !== "valid") {
      throw new Error(
        "Fresh membership state was unavailable after confirmation.",
      );
    }
    return provesAction(state.data) ? state.data : undefined;
  }

  async function reconcilePayout(
    paid: { amount: bigint; recipient: Address } | undefined,
    receipt?: SuccessfulWriteReceipt,
  ) {
    if (!paid) return undefined;
    const next =
      receipt && receiptRetiredSelection(receipt)
        ? await onRefresh(0n)
        : await reconcileSnapshot(() => true);
    if (next) setPayout(paid);
    return next;
  }

  function receiptRetiredSelection(receipt: SuccessfulWriteReceipt) {
    return (
      snapshot.credential &&
      parseEventLogs({
        abi: membershipTierAbi,
        eventName: "MembershipRetired",
        logs: receipt.logs,
        strict: true,
      }).some(
        (event) =>
          isSameAddress(event.address, snapshot.address) &&
          event.args.tokenId === snapshot.credential?.tokenId,
      )
    );
  }

  async function reconcileClaims(receipt: SuccessfulWriteReceipt) {
    const recipient = snapshot.wallet!;
    const parts = [
      receiptRetiredReward(receipt, {
        tier: snapshot.address,
        owner: recipient,
      }),
      snapshot.credential
        ? receiptRewardClaim(receipt, {
            tier: snapshot.address,
            tokenId: snapshot.credential.tokenId,
            owner: recipient,
          })
        : undefined,
      receiptReferralClaim(receipt, {
        tier: snapshot.address,
        referrer: recipient,
      }),
      isSameAddress(recipient, snapshot.creator)
        ? receiptCreatorWithdrawal(receipt, {
            tier: snapshot.address,
            owner: recipient,
          })
        : undefined,
    ];
    const amount = parts.reduce(
      (total, part) => total + (part?.amount ?? 0n),
      0n,
    );
    const reconciled = await reconcilePayout(
      amount > 0n ? { amount, recipient } : undefined,
      receipt,
    );
    await earnings.refetch();
    return reconciled;
  }

  async function buyForSelf() {
    if (
      periodValue === undefined ||
      contributionValue === undefined ||
      !account.address
    )
      return;
    const payer = account.address;
    const paymentReferrer = referralAddress(snapshot, sharedReferrer.current);
    const call = membershipPaymentCall({
      intent: snapshot.credential
        ? {
            kind: "renew",
            tokenId: snapshot.credential.tokenId,
            expiration: snapshot.credential.expiration,
          }
        : { kind: "new" },
      now: snapshot.capturedTimestamp,
      periods: periodValue,
      gross: contributionValue,
      pricePerPeriod: snapshot.pricePerPeriod,
      referralChoice: paymentReferrer,
    });
    const simulate = tierWrite(call.functionName, call.args);
    const expectedReferral =
      snapshot.credential?.referralStatus !== undefined &&
      snapshot.credential.referralStatus !== "unset"
        ? snapshot.credential.referralStatus
        : selfPreview.gross === 0n
          ? "unset"
          : paymentReferrer === zeroAddress
            ? "locked-none"
            : "locked-address";
    await perform(
      primaryTitle,
      simulate,
      async (receipt) => {
        const payment = parseEventLogs({
          abi: membershipTierAbi,
          eventName: "PaymentProcessed",
          logs: receipt.logs,
          strict: true,
        }).find(
          (event) =>
            isSameAddress(event.address, snapshot.address) &&
            isSameAddress(event.args.payer, payer) &&
            isSameAddress(event.args.recipient, payer),
        );
        if (
          !payment ||
          (snapshot.credential &&
            payment.args.tokenId !== snapshot.credential.tokenId)
        )
          return undefined;
        const position = await readMembershipPosition(client, {
          tier: snapshot.address,
          tokenId: payment.args.tokenId,
          owner: payer,
          blockNumber: receipt.blockNumber,
        });
        if (position.referralStatus !== expectedReferral) return undefined;
        const actual = reconcilePaymentWeight(receipt, {
          tier: snapshot.address,
          payer,
          recipient: payer,
          gross: selfPreview.gross,
          periods: snapshot.pricePerPeriod === 0n ? 1n : periodValue,
          tokenId: position.tokenId,
          shares: position.shares,
        });
        if (actual === undefined) return undefined;
        await reconcileSnapshot(() => true);
        if (snapshot.pricePerPeriod === 0n) setContribution("");
        else setPeriods("");
        setIssuedWeight(actual);
        return position;
      },
      approval(selfPreview.exactApproval),
    );
  }

  async function sendGift() {
    if (
      !normalizedGift ||
      !giftPreview ||
      !giftState.data ||
      giftTokenValue === undefined ||
      (giftMode === "renew" && !giftState.data.active) ||
      giftPeriodValue === undefined ||
      giftError
    )
      return;
    await perform(
      `Gift ${giftPeriodValue} period${giftPeriodValue === 1n ? "" : "s"}`,
      giftMode === "new"
        ? tierWrite("giftMembership", [normalizedGift, giftPeriodValue, 25n])
        : tierWrite("giftRenewal", [
            giftTokenValue,
            normalizedGift,
            giftPeriodValue,
            giftState.data.referralStatus === "unset"
              ? 0
              : giftState.data.referralStatus === "locked-none"
                ? 1
                : 2,
            giftState.data.referrer,
            25n,
          ]),
      async (receipt) => {
        if (
          !receiptProvesPayment(receipt, {
            tier: snapshot.address,
            payer: account.address!,
            recipient: normalizedGift,
            gross: giftPreview.gross,
            periods: giftPeriodValue,
          })
        ) {
          return undefined;
        }
        const payment = parseEventLogs({
          abi: membershipTierAbi,
          eventName: "PaymentProcessed",
          logs: receipt.logs,
          strict: true,
        }).find(
          (event) =>
            isSameAddress(event.address, snapshot.address) &&
            isSameAddress(event.args.recipient, normalizedGift) &&
            isSameAddress(event.args.payer, account.address!),
        );
        if (
          !payment ||
          (giftMode === "renew" && payment.args.tokenId !== giftTokenValue)
        )
          return undefined;
        const blockNumber = receipt.blockNumber;
        const recipient = await readGiftRecipientState(client, {
          tier: snapshot.address,
          recipient: normalizedGift,
          tokenId: payment.args.tokenId,
          blockNumber,
        });
        const shares = await client.readContract({
          address: snapshot.address,
          abi: membershipTierAbi,
          functionName: "sharesOf",
          args: [recipient.tokenId],
          blockNumber,
        });
        const actual = reconcilePaymentWeight(receipt, {
          tier: snapshot.address,
          payer: account.address!,
          recipient: normalizedGift,
          gross: giftPreview.gross,
          periods: giftPeriodValue,
          tokenId: recipient.tokenId,
          shares,
        });
        if (actual === undefined) return undefined;
        setIssuedWeight(actual);
        await onRefresh();
        return recipient;
      },
      approval(giftPreview.exactApproval),
    );
  }

  const primaryDisabled =
    !writesVerified ||
    !walletReady ||
    snapshot.paused ||
    Boolean(snapshot.credential && !snapshot.credential.active) ||
    capacityFull ||
    exceedsPrepaymentLimit ||
    !primaryInputValid ||
    (snapshot.walletPaymentTokenBalance ?? 0n) < selfPreview.gross;

  const network = getSupportedChain(expectedChainId);
  const explorerUrl = network.blockExplorers?.default.url;
  const earnings = useQuery({
    queryKey: [
      "membership-earnings",
      expectedChainId,
      snapshot.address,
      snapshot.wallet,
      snapshot.credential?.tokenId.toString(),
    ],
    queryFn: () =>
      client.readContract({
        address: snapshot.address,
        abi: membershipTierAbi,
        functionName: "previewAccounting",
        args: [
          snapshot.credential?.tokenId ?? 0n,
          snapshot.wallet ?? zeroAddress,
          snapshot.wallet ?? zeroAddress,
          256n,
        ],
      }),
    initialData: snapshot.vesting?.preview,
    enabled: Boolean(snapshot.wallet),
    refetchInterval: 15_000,
    retry: false,
  });
  const retiredCredit = useQuery({
    queryKey: [
      "retired-credit",
      expectedChainId,
      snapshot.address,
      snapshot.wallet,
    ],
    queryFn: () =>
      client.readContract({
        address: snapshot.address,
        abi: membershipTierAbi,
        functionName: "claimableRetiredReward",
        args: [snapshot.wallet!],
      }),
    enabled: Boolean(snapshot.wallet),
    retry: false,
    refetchInterval: 15_000,
  });
  const [maintenanceOutcome, setMaintenanceOutcome] =
    useState<MaintenanceOutcome>();
  const rewardClaim = earnings.data?.current.member ?? 0n;
  const referralClaim = earnings.data?.current.referral ?? 0n;
  const creatorClaim =
    snapshot.wallet && isSameAddress(snapshot.wallet, snapshot.creator)
      ? (earnings.data?.current.creator ?? 0n)
      : 0n;
  const claimsBehind =
    earnings.data &&
    (!earnings.data.current.status.complete ||
      earnings.data.processedSteps > 25n);
  const hasClaims = rewardClaim > 0n || referralClaim > 0n || creatorClaim > 0n;
  const fundingShortfall =
    snapshot.walletPaymentTokenBalance !== undefined &&
    snapshot.walletPaymentTokenBalance < selfPreview.gross
      ? selfPreview.gross - snapshot.walletPaymentTokenBalance
      : 0n;
  const giftFundingShortfall =
    giftPreview &&
    giftPreview.gross > (snapshot.walletPaymentTokenBalance ?? 0n)
      ? giftPreview.gross - (snapshot.walletPaymentTokenBalance ?? 0n)
      : 0n;

  async function wrapForPayment(amount: bigint) {
    const payer = account.address;
    if (
      !payer ||
      !writesVerified ||
      amount <= 0n ||
      !isWrappedNative(expectedChainId, snapshot.paymentToken)
    )
      return;
    const previousBalance = snapshot.walletPaymentTokenBalance ?? 0n;
    await perform(
      "Wrap ETH",
      async () => {
        const { request } = await simulateContract(wagmiConfig, {
          account: payer,
          chainId: expectedChainId,
          address: snapshot.paymentToken,
          abi: iWrappedNativeAbi,
          functionName: "deposit",
          value: amount,
        });
        await assertSufficientGas(client, payer, request);
        return () => write.writeContractAsync(request);
      },
      (receipt) =>
        reconcileSnapshot(
          (next) =>
            parseEventLogs({
              abi: erc20Abi,
              eventName: "Transfer",
              logs: receipt.logs,
            }).some(
              (log) =>
                isSameAddress(log.address, snapshot.paymentToken) &&
                log.args.from === zeroAddress &&
                isSameAddress(log.args.to, payer) &&
                log.args.value === amount,
            ) &&
            next.walletPaymentTokenBalance !== undefined &&
            next.walletPaymentTokenBalance >= previousBalance + amount,
        ),
    );
  }

  function wrappingAction(amount: bigint) {
    if (
      amount <= 0n ||
      !walletReady ||
      !isWrappedNative(expectedChainId, snapshot.paymentToken)
    )
      return null;
    const hasNative = (snapshot.walletEthBalance ?? 0n) > amount;
    return (
      <div className="funding-notice">
        <p>
          Convert {formatEther(amount)} ETH to WETH for this payment. Wrapping
          is 1:1 and needs a network fee. After confirmation, continue with your
          payment.
        </p>
        {!hasNative && (
          <p>Add enough ETH to cover the wrap and network fees.</p>
        )}
        <button
          type="button"
          className="button button-warning"
          disabled={!writesVerified || !hasNative}
          onClick={() => void wrapForPayment(amount)}
        >
          Wrap {formatEther(amount)} ETH
        </button>
      </div>
    );
  }
  const displayedHash = transaction.replacementHash ?? transaction.hash;
  const isCreator = Boolean(
    snapshot.wallet && isSameAddress(snapshot.wallet, snapshot.creator),
  );
  const managePath =
    `/chains/${expectedChainId}/tiers/${snapshot.address}/manage` as Route;

  const positionSelector = snapshot.wallet && snapshot.ownerPage && (
    <PositionSelector
      key={`${snapshot.wallet}:${capturedBlock}`}
      chainId={expectedChainId}
      tier={snapshot.address}
      owner={snapshot.wallet}
      blockNumber={capturedBlock}
      initialPage={snapshot.ownerPage}
      selectedTokenId={snapshot.credential?.tokenId ?? 0n}
      onSelect={onSelectPosition}
      busy={isTransactionInFlight(transaction.phase)}
    />
  );

  return (
    <div className="membership-experience">
      {transferOutcome && <p role="status">{transferOutcome}</p>}
      <section className="membership-hero" aria-label="Membership overview">
        <div className="membership-artwork-stage">
          <CollectionArtwork
            key={artworkSrc}
            name={snapshot.name}
            src={artworkSrc}
          />
        </div>
        <div className="membership-hero-copy">
          <div className="membership-identity-heading">
            <p className="eyebrow">Membership</p>
            <span className="membership-symbol">{snapshot.symbol}</span>
          </div>
          <h1 className="font-display">{snapshot.name}</h1>
          <p className="membership-description">
            {snapshot.description ||
              "The creator has not added a description yet."}
          </p>
          {externalUrl && (
            <a
              className="membership-external-link"
              href={externalUrl}
              rel="noreferrer"
              target="_blank"
            >
              Visit creator link
            </a>
          )}
          <div className="membership-action-links">
            {isCreator && (
              <Link
                className="button button-dark button-small"
                href={managePath}
              >
                Manage membership
              </Link>
            )}
            <ShareMembership
              chainId={expectedChainId}
              name={snapshot.name}
              referrer={account.address}
              tier={snapshot.address}
            />
          </div>

          <dl className="membership-essentials" aria-label="Membership terms">
            <div>
              <dt>Price</dt>
              <dd>{paymentLabel(snapshot.pricePerPeriod)}</dd>
            </div>
            <div>
              <dt>Period</dt>
              <dd>{formatPeriod(snapshot.periodDuration)}</dd>
            </div>
            <div>
              <dt>Members</dt>
              <dd>
                {snapshot.occupiedSupply.toString()}
                {snapshot.supplyCap === 0n
                  ? " active"
                  : ` of ${snapshot.supplyCap.toString()}`}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {!snapshot.credential && positionSelector}
      {snapshot.credential && (
        <section
          className={`membership-status status-${actionState}`}
          aria-label="Current membership status"
        >
          <div>
            {positionSelector}
            <h2 id="membership-status-title">
              {membershipStatusTitle(snapshot.credential)}
            </h2>
          </div>
          <dl>
            <div>
              <dt>Access</dt>
              <dd>{snapshot.credential.active ? "Active" : "Inactive"}</dd>
            </div>
            <div>
              <dt>Through</dt>
              <dd>{formatMembershipDate(snapshot.credential.expiration)}</dd>
            </div>
            <div>
              <dt>Reward share</dt>
              <dd>{rewardShare}</dd>
            </div>
            <div>
              <dt>Reward eligibility</dt>
              <dd>
                {snapshot.credential.rewardEligible
                  ? "Eligible"
                  : "Not eligible"}
              </dd>
            </div>
          </dl>
          <details className="technical-details membership-eligibility">
            <summary>About your reward share</summary>
            <p>Your share is your portion of the eligible reward pool.</p>
            <dl>
              {" "}
              <div>
                <dt>Membership</dt>
                <dd>#{snapshot.credential.tokenId.toString()}</dd>
              </div>
              <div>
                <dt>NFT</dt>
                <dd>
                  {snapshot.credential.minted ? "In this wallet" : "Retired"}
                </dd>
              </div>
            </dl>
            <p>
              {snapshot.credential.rewardEligible
                ? "This position earns rewards until its expiration or cancellation."
                : "Retirement permanently removes weight. Already-earned rewards remain available separately."}
            </p>
          </details>
        </section>
      )}

      <div className={`supporter-columns ${!hasClaims ? "is-single" : ""}`}>
        <div className="supporter-primary">
          <section className="supporter-action" aria-label="Membership action">
            <h2 id="primary-action-title">{primaryTitle}</h2>
            <p className="action-description">{primaryDescription}</p>
            {!walletReady && <WalletControl />}
            {snapshot.pricePerPeriod === 0n ? (
              <label className="creator-field">
                <span>
                  Optional {paymentTokenState?.symbol ?? "token"} contribution
                </span>
                <input
                  aria-invalid={!primaryInputEmpty && !primaryInputValid}
                  inputMode="decimal"
                  min="0"
                  onChange={(event) => setContribution(event.target.value)}
                  value={contribution}
                />
                <small>
                  Enter 0 to join without a payment, or at least{" "}
                  {paymentLabel(snapshot.minimumPayment)}. This minimum is fixed
                  for this membership.
                </small>
              </label>
            ) : (
              <label className="creator-field">
                <span>Periods</span>
                <input
                  aria-invalid={!primaryInputEmpty && periodValue === undefined}
                  inputMode="numeric"
                  min="1"
                  onChange={(event) => setPeriods(event.target.value)}
                  value={periods}
                />
              </label>
            )}

            <dl
              className="payment-preview"
              aria-label="Membership payment preview"
            >
              <div>
                <dt>Total</dt>
                <dd>{paymentLabel(selfPreview.gross)}</dd>
              </div>
              <div>
                <dt>Access added</dt>
                <dd>
                  {selfPreview.duration === 0n
                    ? "0 days"
                    : formatPeriod(selfPreview.duration)}
                </dd>
              </div>
              <div>
                <dt>Membership through</dt>
                <dd>{formatMembershipDate(selfPreview.resultingExpiration)}</dd>
              </div>
            </dl>
            <details className="technical-details reward-preview-details">
              <summary>Reward details</summary>
              <p className="small-copy" aria-live="polite">
                {primaryInputEmpty
                  ? ""
                  : !primaryInputValid
                    ? "Enter a valid payment to preview reward weight."
                    : rewardQuote.data !== undefined
                      ? `Estimated new reward weight: ${weightLabel(rewardQuote.data.sharesAdded)} shares (${averageRewardBoost(rewardQuote.data.sharesAdded, selfPreview.gross)} average). This weight stays with the live position until retirement.`
                      : rewardQuote.isError
                        ? "Reward weight preview is unavailable. The contract will check this payment before confirmation."
                        : "Checking reward weight…"}
              </p>
              <RewardPurchaseCurve
                terms={snapshot}
                quote={
                  primaryInputValid &&
                  !primaryInputEmpty &&
                  !rewardQuote.isError
                    ? rewardQuote.data
                    : undefined
                }
              />
              {snapshot.pricePerPeriod === 0n && (
                <p className="small-copy">
                  Free membership time adds no reward weight.
                </p>
              )}
              {snapshot.credential?.rewardEligible &&
                snapshot.pricePerPeriod === 0n &&
                selfPreview.gross === 0n && (
                  <p className="small-copy">
                    Free renewal keeps this live position’s weight until its new
                    expiration. It adds no new weight or reward funding.
                  </p>
                )}
            </details>
            {scheduledPeriodPrice ? (
              <p className="small-copy" role="status">
                Starting {scheduledPeriodPrice.effectiveAt.toLocaleString()},
                one period will display as{" "}
                {scheduledPeriodPrice.futureFormatted}{" "}
                {paymentTokenState?.symbol}. The raw contract price does not
                change.
              </p>
            ) : null}
            <p className="small-copy" aria-live="polite">
              {primaryInputEmpty ? (
                ""
              ) : !primaryInputValid ? (
                snapshot.pricePerPeriod === 0n ? (
                  `Enter a valid ${paymentTokenState?.symbol ?? "token"} contribution.`
                ) : (
                  "Enter 1 or more whole periods."
                )
              ) : selfPreview.exactApproval > 0n ? (
                <>
                  Your wallet will first request an exact{" "}
                  {paymentLabel(selfPreview.exactApproval)} approval.
                </>
              ) : (
                `Your current ${paymentTokenState?.symbol ?? "token"} allowance covers this payment.`
              )}
            </p>
            {fundingShortfall > 0n && (
              <p className="funding-notice" role="status">
                Add {paymentLabel(fundingShortfall)} to this wallet to continue.
                Your balance is{" "}
                {paymentLabel(snapshot.walletPaymentTokenBalance ?? 0n)}.
                {expectedChainId === 46_630 ? (
                  <>
                    {" "}
                    Get test assets from the{" "}
                    <Link
                      href={robinhoodTestnetFaucetUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      official faucet
                    </Link>
                    .
                  </>
                ) : null}
              </p>
            )}
            {wrappingAction(fundingShortfall)}
            {!primaryInputEmpty &&
              walletReady &&
              (snapshot.walletEthBalance ?? 0n) === 0n && (
                <p className="funding-notice" role="status">
                  Add a small amount of ETH on {network.name} for gas.
                  {expectedChainId === 46_630 ? (
                    <>
                      {" "}
                      Get test ETH from the{" "}
                      <Link
                        href={robinhoodTestnetFaucetUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        official faucet
                      </Link>
                      .
                    </>
                  ) : null}
                </p>
              )}
            {capacityFull && (
              <p className="inline-status" role="alert">
                This membership is currently full.
              </p>
            )}
            {exceedsPrepaymentLimit && (
              <p className="inline-status" role="alert">
                Choose fewer periods to stay within the membership limit.
              </p>
            )}
            {snapshot.paused && (
              <p className="inline-status" role="alert">
                New membership time is temporarily paused.
              </p>
            )}
            <button
              className="button button-applause"
              disabled={primaryDisabled}
              onClick={() => void buyForSelf()}
              type="button"
            >
              {primaryTitle}
            </button>

            {transaction.phase !== "idle" && (
              <div
                aria-live="polite"
                className={`membership-transaction transaction-${transaction.phase}`}
                role={transaction.error ? "alert" : "status"}
              >
                <strong>{preparedAction}</strong>
                <span>
                  {transactionStatusCopy(
                    transaction.phase,
                    paymentTokenState?.symbol ?? "token",
                  )}
                </span>
                {transaction.error && <span>{transaction.error}</span>}
                {transaction.error?.includes(
                  "Membership accounting needs to catch up",
                ) && (
                  <a
                    href={`#tier-accounting-${snapshot.address.toLowerCase()}`}
                    onClick={(event) => {
                      const root = event.currentTarget.closest(
                        ".membership-experience",
                      );
                      const details = root?.querySelector<HTMLDetailsElement>(
                        ".membership-accounting",
                      );
                      if (details) details.open = true;
                    }}
                  >
                    Catch up accounting
                  </a>
                )}
                {transaction.phase === "confirmed" &&
                  issuedWeight !== undefined && (
                    <span>
                      Actual new reward weight: {weightLabel(issuedWeight)}{" "}
                      shares. Cash rewards vest over paid membership time.
                    </span>
                  )}

                {displayedHash && explorerUrl && (
                  <a
                    href={`${explorerUrl}/tx/${displayedHash}`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    View transaction
                  </a>
                )}
              </div>
            )}
          </section>
        </div>

        {(hasClaims || earnings.isError) && (
          <aside className="supporter-secondary">
            <section className="claim-groups" aria-labelledby="claims-title">
              <h2 id="claims-title">Your earnings</h2>
              {earnings.isError ? (
                <p role="alert">
                  Earnings unavailable.{" "}
                  <button
                    className="text-button"
                    onClick={() => void earnings.refetch()}
                  >
                    Refresh
                  </button>
                </p>
              ) : (
                <>
                  {[
                    ["Membership rewards", rewardClaim],
                    ["Referral proceeds", referralClaim],
                    ["Creator proceeds", creatorClaim],
                  ].map(
                    ([label, raw]) =>
                      (raw as bigint) > 0n && (
                        <div className="claim-row" key={label as string}>
                          <strong>{label as string}</strong>
                          <StreamingAmount
                            identity={`${expectedChainId}:${account.address}:${snapshot.address}:${label}`}
                            streams={
                              earnings.data
                                ? [
                                    earningsStream(
                                      earnings.data,
                                      label === "Membership rewards"
                                        ? 1
                                        : label === "Referral proceeds"
                                          ? 2
                                          : 0,
                                    ),
                                  ]
                                : []
                            }
                            format={paymentLabel}
                            refresh={() => earnings.refetch()}
                            active={!earnings.isError}
                          />
                        </div>
                      ),
                  )}
                  {earnings.data && !earnings.data.current.status.complete && (
                    <p className="small-copy">
                      Partial earnings shown. Advance accounting to update the
                      rest.
                    </p>
                  )}
                  {claimsBehind ? (
                    <a
                      className="button button-outline"
                      href={`#tier-accounting-${snapshot.address.toLowerCase()}`}
                      onClick={() => {
                        const section =
                          document.querySelector<HTMLDetailsElement>(
                            ".membership-accounting",
                          );
                        if (section) section.open = true;
                      }}
                    >
                      Advance to claim
                    </a>
                  ) : (
                    <button
                      className="button button-outline"
                      type="button"
                      disabled={!writesVerified}
                      onClick={() =>
                        void perform(
                          "Claim rewards",
                          tierWrite("claimRewards", [
                            snapshot.credential
                              ? [snapshot.credential.tokenId]
                              : [],
                            25n,
                          ]),
                          reconcileClaims,
                        )
                      }
                    >
                      Claim rewards
                    </button>
                  )}
                  {claimsBehind && earnings.data && (
                    <details className="technical-details">
                      <summary>Settled funds</summary>
                      {(
                        [
                          [
                            "Referral proceeds",
                            earnings.data.settled.referral,
                            "claimReferral",
                            [],
                          ],
                          [
                            "Creator proceeds",
                            snapshot.wallet &&
                            isSameAddress(snapshot.wallet, snapshot.creator)
                              ? earnings.data.settled.creator
                              : 0n,
                            "withdrawCreatorProceeds",
                            [],
                          ],
                        ] as const
                      ).map(
                        ([label, amount, method, args]) =>
                          amount > 0n && (
                            <div className="claim-row" key={method}>
                              <div>
                                <strong>{label}</strong>
                                <span>{paymentLabel(amount)}</span>
                              </div>
                              <button
                                className="text-button"
                                type="button"
                                disabled={!writesVerified}
                                onClick={() =>
                                  void perform(
                                    "Claim settled rewards",
                                    tierWrite(method, args),
                                    reconcileClaims,
                                  )
                                }
                              >
                                Claim settled
                              </button>
                            </div>
                          ),
                      )}
                    </details>
                  )}
                </>
              )}
            </section>
          </aside>
        )}

        {payout && transaction.phase === "confirmed" && (
          <p className="vesting-summary" role="status">
            Paid {paymentLabel(payout.amount)} to {payout.recipient}. New
            earnings may still become available.
          </p>
        )}
        {(snapshot.wallet || snapshot.vesting) && (
          <details className="technical-details membership-accounting">
            <summary>Rewards & accounting</summary>
            <div className="membership-accounting-grid">
              {snapshot.vesting && (
                <VestingSummary
                  reserves={snapshot.vesting.reserves}
                  paymentLabel={paymentLabel}
                />
              )}
              {!earnings.data && snapshot.vestingError && (
                <p role="alert">
                  Reward projection unavailable. {snapshot.vestingError}
                </p>
              )}
              <MembershipMaintenance
                status={earnings.data?.settled.status ?? snapshot.accounting}
                canAdvance={writesVerified && walletReady}
                stale={!fresh}
                pending={isTransactionInFlight(transaction.phase)}
                outcome={maintenanceOutcome}
                onAdvance={() =>
                  void perform(
                    "Advance maintenance",
                    tierWrite("processAccounting", [25n]),
                    async (receipt) => {
                      const outcome = receiptMembershipMaintenance(
                        receipt,
                        snapshot.address,
                      );
                      if (!outcome) return undefined;
                      setMaintenanceOutcome(outcome);
                      await earnings.refetch();
                      return onRefresh(
                        receiptRetiredSelection(receipt) ? 0n : undefined,
                      );
                    },
                  )
                }
              />
              {snapshot.wallet && (
                <RetiredRewardClaim
                  credit={retiredCredit.data}
                  canClaim={writesVerified && walletReady}
                  loading={retiredCredit.isPending}
                  stale={!fresh || retiredCredit.isError}
                  error={
                    retiredCredit.error
                      ? decodeTransactionError(retiredCredit.error)
                      : undefined
                  }
                  pending={isTransactionInFlight(transaction.phase)}
                  paymentLabel={paymentLabel}
                  onClaim={() =>
                    void perform(
                      "Claim ended membership rewards",
                      tierWrite("claimRetiredRewards"),
                      async (receipt) => {
                        const paid = receiptRetiredReward(receipt, {
                          tier: snapshot.address,
                          owner: snapshot.wallet!,
                        });
                        if (!paid) return undefined;
                        setPayout(paid);
                        await retiredCredit.refetch();
                        return onRefresh();
                      },
                    )
                  }
                />
              )}
              <ReleaseTierFees
                chainId={expectedChainId}
                tier={snapshot.address}
                blockNumber={capturedBlock}
                onConfirmed={onRefresh}
              />
            </div>
          </details>
        )}

        {snapshot.credential &&
          snapshot.wallet &&
          isSameAddress(snapshot.credential.owner, snapshot.wallet) && (
            <TransferMembership
              key={snapshot.credential.tokenId.toString()}
              chainId={expectedChainId}
              tier={snapshot.address}
              tokenId={snapshot.credential.tokenId}
              owner={snapshot.wallet}
              expiration={snapshot.credential.expiration}
              asOf={snapshot.capturedTimestamp}
              canOperate={
                fresh &&
                guard.enabled &&
                walletReady &&
                (snapshot.walletEthBalance ?? 0n) > 0n &&
                !write.isPending &&
                !isTransactionInFlight(transaction.phase)
              }
              pending={isTransactionInFlight(transaction.phase)}
              onTransfer={(recipient) =>
                perform(
                  `Transfer membership #${snapshot.credential!.tokenId}`,
                  tierWrite("safeTransferFrom", [
                    snapshot.wallet!,
                    recipient,
                    snapshot.credential!.tokenId,
                    "0x",
                  ]),
                  async (receipt) => {
                    const result = await reconcileMembershipTransfer(
                      client,
                      receipt,
                      {
                        tier: snapshot.address,
                        tokenId: snapshot.credential!.tokenId,
                        from: snapshot.wallet!,
                        to: recipient,
                      },
                    );
                    if (!result) return undefined;
                    setTransferOutcome(
                      `Membership #${snapshot.credential!.tokenId} transferred to ${result.recipient}. ${result.currentOwner ? `Current owner: ${result.currentOwner}.` : "The position has since retired."}`,
                    );
                    await onRefresh(
                      result.currentOwner &&
                        isSameAddress(result.currentOwner, snapshot.wallet!)
                        ? undefined
                        : 0n,
                    );
                    return result;
                  },
                )
              }
              onApprove={(spender) =>
                perform(
                  "Update token transfer approval",
                  tierWrite("approve", [spender, snapshot.credential!.tokenId]),
                  async (receipt) => {
                    const proven = parseEventLogs({
                      abi: membershipTierAbi,
                      eventName: "Approval",
                      logs: receipt.logs,
                      strict: true,
                    }).some(
                      (event) =>
                        isSameAddress(event.address, snapshot.address) &&
                        event.args.tokenId === snapshot.credential!.tokenId &&
                        isSameAddress(event.args.owner, snapshot.wallet!) &&
                        isSameAddress(event.args.approved, spender),
                    );
                    return proven
                      ? client.readContract({
                          address: snapshot.address,
                          abi: membershipTierAbi,
                          functionName: "getApproved",
                          args: [snapshot.credential!.tokenId],
                        })
                      : undefined;
                  },
                )
              }
              onOperatorApproval={(operator, approved) =>
                perform(
                  "Update operator transfer permission",
                  tierWrite("setApprovalForAll", [operator, approved]),
                  async (receipt) => {
                    const proven = parseEventLogs({
                      abi: membershipTierAbi,
                      eventName: "ApprovalForAll",
                      logs: receipt.logs,
                      strict: true,
                    }).some(
                      (event) =>
                        isSameAddress(event.address, snapshot.address) &&
                        isSameAddress(event.args.owner, snapshot.wallet!) &&
                        isSameAddress(event.args.operator, operator) &&
                        event.args.approved === approved,
                    );
                    return proven
                      ? client.readContract({
                          address: snapshot.address,
                          abi: membershipTierAbi,
                          functionName: "isApprovedForAll",
                          args: [snapshot.wallet!, operator],
                        })
                      : undefined;
                  },
                )
              }
            />
          )}
        {snapshot.pricePerPeriod > 0n && (
          <details className="gift-action">
            <summary>Gift this membership</summary>
            <div>
              <h2>Send membership time</h2>
              <label className="creator-field">
                <span>Gift action</span>
                <select
                  value={giftMode}
                  onChange={(event) =>
                    setGiftMode(event.target.value as "new" | "renew")
                  }
                >
                  <option value="new">New gift membership</option>
                  <option value="renew">Sponsor an existing membership</option>
                </select>
              </label>
              {giftMode === "renew" && (
                <label className="creator-field">
                  <span>Membership ID to sponsor</span>
                  <input
                    inputMode="numeric"
                    value={giftToken}
                    onChange={(event) => setGiftToken(event.target.value)}
                  />
                </label>
              )}
              <p>The recipient gets membership access without paying.</p>
              <label className="creator-field">
                <span>Recipient wallet</span>
                <input
                  className="font-mono"
                  onChange={(event) => setGiftRecipient(event.target.value)}
                  value={giftRecipient}
                />
                {giftRecipient && giftError && (
                  <small role="alert">{giftError}</small>
                )}
              </label>
              <label className="creator-field">
                <span>Whole periods</span>
                <input
                  inputMode="numeric"
                  min="1"
                  onChange={(event) => setGiftPeriods(event.target.value)}
                  value={giftPeriods}
                />
              </label>
              {giftState.isLoading && (
                <p className="inline-status" role="status">
                  Checking the recipient&apos;s membership.
                </p>
              )}
              {giftState.error && (
                <p className="inline-status" role="alert">
                  Recipient details are unavailable. Try again.
                </p>
              )}
              {giftPreview && (
                <dl className="payment-preview">
                  <div>
                    <dt>Total</dt>
                    <dd>{paymentLabel(giftPreview.gross)}</dd>
                  </div>
                  <div>
                    <dt>Access added</dt>
                    <dd>{formatPeriod(giftPreview.duration)}</dd>
                  </div>
                  <div>
                    <dt>Membership through</dt>
                    <dd>
                      {formatMembershipDate(giftPreview.resultingExpiration)}
                    </dd>
                  </div>
                </dl>
              )}
              {giftPreview && (
                <p className="small-copy" aria-live="polite">
                  {giftRewardQuote.data !== undefined
                    ? `Estimated new reward weight for the recipient: ${weightLabel(giftRewardQuote.data.sharesAdded)} shares (${averageRewardBoost(giftRewardQuote.data.sharesAdded, giftPreview.gross)} average). This weight stays with the live position until retirement.`
                    : giftRewardQuote.isError
                      ? "Recipient reward weight preview is unavailable."
                      : "Checking recipient reward weight…"}
                </p>
              )}
              {giftCapacityFull && (
                <p className="inline-status" role="alert">
                  This membership is currently full.
                </p>
              )}
              {wrappingAction(giftFundingShortfall)}
              {giftExceedsPrepaymentLimit && (
                <p className="inline-status" role="alert">
                  This gift would exceed the recipient&apos;s prepaid period
                  limit.
                </p>
              )}
              <button
                className="button button-warning"
                disabled={
                  !writesVerified ||
                  Boolean(giftError) ||
                  !giftPreview ||
                  giftTokenValue === undefined ||
                  (giftMode === "renew" && !giftState.data?.active) ||
                  snapshot.paused ||
                  giftCapacityFull ||
                  giftExceedsPrepaymentLimit ||
                  (snapshot.walletPaymentTokenBalance ?? 0n) <
                    (giftPreview?.gross ?? 0n)
                }
                onClick={() => void sendGift()}
                type="button"
              >
                Send gift
              </button>
            </div>
          </details>
        )}
      </div>

      <details className="contract-facts">
        <summary>Contract Addresses</summary>
        <dl>
          {" "}
          <div>
            <dt>Protocol allocation</dt>
            <dd>{snapshot.protocolFeeBps / 100}% of each payment</dd>
          </div>
          <div>
            <dt>Membership</dt>
            <dd>
              <CopyableAddress
                address={snapshot.address}
                explorerUrl={explorerUrl}
                label="Membership"
              />
            </dd>
          </div>
          <div>
            <dt>Creator</dt>
            <dd>
              <CopyableAddress
                address={snapshot.creator}
                explorerUrl={explorerUrl}
                label="Creator"
              />
            </dd>
          </div>
          <div>
            <dt>Factory</dt>
            <dd>
              <CopyableAddress
                address={snapshot.factory}
                explorerUrl={explorerUrl}
                label="Factory"
              />
            </dd>
          </div>
          <div>
            <dt>Payment token</dt>
            <dd>
              <CopyableAddress
                address={snapshot.paymentToken}
                explorerUrl={explorerUrl}
                label="Payment token"
              />
            </dd>
          </div>
          <div>
            <dt>Renderer</dt>
            <dd>
              <CopyableAddress
                address={snapshot.renderer}
                explorerUrl={explorerUrl}
                label="Renderer"
              />
            </dd>
          </div>
        </dl>
      </details>
    </div>
  );
}
