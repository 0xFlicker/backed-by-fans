"use client";

import Link from "next/link";
import type { Route } from "next";
import { useReducer, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { simulateContract } from "@wagmi/core";
import {
  formatUnits,
  getAddress,
  isAddress,
  zeroAddress,
  type Hash,
} from "viem";
import {
  useAccount,
  useConfig,
  usePublicClient,
  useWriteContract,
} from "wagmi";

import { TransactionFlow } from "@/components/TransactionFlow";
import { WalletControl } from "@/components/WalletControl";
import { WalletReadiness } from "@/components/WalletReadiness";
import { membershipTierAbi, usdgAbi } from "@/contracts";
import type { TierSupporterSnapshot } from "@/contracts/types";
import { parseUint64Input } from "@/features/creator/management";
import { readGiftRecipientState } from "@/features/membership/membership-read";
import { formatMembershipDate } from "@/features/membership/date";
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
import type { ReadState } from "@/lib/read-state";
import {
  decodeTransactionError,
  initialTransactionState,
  isTransactionInFlight,
  transactionReducer,
} from "@/lib/transaction-state";

type SendWrite = () => Promise<Hash>;
type ReferralChoice = "unselected" | "none" | "address";

function formatPeriod(seconds: bigint) {
  const days = seconds / 86_400n;
  return days > 0n ? `${days} days` : `${seconds} seconds`;
}

function referralAddress(
  snapshot: TierSupporterSnapshot,
  choice: ReferralChoice,
  addressInput: string,
) {
  const locked = snapshot.credential?.referralStatus;
  if (locked === "locked-none") return zeroAddress;
  if (locked === "locked-address") return snapshot.credential!.referrer;
  if (choice === "none") return zeroAddress;
  if (choice === "address" && isAddress(addressInput.trim())) {
    return getAddress(addressInput.trim());
  }
  return undefined;
}

function statusCopy(state: ReturnType<typeof classifyMembershipState>) {
  switch (state) {
    case "unready":
      return [
        "Connect and prepare",
        "Connect a wallet and check gas and USDG before joining.",
      ];
    case "joinable":
      return [
        "Join this membership",
        "No credential has been created for this wallet yet.",
      ];
    case "active":
      return [
        "Renew active membership",
        "New time extends from the current expiration.",
      ];
    case "expired-occupied":
      return [
        "Renew with your held place",
        "Access expired, but this credential still holds capacity until synchronization.",
      ];
    case "historical-synchronized":
      return [
        "Rejoin and reacquire a place",
        "The historical credential remains, but capacity must be checked again.",
      ];
  }
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
  const account = useAccount();
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
  const [referralChoice, setReferralChoice] =
    useState<ReferralChoice>("unselected");
  const [referrer, setReferrer] = useState("");
  const [giftOpen, setGiftOpen] = useState(false);
  const [giftRecipient, setGiftRecipient] = useState("");
  const [giftPeriods, setGiftPeriods] = useState("1");
  const [preparedAction, setPreparedAction] = useState("No action prepared");
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
  const grossIsPositive =
    snapshot.pricePerPeriod > 0n || (contributionValue ?? 0n) > 0n;
  const choiceAddress = referralAddress(snapshot, referralChoice, referrer);
  const needsChoice =
    grossIsPositive &&
    snapshot.credential?.referralStatus !== "locked-none" &&
    snapshot.credential?.referralStatus !== "locked-address";
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
            snapshot.credential?.referralStatus === "locked-address" ||
            (needsChoice &&
              choiceAddress !== undefined &&
              choiceAddress !== zeroAddress),
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
    if (needsChoice && choiceAddress === undefined) {
      dispatch({
        type: "FAILED",
        error:
          "Choose explicit no referral or enter a referrer before the first positive self-payment.",
      });
      return;
    }
    const simulate =
      snapshot.pricePerPeriod === 0n
        ? tierWrite("contribute", [
            contributionValue,
            choiceAddress ?? zeroAddress,
          ])
        : tierWrite("purchase", [periodValue, choiceAddress ?? zeroAddress]);
    const priorShares = snapshot.credential?.shares ?? 0n;
    const expectedReferral =
      snapshot.credential?.referralStatus !== undefined &&
      snapshot.credential.referralStatus !== "unset"
        ? snapshot.credential.referralStatus
        : selfPreview.gross === 0n
          ? "unset"
          : choiceAddress === zeroAddress
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
    (needsChoice && choiceAddress === undefined) ||
    (selfPreview && (snapshot.walletUsdgBalance ?? 0n) < selfPreview.gross);

  return (
    <div className="membership-experience">
      <div className="tier-identity">
        <div>
          <p className="eyebrow">Factory-registered membership</p>
          <h1 className="font-display">{snapshot.name}</h1>
          <p>
            {snapshot.description ||
              "The creator has not added a description yet."}
          </p>
        </div>
        <div className="creator-frame compact" aria-hidden="true">
          <span>{snapshot.symbol.slice(0, 3)}</span>
        </div>
      </div>

      <section
        className={`membership-status status-${actionState}`}
        aria-label="Current membership status"
      >
        <div>
          <p className="eyebrow">Your membership</p>
          <h2 id="membership-status-title">{primaryTitle}</h2>
          <p>{primaryDescription}</p>
        </div>
        {snapshot.credential && (
          <dl>
            <div>
              <dt>Credential</dt>
              <dd>#{snapshot.credential.tokenId.toString()} · permanent</dd>
            </div>
            <div>
              <dt>Access</dt>
              <dd>
                {snapshot.credential.active
                  ? "Active"
                  : "Inactive / historical"}
              </dd>
            </div>
            <div>
              <dt>Expiration</dt>
              <dd>{formatMembershipDate(snapshot.credential.expiration)}</dd>
            </div>
            <div>
              <dt>Capacity</dt>
              <dd>
                {snapshot.credential.occupied
                  ? "Place held"
                  : "Released after sync"}
              </dd>
            </div>
          </dl>
        )}
        {!walletReady && <WalletControl />}
      </section>

      <div className="supporter-columns">
        <div className="supporter-primary">
          <section className="supporter-action" aria-label="Membership action">
            <p className="eyebrow">Primary action</p>
            <h2 id="primary-action-title">{primaryTitle}</h2>
            {snapshot.pricePerPeriod === 0n ? (
              <label className="creator-field">
                <span>Optional USDG contribution</span>
                <input
                  inputMode="decimal"
                  min="0"
                  onChange={(event) => setContribution(event.target.value)}
                  value={contribution}
                />
                <small>
                  Zero adds one period with no fees, shares, or referral lock.
                  Any positive amount uses normal economics.
                </small>
              </label>
            ) : (
              <label className="creator-field">
                <span>Whole periods</span>
                <input
                  inputMode="numeric"
                  min="1"
                  onChange={(event) => setPeriods(event.target.value)}
                  value={periods}
                />
              </label>
            )}

            {needsChoice && grossIsPositive && (
              <fieldset className="referral-choice">
                <legend>First positive self-payment referral choice</legend>
                <label>
                  <input
                    checked={referralChoice === "none"}
                    name="referral-choice"
                    onChange={() => setReferralChoice("none")}
                    type="radio"
                  />{" "}
                  Explicitly no referrer
                </label>
                <label>
                  <input
                    checked={referralChoice === "address"}
                    name="referral-choice"
                    onChange={() => setReferralChoice("address")}
                    type="radio"
                  />{" "}
                  Lock a referrer
                </label>
                {referralChoice === "address" && (
                  <input
                    aria-label="Referrer address"
                    className="font-mono"
                    onChange={(event) => setReferrer(event.target.value)}
                    value={referrer}
                  />
                )}
                <small>
                  This selection is permanent after the first positive
                  self-payment. Self-referral is allowed by the contract.
                </small>
              </fieldset>
            )}
            {snapshot.credential &&
              snapshot.credential.referralStatus !== "unset" && (
                <p className="inline-status">
                  Referral is permanently{" "}
                  {snapshot.credential.referralStatus === "locked-none"
                    ? "locked to none"
                    : `locked to ${snapshot.credential.referrer}`}
                  .
                </p>
              )}

            {selfPreview && (
              <dl
                className="payment-preview"
                aria-label="Membership payment preview"
              >
                <div>
                  <dt>Gross payment</dt>
                  <dd>{formatUnits(selfPreview.gross, 6)} USDG</dd>
                </div>
                <div>
                  <dt>Time added</dt>
                  <dd>{formatPeriod(selfPreview.duration)}</dd>
                </div>
                <div>
                  <dt>Resulting expiration</dt>
                  <dd>
                    {formatMembershipDate(selfPreview.resultingExpiration)}
                  </dd>
                </div>
                <div>
                  <dt>Permanent shares added</dt>
                  <dd>{formatUnits(selfPreview.sharesAdded, 6)}</dd>
                </div>
                <div>
                  <dt>Current allowance</dt>
                  <dd>{formatUnits(snapshot.allowance ?? 0n, 6)} USDG</dd>
                </div>
                <div>
                  <dt>Exact approval if needed</dt>
                  <dd>{formatUnits(selfPreview.exactApproval, 6)} USDG</dd>
                </div>
                {selfPreview.split && (
                  <>
                    <div>
                      <dt>Creator · referred</dt>
                      <dd>
                        {formatUnits(selfPreview.split.creatorReferred, 6)} USDG
                      </dd>
                    </div>
                    <div>
                      <dt>Creator · unreferred</dt>
                      <dd>
                        {formatUnits(selfPreview.split.creatorUnreferred, 6)}{" "}
                        USDG
                      </dd>
                    </div>
                  </>
                )}
              </dl>
            )}
            {capacityFull && (
              <p className="inline-status" role="alert">
                Capacity is currently full. This historical credential lost its
                place after synchronization and must wait for a slot.
              </p>
            )}
            {exceedsPrepaymentLimit && (
              <p className="inline-status" role="alert">
                This purchase would exceed the creator&apos;s current prepaid
                period limit. Reduce the number of periods and simulate again.
              </p>
            )}
            {snapshot.paused && (
              <p className="inline-status" role="alert">
                The creator has paused every time-increasing action. Existing
                access and claims remain available.
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
          </section>

          {snapshot.pricePerPeriod > 0n && (
            <section className="supporter-action gift-action">
              <button
                aria-expanded={giftOpen}
                className="button button-outline"
                onClick={() => setGiftOpen((open) => !open)}
                type="button"
              >
                Gift this membership deliberately
              </button>
              {giftOpen && (
                <div>
                  <h2>Gift time and permanent shares</h2>
                  <p>
                    The recipient does not approve this action. A gift may
                    create a permanent soulbound credential, dilute reward
                    ownership, and hold capped capacity until expiry and
                    synchronization.
                  </p>
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
                  <p className="small-copy">
                    Gifts never choose or replace referral attribution. An unset
                    recipient receives the unreferred split; an existing locked
                    choice continues.
                  </p>
                  {giftState.isLoading && (
                    <p className="inline-status" role="status">
                      Checking the recipient&apos;s credential and held
                      capacity.
                    </p>
                  )}
                  {giftState.error && (
                    <p className="inline-status" role="alert">
                      Recipient state is unavailable. No gift amount or capacity
                      was assumed; retry the direct read.
                    </p>
                  )}
                  {giftPreview && (
                    <dl className="payment-preview">
                      <div>
                        <dt>Gross gift</dt>
                        <dd>{formatUnits(giftPreview.gross, 6)} USDG</dd>
                      </div>
                      <div>
                        <dt>Time added</dt>
                        <dd>{formatPeriod(giftPreview.duration)}</dd>
                      </div>
                      <div>
                        <dt>Resulting expiration</dt>
                        <dd>
                          {formatMembershipDate(
                            giftPreview.resultingExpiration,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Permanent shares</dt>
                        <dd>{formatUnits(giftPreview.sharesAdded, 6)}</dd>
                      </div>
                    </dl>
                  )}
                  {giftCapacityFull && (
                    <p className="inline-status" role="alert">
                      Capacity is full and this recipient does not currently
                      hold a place. Another supporter may also take the last
                      slot before confirmation.
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
                    Approve exact USDG and send gift
                  </button>
                </div>
              )}
            </section>
          )}
        </div>

        <aside className="supporter-secondary">
          <section
            className="wallet-readiness"
            aria-labelledby="supporter-readiness"
          >
            <div>
              <p className="eyebrow">Wallet readiness</p>
              <h2 id="supporter-readiness">Fund before signing</h2>
            </div>
            <WalletReadiness
              estimatedCost={selfPreview?.gross ?? snapshot.pricePerPeriod}
              expectedChainId={expectedChainId}
              verifiedBalances={
                snapshot.walletEthBalance !== undefined &&
                snapshot.walletUsdgBalance !== undefined
                  ? {
                      eth: snapshot.walletEthBalance,
                      usdg: snapshot.walletUsdgBalance,
                    }
                  : undefined
              }
            />
          </section>
          <section className="claim-groups" aria-labelledby="claims-title">
            <p className="eyebrow">Fixed-destination claims</p>
            <h2 id="claims-title">Claim only to the onchain owner</h2>
            {snapshot.credential && (
              <div className="claim-row">
                <div>
                  <strong>Membership rewards</strong>
                  <span>
                    {formatUnits(snapshot.credential.claimableReward, 6)} USDG ·
                    token owner only
                  </span>
                </div>
                <button
                  className="button button-outline"
                  disabled={
                    !writesVerified ||
                    snapshot.credential.claimableReward === 0n
                  }
                  onClick={() =>
                    void perform(
                      "Claim membership rewards",
                      tierWrite("claimReward", [snapshot.credential!.tokenId]),
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
            <div className="claim-row">
              <div>
                <strong>Referral proceeds</strong>
                <span>
                  {formatUnits(snapshot.claimableReferral ?? 0n, 6)} USDG ·
                  locked referrer only
                </span>
              </div>
              <button
                className="button button-outline"
                disabled={
                  !writesVerified || (snapshot.claimableReferral ?? 0n) === 0n
                }
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
            {snapshot.creatorProceeds !== undefined && (
              <div className="claim-row">
                <div>
                  <strong>Creator proceeds</strong>
                  <span>
                    {formatUnits(snapshot.creatorProceeds, 6)} USDG · current
                    tier owner only
                  </span>
                </div>
                <button
                  className="button button-outline"
                  disabled={!writesVerified || snapshot.creatorProceeds === 0n}
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
              If USDG cannot reach a frozen or blocked destination, the
              transaction fails atomically and the exact onchain claim remains.
              This app cannot redirect it; retry only after the same destination
              can receive USDG.
            </p>
          </section>

          {snapshot.credential &&
            !snapshot.credential.active &&
            snapshot.credential.occupied && (
              <section className="maintenance-action">
                <p className="eyebrow">Permissionless maintenance</p>
                <h2>Release expired capacity</h2>
                <p>
                  Synchronization keeps identity, shares, referral choice, and
                  claimable balances. If someone renewed before this confirms,
                  the call safely becomes a no-op.
                </p>
                <button
                  className="button button-dark"
                  disabled={!writesVerified}
                  onClick={() =>
                    void perform(
                      "Synchronize inactive capacity",
                      tierWrite("synchronize", [snapshot.credential!.tokenId]),
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

          {snapshot.credential && (
            <section className="refund-guidance">
              <p className="eyebrow">Refund status</p>
              <h2>
                {formatUnits(snapshot.credential.refundableGross, 6)} USDG gross
                currently previewed
              </h2>
              <p>
                Only the current creator can execute the canonical full refund.
                Payment always returns to the permanent token owner; there is no
                redirect control.
              </p>
              {snapshot.wallet &&
                isSameAddress(snapshot.wallet, snapshot.creator) && (
                  <Link
                    className="button button-outline"
                    href={
                      `/chains/${expectedChainId}/tiers/${snapshot.address}/manage` as Route
                    }
                  >
                    Open creator refund controls
                  </Link>
                )}
            </section>
          )}
        </aside>
      </div>

      <details className="contract-facts">
        <summary>Verified contract facts</summary>
        <dl>
          <div>
            <dt>Tier</dt>
            <dd className="font-mono">{snapshot.address}</dd>
          </div>
          <div>
            <dt>Creator owner</dt>
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
      {!writesVerified && (
        <p className="inline-status" role="status">
          Writes remain closed until this tier is fresh, factory-registered,
          interface-verified, and the wallet uses{" "}
          {getSupportedChain(expectedChainId).name}.
        </p>
      )}
      <p className="eyebrow">Prepared action · {preparedAction}</p>
      <TransactionFlow state={transaction} />
    </div>
  );
}
