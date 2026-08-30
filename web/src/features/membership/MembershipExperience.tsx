"use client";

import Link from "next/link";
import type { Route } from "next";
import { useLayoutEffect, useReducer, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { simulateContract } from "@wagmi/core";
import {
  formatUnits,
  getAddress,
  isAddress,
  zeroAddress,
  type Address,
  type Hash,
} from "viem";
import { useConfig, usePublicClient, useWriteContract } from "wagmi";

import { WalletControl } from "@/components/WalletControl";
import { membershipTierAbi, usdgAbi } from "@/contracts";
import type { TierSupporterSnapshot } from "@/contracts/types";
import { parseUint64Input } from "@/features/creator/management";
import { readGiftRecipientState } from "@/features/membership/membership-read";
import { formatMembershipDate } from "@/features/membership/date";
import {
  captureSharedReferrer,
  membershipShareUrl,
} from "@/features/membership/referral";
import {
  buildPaymentPreview,
  classifyMembershipState,
  parseUsdg,
  validateGift,
} from "@/features/membership/state";
import {
  receiptProvesPayment,
  receiptProvesReferralClaim,
  receiptProvesRewardClaim,
} from "@/features/protocol/payout-reconciliation";
import { assertSufficientGas } from "@/features/protocol/gas-readiness";
import { receiptProvesCreatorWithdrawal } from "@/features/protocol/withdrawal-reconciliation";
import {
  isSuccessfulWriteReceipt,
  reconcileSuccessfulWrite,
  type SuccessfulWriteReceipt,
} from "@/features/protocol/write-reconciliation";
import { getWriteGuard, type AuthenticityResult } from "@/lib/authenticity";
import { isSameAddress } from "@/lib/address";
import { getDeployment, publicConfig } from "@/lib/config";
import { getSupportedChain } from "@/lib/chains";
import { useHydratedAccount } from "@/lib/use-hydrated-account";
import type { ReadState } from "@/lib/read-state";
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

function transactionStatusCopy(phase: string) {
  switch (phase) {
    case "simulation":
      return "Checking the details…";
    case "approval":
      return "Approve USDG in your wallet.";
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

function statusCopy(state: ReturnType<typeof classifyMembershipState>) {
  switch (state) {
    case "unready":
      return [
        "Join this membership",
        "Connect your wallet to choose your membership time.",
      ];
    case "joinable":
      return [
        "Join this membership",
        "Choose how long you would like to join.",
      ];
    case "active":
      return [
        "Renew active membership",
        "New subscription extends the current.",
      ];
    case "expired-occupied":
      return [
        "Renew your membership",
        "Your access has ended. Renew to continue.",
      ];
    case "historical-synchronized":
      return [
        "Rejoin this membership",
        "Choose a new membership period to return.",
      ];
  }
}

function membershipStatusTitle(credential: {
  active: boolean;
  occupied: boolean;
}) {
  if (credential.active) return "Membership active";
  return credential.occupied ? "Membership expired" : "Previous membership";
}

export function MembershipExperience({
  snapshot,
  capturedBlock,
  fresh,
  onRefresh,
  expectedChainId,
}: {
  snapshot: TierSupporterSnapshot;
  capturedBlock: bigint;
  fresh: boolean;
  expectedChainId: 4663 | 46630 | 31337;
  onRefresh: () => Promise<ReadState<TierSupporterSnapshot> | undefined>;
}) {
  const account = useHydratedAccount();
  const write = useWriteContract();
  const wagmiConfig = useConfig();
  const client = usePublicClient({ chainId: expectedChainId })!;
  const deployment = getDeployment(publicConfig, expectedChainId);
  const [transaction, dispatch] = useReducer(
    transactionReducer,
    initialTransactionState,
  );
  const operationInFlight = useRef(false);
  const [periods, setPeriods] = useState("1");
  const [contribution, setContribution] = useState("0");
  const sharedReferrer = useRef<Address | undefined>(undefined);
  const [shareState, setShareState] = useState<
    "idle" | "copied" | "unavailable"
  >("idle");
  const [giftRecipient, setGiftRecipient] = useState("");
  const [giftPeriods, setGiftPeriods] = useState("1");
  const [preparedAction, setPreparedAction] = useState("");

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
    factory: snapshot.factory,
    tier: snapshot.address,
    paymentToken: snapshot.paymentToken,
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
  const [primaryTitle, primaryDescription] = statusCopy(actionState);
  const writesVerified =
    fresh &&
    guard.enabled &&
    (snapshot.walletEthBalance ?? 0n) > 0n &&
    !write.isPending &&
    !isTransactionInFlight(transaction.phase);
  const periodValue = parseUint64Input(periods, { allowZero: false });
  const contributionValue = parseUsdg(contribution);
  const selfPreview =
    periodValue !== undefined && contributionValue !== undefined
      ? buildPaymentPreview({
          now: snapshot.capturedTimestamp,
          currentExpiration: snapshot.credential?.expiration ?? 0n,
          periodDuration: snapshot.periodDuration,
          periods: snapshot.pricePerPeriod === 0n ? 1n : periodValue,
          pricePerPeriod: snapshot.pricePerPeriod,
          contribution: contributionValue,
          allowance: snapshot.allowance ?? 0n,
          rewardBps: snapshot.rewardBps,
          referralBps: snapshot.referralBps,
          referralApplies:
            snapshot.credential?.referralStatus === "locked-address",
        })
      : undefined;
  const reacquiring =
    actionState === "joinable" || actionState === "historical-synchronized";
  const capacityFull =
    reacquiring &&
    snapshot.supplyCap !== 0n &&
    snapshot.occupiedSupply >= snapshot.supplyCap;
  const exceedsPrepaymentLimit =
    selfPreview !== undefined &&
    snapshot.maxPrepaidPeriods !== 0n &&
    (snapshot.credential?.paidSeconds ?? 0n) + selfPreview.duration >
      snapshot.maxPrepaidPeriods * snapshot.periodDuration;

  const normalizedGift = isAddress(giftRecipient.trim())
    ? getAddress(giftRecipient.trim())
    : undefined;
  const giftError = account.address
    ? validateGift(account.address, giftRecipient, snapshot.pricePerPeriod)
    : "Connect the gifting wallet first.";
  const giftState = useQuery({
    queryKey: [
      "gift-recipient",
      expectedChainId,
      snapshot.address,
      normalizedGift,
      capturedBlock.toString(),
    ],
    enabled: Boolean(normalizedGift && !giftError && fresh && client),
    queryFn: () =>
      readGiftRecipientState(client!, {
        tier: snapshot.address,
        recipient: normalizedGift!,
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
          referralBps: snapshot.referralBps,
          referralApplies: giftState.data.referralStatus === "locked-address",
        })
      : undefined;
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
      | "purchase"
      | "contribute"
      | "gift"
      | "claimReward"
      | "claimReferral"
      | "withdrawCreatorProceeds"
      | "synchronize",
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
        abi: usdgAbi,
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
            error: "The wallet cancelled the USDG approval.",
          });
          return undefined;
        }
        if (approvalReceipt.status === "reverted") {
          dispatch({
            type: "REVERTED",
            error: "The USDG approval reverted onchain.",
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
        reconcile,
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

  async function buyForSelf() {
    if (
      !selfPreview ||
      periodValue === undefined ||
      contributionValue === undefined ||
      !account.address
    )
      return;
    const payer = account.address;
    const paymentReferrer = referralAddress(snapshot, sharedReferrer.current);
    const simulate =
      snapshot.pricePerPeriod === 0n
        ? tierWrite("contribute", [contributionValue, paymentReferrer])
        : tierWrite("purchase", [periodValue, paymentReferrer]);
    const priorShares = snapshot.credential?.shares ?? 0n;
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
      (receipt) =>
        reconcileSnapshot((next) => {
          const credential = next.credential;
          return Boolean(
            receiptProvesPayment(receipt, {
              tier: snapshot.address,
              payer,
              recipient: payer,
              gross: selfPreview.gross,
              periods: snapshot.pricePerPeriod === 0n ? 1n : periodValue,
            }) &&
            credential &&
            credential.expiration >= selfPreview.resultingExpiration &&
            credential.shares >= priorShares + selfPreview.sharesAdded &&
            credential.referralStatus === expectedReferral,
          );
        }),
      approval(selfPreview.exactApproval),
    );
  }

  async function sendGift() {
    if (
      !normalizedGift ||
      !giftPreview ||
      !giftState.data ||
      giftPeriodValue === undefined ||
      giftError
    )
      return;
    await perform(
      `Gift ${giftPeriodValue} period${giftPeriodValue === 1n ? "" : "s"}`,
      tierWrite("gift", [
        normalizedGift,
        giftPeriodValue,
        giftState.data.referralStatus === "unset"
          ? 0
          : giftState.data.referralStatus === "locked-none"
            ? 1
            : 2,
        giftState.data.referrer,
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
        const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
        const recipient = await readGiftRecipientState(client, {
          tier: snapshot.address,
          recipient: normalizedGift,
          blockNumber,
        });
        return recipient.expiration >= giftPreview.resultingExpiration &&
          recipient.occupied
          ? recipient
          : undefined;
      },
      approval(giftPreview.exactApproval),
    );
  }

  const primaryDisabled =
    !writesVerified ||
    !walletReady ||
    snapshot.paused ||
    capacityFull ||
    exceedsPrepaymentLimit ||
    !selfPreview ||
    (selfPreview && (snapshot.walletUsdgBalance ?? 0n) < selfPreview.gross);

  const network = getSupportedChain(expectedChainId);
  const explorerUrl = network.blockExplorers?.default.url;
  const rewardClaim = snapshot.credential?.claimableReward ?? 0n;
  const referralClaim = snapshot.claimableReferral ?? 0n;
  const creatorClaim = snapshot.creatorProceeds ?? 0n;
  const hasClaims = rewardClaim > 0n || referralClaim > 0n || creatorClaim > 0n;
  const fundingShortfall =
    selfPreview &&
    snapshot.walletUsdgBalance !== undefined &&
    snapshot.walletUsdgBalance < selfPreview.gross
      ? selfPreview.gross - snapshot.walletUsdgBalance
      : 0n;
  const displayedHash = transaction.replacementHash ?? transaction.hash;
  const isCreator = Boolean(
    snapshot.wallet && isSameAddress(snapshot.wallet, snapshot.creator),
  );
  const managePath =
    `/chains/${expectedChainId}/tiers/${snapshot.address}/manage` as Route;

  async function copyShareLink() {
    if (!account.address) return;
    try {
      await navigator.clipboard.writeText(
        membershipShareUrl({
          origin: window.location.origin,
          chainId: expectedChainId,
          tier: snapshot.address,
          referrer: account.address,
        }),
      );
      setShareState("copied");
    } catch {
      setShareState("unavailable");
    }
  }

  return (
    <div className="membership-experience">
      <div className="tier-identity">
        <div>
          <p className="eyebrow">Membership</p>
          <h1 className="font-display">{snapshot.name}</h1>
          <p>
            {snapshot.description ||
              "The creator has not added a description yet."}
          </p>
        </div>
        <div className="membership-identity-actions">
          <span className="membership-symbol">{snapshot.symbol}</span>
          {account.address && (
            <div className="membership-action-links">
              {isCreator && (
                <Link
                  className="button button-dark button-small"
                  href={managePath}
                >
                  Manage membership
                </Link>
              )}
              <button
                className="text-button"
                onClick={() => void copyShareLink()}
                type="button"
              >
                {shareState === "copied"
                  ? "Link copied"
                  : shareState === "unavailable"
                    ? "Copy unavailable"
                    : "Copy share link"}
              </button>
            </div>
          )}
        </div>
      </div>

      <dl className="membership-essentials" aria-label="Membership terms">
        <div>
          <dt>Price</dt>
          <dd>{formatUnits(snapshot.pricePerPeriod, 6)} USDG</dd>
        </div>
        <div>
          <dt>Membership period</dt>
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

      {snapshot.credential && (
        <section
          className={`membership-status status-${actionState}`}
          aria-label="Current membership status"
        >
          <div>
            <p className="eyebrow">Your membership</p>
            <h2 id="membership-status-title">
              {membershipStatusTitle(snapshot.credential)}
            </h2>
          </div>
          <dl>
            <div>
              <dt>Membership</dt>
              <dd>#{snapshot.credential.tokenId.toString()}</dd>
            </div>
            <div>
              <dt>Access</dt>
              <dd>{snapshot.credential.active ? "Active" : "Inactive"}</dd>
            </div>
            <div>
              <dt>Through</dt>
              <dd>{formatMembershipDate(snapshot.credential.expiration)}</dd>
            </div>
          </dl>
        </section>
      )}

      <div
        className={`supporter-columns ${
          !hasClaims &&
          !(
            snapshot.credential &&
            !snapshot.credential.active &&
            snapshot.credential.occupied
          )
            ? "is-single"
            : ""
        }`}
      >
        <div className="supporter-primary">
          <section className="supporter-action" aria-label="Membership action">
            <p className="eyebrow">
              {snapshot.credential ? "Continue" : "Join"}
            </p>
            <h2 id="primary-action-title">{primaryTitle}</h2>
            <p className="action-description">{primaryDescription}</p>
            {!walletReady && <WalletControl />}
            {snapshot.pricePerPeriod === 0n ? (
              <label className="creator-field">
                <span>Optional USDG contribution</span>
                <input
                  inputMode="decimal"
                  min="0"
                  onChange={(event) => setContribution(event.target.value)}
                  value={contribution}
                />
                <small>Enter 0 to join without a payment.</small>
              </label>
            ) : (
              <label className="creator-field">
                <span>Periods</span>
                <input
                  inputMode="numeric"
                  min="1"
                  onChange={(event) => setPeriods(event.target.value)}
                  value={periods}
                />
              </label>
            )}

            {selfPreview && (
              <dl
                className="payment-preview"
                aria-label="Membership payment preview"
              >
                <div>
                  <dt>Total</dt>
                  <dd>{formatUnits(selfPreview.gross, 6)} USDG</dd>
                </div>
                <div>
                  <dt>Access added</dt>
                  <dd>{formatPeriod(selfPreview.duration)}</dd>
                </div>
                <div>
                  <dt>Membership through</dt>
                  <dd>
                    {formatMembershipDate(selfPreview.resultingExpiration)}
                  </dd>
                </div>
              </dl>
            )}
            {selfPreview && selfPreview.exactApproval > 0n && (
              <p className="small-copy">
                Your wallet will first request an exact{" "}
                {formatUnits(selfPreview.exactApproval, 6)} USDG approval.
              </p>
            )}
            {fundingShortfall > 0n && (
              <p className="funding-notice" role="status">
                Add {formatUnits(fundingShortfall, 6)} USDG to this wallet to
                continue. Your balance is{" "}
                {formatUnits(snapshot.walletUsdgBalance ?? 0n, 6)} USDG.
              </p>
            )}
            {walletReady && (snapshot.walletEthBalance ?? 0n) === 0n && (
              <p className="funding-notice" role="status">
                Add a small amount of ETH on {network.name} for gas.
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
              {snapshot.pricePerPeriod === 0n
                ? "Add one membership period"
                : primaryTitle}
            </button>

            {transaction.phase !== "idle" && (
              <div
                aria-live="polite"
                className={`membership-transaction transaction-${transaction.phase}`}
                role={transaction.error ? "alert" : "status"}
              >
                <strong>{preparedAction}</strong>
                <span>{transactionStatusCopy(transaction.phase)}</span>
                {transaction.error && <span>{transaction.error}</span>}
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

          {snapshot.pricePerPeriod > 0n && (
            <details className="gift-action">
              <summary>Gift this membership</summary>
              <div>
                <h2>Send membership time</h2>
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
                      <dd>{formatUnits(giftPreview.gross, 6)} USDG</dd>
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
                {giftCapacityFull && (
                  <p className="inline-status" role="alert">
                    This membership is currently full.
                  </p>
                )}
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
                    snapshot.paused ||
                    giftCapacityFull ||
                    giftExceedsPrepaymentLimit ||
                    (snapshot.walletUsdgBalance ?? 0n) <
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

        {(hasClaims ||
          (snapshot.credential &&
            !snapshot.credential.active &&
            snapshot.credential.occupied)) && (
          <aside className="supporter-secondary">
            {hasClaims && (
              <section className="claim-groups" aria-labelledby="claims-title">
                <p className="eyebrow">Available now</p>
                <h2 id="claims-title">Funds for this wallet</h2>
                {rewardClaim > 0n && snapshot.credential && (
                  <div className="claim-row">
                    <div>
                      <strong>Membership rewards</strong>
                      <span>{formatUnits(rewardClaim, 6)} USDG</span>
                    </div>
                    <button
                      className="button button-outline"
                      disabled={!writesVerified || rewardClaim === 0n}
                      onClick={() =>
                        void perform(
                          "Claim membership rewards",
                          tierWrite("claimReward", [
                            snapshot.credential!.tokenId,
                          ]),
                          (receipt) =>
                            reconcileSnapshot(
                              (next) =>
                                receiptProvesRewardClaim(receipt, {
                                  tier: snapshot.address,
                                  tokenId: snapshot.credential!.tokenId,
                                  owner: snapshot.credential!.owner,
                                  amount: snapshot.credential!.claimableReward,
                                }) && next.credential?.claimableReward === 0n,
                            ),
                        )
                      }
                      type="button"
                    >
                      Claim to this wallet
                    </button>
                  </div>
                )}
                {referralClaim > 0n && (
                  <div className="claim-row">
                    <div>
                      <strong>Referral proceeds</strong>
                      <span>{formatUnits(referralClaim, 6)} USDG</span>
                    </div>
                    <button
                      className="button button-outline"
                      disabled={!writesVerified || referralClaim === 0n}
                      onClick={() =>
                        void perform(
                          "Claim referral proceeds",
                          tierWrite("claimReferral"),
                          (receipt) =>
                            reconcileSnapshot(
                              (next) =>
                                Boolean(
                                  snapshot.wallet &&
                                  receiptProvesReferralClaim(receipt, {
                                    tier: snapshot.address,
                                    referrer: snapshot.wallet,
                                    amount: snapshot.claimableReferral ?? 0n,
                                  }),
                                ) && (next.claimableReferral ?? 0n) === 0n,
                            ),
                        )
                      }
                      type="button"
                    >
                      Claim to this wallet
                    </button>
                  </div>
                )}
                {creatorClaim > 0n &&
                  snapshot.creatorProceeds !== undefined && (
                    <div className="claim-row">
                      <div>
                        <strong>Creator proceeds</strong>
                        <span>{formatUnits(creatorClaim, 6)} USDG</span>
                      </div>
                      <button
                        className="button button-outline"
                        disabled={
                          !writesVerified || snapshot.creatorProceeds === 0n
                        }
                        onClick={() =>
                          void perform(
                            "Withdraw creator proceeds",
                            tierWrite("withdrawCreatorProceeds"),
                            (receipt) =>
                              reconcileSnapshot(
                                (next) =>
                                  receiptProvesCreatorWithdrawal(receipt, {
                                    tier: snapshot.address,
                                    owner: snapshot.creator,
                                    amount: snapshot.creatorProceeds!,
                                  }) && next.creatorProceeds === 0n,
                              ),
                          )
                        }
                        type="button"
                      >
                        Withdraw to this wallet
                      </button>
                    </div>
                  )}
                <p className="small-copy">
                  Claims always pay this connected wallet. If USDG cannot reach
                  it, the funds remain available here.
                </p>
              </section>
            )}

            {snapshot.credential &&
              !snapshot.credential.active &&
              snapshot.credential.occupied && (
                <section className="maintenance-action">
                  <p className="eyebrow">Expired membership</p>
                  <h2>Release expired capacity</h2>
                  <p>
                    Free this inactive place for another supporter. Your
                    membership history and funds stay intact.
                  </p>
                  <button
                    className="button button-dark"
                    disabled={!writesVerified}
                    onClick={() =>
                      void perform(
                        "Synchronize inactive capacity",
                        tierWrite("synchronize", [
                          snapshot.credential!.tokenId,
                        ]),
                        () =>
                          reconcileSnapshot(
                            (next) =>
                              next.credential?.occupied === false ||
                              next.credential?.active === true,
                          ),
                      )
                    }
                    type="button"
                  >
                    Synchronize this place
                  </button>
                </section>
              )}
          </aside>
        )}
      </div>

      <details className="contract-facts">
        <summary>Contract Addresses</summary>
        <dl>
          <div>
            <dt>Membership</dt>
            <dd className="font-mono">
              {explorerUrl ? (
                <a href={`${explorerUrl}/address/${snapshot.address}`}>
                  {snapshot.address}
                </a>
              ) : (
                snapshot.address
              )}
            </dd>
          </div>
          <div>
            <dt>Creator</dt>
            <dd className="font-mono">{snapshot.creator}</dd>
          </div>
          <div>
            <dt>Factory</dt>
            <dd className="font-mono">{snapshot.factory}</dd>
          </div>
          <div>
            <dt>Payment token</dt>
            <dd className="font-mono">{snapshot.paymentToken}</dd>
          </div>
        </dl>
      </details>
    </div>
  );
}
