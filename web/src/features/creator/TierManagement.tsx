"use client";

import { useMemo, useReducer, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  formatUnits,
  getAddress,
  zeroAddress,
  type Address,
  type Hash,
} from "viem";
import { useAccount, useChainId, useWalletClient } from "wagmi";

import { ReadStateView } from "@/components/ReadState";
import { TransactionFlow } from "@/components/TransactionFlow";
import { WalletControl } from "@/components/WalletControl";
import { tierAbi, tokenAbi } from "@/contracts/abis";
import type { TierManagementSnapshot } from "@/contracts/types";
import {
  managementPermissions,
  parseTokenId,
  parseUint64Input,
  validateAddressInput,
  validateMutableMetadata,
  validateSupplyCap,
} from "@/features/creator/management";
import { readTierManagementState } from "@/features/creator/management-read";
import {
  executeTransaction,
  waitForWriteReceipt,
  type Replacement,
  type WriteReceipt,
} from "@/features/protocol/write-transaction";
import { useTransactionReconciliation } from "@/features/protocol/use-transaction-reconciliation";
import { receiptProvesMembershipRefund } from "@/features/protocol/payout-reconciliation";
import { assertSufficientGas } from "@/features/protocol/gas-readiness";
import { receiptProvesCreatorWithdrawal } from "@/features/protocol/withdrawal-reconciliation";
import { getWriteGuard, type AuthenticityResult } from "@/lib/authenticity";
import { isNonZeroAddress, isSameAddress } from "@/lib/address";
import { publicConfig } from "@/lib/config";
import { createDirectReadClient } from "@/lib/direct-read";
import {
  classifyReadError,
  type ReadState,
  unavailableDeploymentState,
} from "@/lib/read-state";
import {
  decodeTransactionError,
  initialTransactionState,
  isTransactionInFlight,
  transactionReducer,
} from "@/lib/transaction-state";

type SendWrite = () => Promise<Hash>;

function ManagementControls({
  snapshot,
  capturedBlock,
  fresh,
  onRefresh,
}: {
  snapshot: TierManagementSnapshot;
  capturedBlock: bigint;
  fresh: boolean;
  onRefresh: () => Promise<ReadState<TierManagementSnapshot> | undefined>;
}) {
  const account = useAccount();
  const chainId = useChainId();
  const wallet = useWalletClient({ chainId: publicConfig.chainId });
  const client = useMemo(() => createDirectReadClient(), []);
  const gas = useQuery({
    queryKey: ["management-gas-balance", snapshot.address, account.address],
    enabled: Boolean(account.address && chainId === publicConfig.chainId),
    queryFn: () => client.getBalance({ address: account.address! }),
  });
  const [transaction, dispatch] = useReducer(
    transactionReducer,
    initialTransactionState,
  );
  const [activeAction, setActiveAction] = useState("No action prepared");
  const [supplyCap, setSupplyCap] = useState(snapshot.supplyCap.toString());
  const [prepayment, setPrepayment] = useState(
    snapshot.maxPrepaidPeriods.toString(),
  );
  const [grantRecipient, setGrantRecipient] = useState("");
  const [grantPeriods, setGrantPeriods] = useState("1");
  const [revokeToken, setRevokeToken] = useState("");
  const [refundToken, setRefundToken] = useState("");
  const [refundPreview, setRefundPreview] = useState<{
    tokenId: bigint;
    recipient: Address;
    gross: bigint;
    topUp: bigint;
  }>();
  const refundPreviewVersion = useRef(0);
  const operationInFlight = useRef(false);
  const [description, setDescription] = useState(snapshot.description);
  const [imageURI, setImageURI] = useState(snapshot.imageURI);
  const [externalURI, setExternalURI] = useState(snapshot.externalURI);
  const [newOwner, setNewOwner] = useState("");
  const recovery = useTransactionReconciliation(
    dispatch,
    `${chainId}:${account.address ?? "disconnected"}:${snapshot.address}`,
  );
  const permissions = managementPermissions(snapshot, account.address);
  const authenticity: AuthenticityResult = {
    status: "verified",
    capturedBlock,
    factory: snapshot.factory,
    tier: snapshot.address,
    paymentToken: snapshot.paymentToken,
  };
  const guard = getWriteGuard({
    deployment: publicConfig.deployment,
    walletChainId: account.isConnected ? chainId : undefined,
    expectedChainId: publicConfig.chainId,
    authenticity,
  });
  const writesVerified =
    fresh &&
    guard.enabled &&
    Boolean(wallet.data) &&
    (gas.data ?? 0n) > 0n &&
    !isTransactionInFlight(transaction.phase);
  const canOwnerWrite = writesVerified && permissions.canOperate;

  async function waitForReceipt(
    hash: Hash,
    onReplaced: (value: Replacement) => void,
  ) {
    return waitForWriteReceipt(client, hash, onReplaced);
  }

  async function runExclusive<Result>(task: () => Promise<Result>) {
    if (operationInFlight.current) return undefined;
    operationInFlight.current = true;
    try {
      return await task();
    } finally {
      operationInFlight.current = false;
    }
  }

  async function performUnlocked(
    label: string,
    simulate: () => Promise<SendWrite>,
    reconcile: (receipt?: WriteReceipt) => Promise<unknown | undefined>,
    approval?: () => Promise<SendWrite>,
  ) {
    setActiveAction(label);
    let confirmedReceipt: WriteReceipt | undefined;
    const tracked = recovery.track((receipt?: WriteReceipt) => {
      confirmedReceipt ??= receipt;
      return reconcile(confirmedReceipt);
    });
    const outcome = await executeTransaction({
      dispatch,
      simulate,
      submit: (send) => send(),
      wait: waitForReceipt,
      approval: approval
        ? {
            simulate: approval,
            submit: (send) => send(),
            wait: waitForReceipt,
          }
        : undefined,
      reconcile: tracked,
    });
    if (outcome.status !== "uncertain") recovery.clear();
    return outcome.status === "reconciled" ? outcome.result : undefined;
  }

  function perform(
    label: string,
    simulate: () => Promise<SendWrite>,
    reconcile: (receipt?: WriteReceipt) => Promise<unknown | undefined>,
    approval?: () => Promise<SendWrite>,
  ) {
    return runExclusive(() =>
      performUnlocked(label, simulate, reconcile, approval),
    );
  }

  async function reconcileSnapshot(
    provesAction: (next: TierManagementSnapshot) => boolean,
  ) {
    const refreshed = await onRefresh();
    if (refreshed?.status !== "valid") {
      throw new Error("Fresh tier state was unavailable.");
    }
    return provesAction(refreshed.data) ? refreshed.data : undefined;
  }

  async function readRecipientTime(recipient: Address) {
    const blockNumber = await client.getBlockNumber();
    const [block, tokenId] = await Promise.all([
      client.getBlock({ blockNumber }),
      client.readContract({
        address: snapshot.address,
        abi: tierAbi,
        functionName: "tokenOf",
        args: [recipient],
        blockNumber,
      }),
    ]);
    if (tokenId === 0n) {
      return {
        tokenId,
        timestamp: block.timestamp,
        expiration: 0n,
        paidSeconds: 0n,
        grantSeconds: 0n,
      };
    }
    const [expiration, balances] = await Promise.all([
      client.readContract({
        address: snapshot.address,
        abi: tierAbi,
        functionName: "expiresAt",
        args: [tokenId],
        blockNumber,
      }),
      client.readContract({
        address: snapshot.address,
        abi: tierAbi,
        functionName: "timeBalances",
        args: [tokenId],
        blockNumber,
      }),
    ]);
    return {
      tokenId,
      timestamp: block.timestamp,
      expiration,
      paidSeconds: balances[0],
      grantSeconds: balances[1],
    };
  }

  async function readTokenTime(tokenId: bigint) {
    const blockNumber = await client.getBlockNumber();
    const [balances, refund] = await Promise.all([
      client.readContract({
        address: snapshot.address,
        abi: tierAbi,
        functionName: "timeBalances",
        args: [tokenId],
        blockNumber,
      }),
      client.readContract({
        address: snapshot.address,
        abi: tierAbi,
        functionName: "previewRefund",
        args: [tokenId],
        blockNumber,
      }),
    ]);
    return {
      paidSeconds: balances[0],
      grantSeconds: balances[1],
      refundableGross: refund[0],
    };
  }

  function tierWrite<
    Name extends
      | "setPaused"
      | "setSupplyCap"
      | "setMaxPrepaidPeriods"
      | "setTierMetadata"
      | "grantTime"
      | "revokeGrantTime"
      | "refund"
      | "withdrawCreatorProceeds"
      | "transferOwnership"
      | "acceptOwnership",
  >(functionName: Name, args: readonly unknown[] = []) {
    return async () => {
      if (!wallet.data || !account.address) {
        throw new Error("Connect the operating wallet before simulating.");
      }
      const { request } = await client.simulateContract({
        account: account.address,
        address: snapshot.address,
        abi: tierAbi,
        functionName,
        args,
      } as never);
      await assertSufficientGas(client, account.address, request);
      return () => wallet.data!.writeContract(request);
    };
  }

  async function previewRefund() {
    const tokenId = parseTokenId(refundToken);
    if (tokenId === undefined) return;
    const version = ++refundPreviewVersion.current;
    try {
      const [refund, recipient] = await Promise.all([
        client.readContract({
          address: snapshot.address,
          abi: tierAbi,
          functionName: "previewRefund",
          args: [tokenId],
        }),
        client.readContract({
          address: snapshot.address,
          abi: tierAbi,
          functionName: "ownerOf",
          args: [tokenId],
        }),
      ]);
      if (version !== refundPreviewVersion.current) return;
      setRefundPreview({
        tokenId,
        recipient,
        gross: refund[0],
        topUp: refund[1],
      });
    } catch (error) {
      if (version !== refundPreviewVersion.current) return;
      dispatch({ type: "FAILED", error: classifyReadError(error).label });
    }
  }

  async function refund() {
    const tokenId = parseTokenId(refundToken);
    if (
      !refundPreview ||
      refundPreview.tokenId !== tokenId ||
      !account.address ||
      !wallet.data
    )
      return;
    const owner = account.address;
    const connectedWallet = wallet.data;
    await runExclusive(async () => {
      try {
        let approval: (() => Promise<SendWrite>) | undefined;
        if (refundPreview.topUp > 0n) {
          const allowance = await client.readContract({
            address: snapshot.paymentToken,
            abi: tokenAbi,
            functionName: "allowance",
            args: [owner, snapshot.address],
          });
          if (allowance < refundPreview.topUp) {
            approval = async () => {
              const { request } = await client.simulateContract({
                account: owner,
                address: snapshot.paymentToken,
                abi: tokenAbi,
                functionName: "approve",
                args: [snapshot.address, refundPreview.topUp],
              });
              await assertSufficientGas(client, owner, request);
              return () => connectedWallet.writeContract(request);
            };
          }
        }
        await performUnlocked(
          `Refund membership #${refundPreview.tokenId}`,
          tierWrite("refund", [
            refundPreview.tokenId,
            refundPreview.gross,
            refundPreview.topUp,
          ]),
          async (receipt) => {
            if (
              !receiptProvesMembershipRefund(receipt, {
                tier: snapshot.address,
                tokenId: refundPreview.tokenId,
                recipient: refundPreview.recipient,
                tierOwner: snapshot.creator,
              })
            ) {
              return undefined;
            }
            const current = await readTokenTime(refundPreview.tokenId);
            return current.paidSeconds === 0n &&
              current.grantSeconds === 0n &&
              current.refundableGross === 0n
              ? current
              : undefined;
          },
          approval,
        );
      } catch (error) {
        dispatch({ type: "FAILED", error: decodeTransactionError(error) });
      }
    });
  }

  async function grant() {
    if (
      grantPeriodsValue === undefined ||
      !isNonZeroAddress(grantRecipient.trim())
    ) {
      return;
    }
    await runExclusive(async () => {
      try {
        const recipient = getAddress(grantRecipient.trim());
        const before = await readRecipientTime(recipient);
        const expectedExpiration =
          (before.expiration > before.timestamp
            ? before.expiration
            : before.timestamp) +
          grantPeriodsValue * snapshot.periodDuration;
        await performUnlocked(
          "Grant complimentary time",
          tierWrite("grantTime", [recipient, grantPeriodsValue]),
          async () => {
            const current = await readRecipientTime(recipient);
            return current.tokenId !== 0n &&
              current.expiration >= expectedExpiration
              ? current
              : undefined;
          },
        );
      } catch (error) {
        dispatch({ type: "FAILED", error: decodeTransactionError(error) });
      }
    });
  }

  async function revokeGrant() {
    if (revokeTokenValue === undefined) return;
    await perform(
      "Revoke remaining grant time",
      tierWrite("revokeGrantTime", [revokeTokenValue]),
      async () => {
        const current = await readTokenTime(revokeTokenValue);
        return current.grantSeconds === 0n ? current : undefined;
      },
    );
  }

  const capError = validateSupplyCap(supplyCap, snapshot.occupiedSupply);
  const prepaymentValue = parseUint64Input(prepayment, { allowZero: true });
  const grantPeriodsValue = parseUint64Input(grantPeriods, {
    allowZero: false,
  });
  const revokeTokenValue = parseTokenId(revokeToken);
  const refundTokenValue = parseTokenId(refundToken);
  const metadataError = validateMutableMetadata({
    description,
    imageURI,
    externalURI,
  });
  const recipientError = grantRecipient
    ? validateAddressInput(grantRecipient)
    : undefined;
  const newOwnerError = newOwner ? validateAddressInput(newOwner) : undefined;

  return (
    <div className="management-workspace">
      <header className="management-heading">
        <div>
          <p className="eyebrow">Creator controls</p>
          <h1 className="font-display">{snapshot.name}</h1>
          <p>
            Locked economics stay visible; every control below writes directly
            to this registered tier.
          </p>
        </div>
        <WalletControl />
      </header>

      <section className="operator-strip" aria-label="Current tier authority">
        <div>
          <span>Current operator</span>
          <code>{snapshot.creator}</code>
        </div>
        <div>
          <span>Pending operator</span>
          <code>
            {snapshot.pendingOwner ===
            "0x0000000000000000000000000000000000000000"
              ? "None"
              : snapshot.pendingOwner}
          </code>
        </div>
        <strong>
          {permissions.isOwner
            ? "This wallet operates the tier"
            : permissions.isPendingOwner
              ? "This wallet may accept ownership"
              : "Read-only for this wallet"}
        </strong>
      </section>

      <div className="management-columns">
        <section className="management-locked">
          <p className="eyebrow">Permanent economics</p>
          <h2>Locked terms</h2>
          <dl className="management-facts">
            <div>
              <dt>Price</dt>
              <dd>{formatUnits(snapshot.pricePerPeriod, 6)} USDG</dd>
            </div>
            <div>
              <dt>Period</dt>
              <dd>{(snapshot.periodDuration / 86_400n).toString()} days</dd>
            </div>
            <div>
              <dt>Rewards</dt>
              <dd>{(snapshot.rewardBps / 100).toFixed(2)}%</dd>
            </div>
            <div>
              <dt>Referral</dt>
              <dd>{(snapshot.referralBps / 100).toFixed(2)}%</dd>
            </div>
          </dl>
          <p className="small-copy">
            Price, period, token, reward, referral, and the fixed 1% protocol
            fee cannot be edited here or by the protocol operator.
          </p>
        </section>

        <div className="management-controls">
          <section className="control-group">
            <div>
              <p className="eyebrow">Live state</p>
              <h2>{snapshot.paused ? "Time increases paused" : "Tier open"}</h2>
              <p>
                Pause blocks purchases, gifts, and grants. Refunds, grant
                revocation, withdrawals, and ownership remain available.
              </p>
            </div>
            <button
              className="button button-warning"
              disabled={!canOwnerWrite}
              onClick={() =>
                void perform(
                  snapshot.paused ? "Unpause tier" : "Pause tier",
                  tierWrite("setPaused", [!snapshot.paused]),
                  () =>
                    reconcileSnapshot(
                      (next) => next.paused === !snapshot.paused,
                    ),
                )
              }
              type="button"
            >
              {snapshot.paused
                ? "Unpause time increases"
                : "Pause time increases"}
            </button>
          </section>

          <section className="control-group">
            <div>
              <p className="eyebrow">Capacity & prepayment</p>
              <h2>Mutable limits</h2>
              <p>
                {snapshot.occupiedSupply.toString()} places are currently held.
                Lowering prepayment never shortens existing purchased time.
              </p>
            </div>
            <div className="creator-field-grid">
              <label className="creator-field">
                <span>Supply cap · 0 unlimited</span>
                <input
                  inputMode="numeric"
                  onChange={(event) => setSupplyCap(event.target.value)}
                  value={supplyCap}
                />
                {capError && <small role="alert">{capError}</small>}
                <button
                  className="button button-outline"
                  disabled={!canOwnerWrite || Boolean(capError)}
                  onClick={() =>
                    void perform(
                      "Update supply cap",
                      tierWrite("setSupplyCap", [BigInt(supplyCap)]),
                      () =>
                        reconcileSnapshot(
                          (next) => next.supplyCap === BigInt(supplyCap),
                        ),
                    )
                  }
                  type="button"
                >
                  Update capacity
                </button>
              </label>
              <label className="creator-field">
                <span>Maximum prepaid periods · 0 unlimited</span>
                <input
                  inputMode="numeric"
                  onChange={(event) => setPrepayment(event.target.value)}
                  value={prepayment}
                />
                <button
                  className="button button-outline"
                  disabled={!canOwnerWrite || prepaymentValue === undefined}
                  onClick={() =>
                    void perform(
                      "Update prepayment limit",
                      tierWrite("setMaxPrepaidPeriods", [prepaymentValue!]),
                      () =>
                        reconcileSnapshot(
                          (next) => next.maxPrepaidPeriods === prepaymentValue,
                        ),
                    )
                  }
                  type="button"
                >
                  Update prepayment
                </button>
              </label>
            </div>
          </section>

          <section className="control-group">
            <div>
              <p className="eyebrow">Complimentary time</p>
              <h2>Grant or revoke</h2>
              <p>
                Purchased time is always consumed first. Revocation removes only
                grant time and remains available while paused.
              </p>
            </div>
            <div className="creator-field-grid">
              <label className="creator-field">
                <span>Recipient</span>
                <input
                  className="font-mono"
                  onChange={(event) => setGrantRecipient(event.target.value)}
                  value={grantRecipient}
                />
                {recipientError && <small role="alert">{recipientError}</small>}
                <span>Whole periods</span>
                <input
                  inputMode="numeric"
                  onChange={(event) => setGrantPeriods(event.target.value)}
                  value={grantPeriods}
                />
                <button
                  className="button button-dark"
                  disabled={
                    !writesVerified ||
                    !permissions.canGrant ||
                    !isNonZeroAddress(grantRecipient.trim()) ||
                    grantPeriodsValue === undefined
                  }
                  onClick={() => void grant()}
                  type="button"
                >
                  {snapshot.paused
                    ? "Grant blocked while paused"
                    : "Grant time"}
                </button>
              </label>
              <label className="creator-field">
                <span>Membership token to revoke</span>
                <input
                  inputMode="numeric"
                  onChange={(event) => setRevokeToken(event.target.value)}
                  value={revokeToken}
                />
                <button
                  className="button button-outline"
                  disabled={!canOwnerWrite || revokeTokenValue === undefined}
                  onClick={() => void revokeGrant()}
                  type="button"
                >
                  Revoke grant time
                </button>
              </label>
            </div>
          </section>

          <section className="control-group">
            <div>
              <p className="eyebrow">Gross refund</p>
              <h2>Preview before any top-up</h2>
              <p>
                Refunds always pay the membership token owner. Protocol, reward,
                and referral allocations are never clawed back.
              </p>
            </div>
            <label className="creator-field">
              <span>Membership token</span>
              <input
                inputMode="numeric"
                onChange={(event) => {
                  refundPreviewVersion.current += 1;
                  setRefundToken(event.target.value);
                  setRefundPreview(undefined);
                }}
                value={refundToken}
              />
            </label>
            <button
              className="button button-outline"
              disabled={
                !writesVerified ||
                !permissions.canOperate ||
                refundTokenValue === undefined
              }
              onClick={() => void previewRefund()}
              type="button"
            >
              Read refund preview
            </button>
            {refundPreview && (
              <dl className="refund-preview" aria-live="polite">
                <div>
                  <dt>Gross refund</dt>
                  <dd>{formatUnits(refundPreview.gross, 6)} USDG</dd>
                </div>
                <div>
                  <dt>Exact owner top-up</dt>
                  <dd>{formatUnits(refundPreview.topUp, 6)} USDG</dd>
                </div>
              </dl>
            )}
            <button
              className="button button-warning"
              disabled={
                !canOwnerWrite ||
                !refundPreview ||
                refundPreview.tokenId !== refundTokenValue
              }
              onClick={() => void refund()}
              type="button"
            >
              Approve exact top-up and refund
            </button>
          </section>

          <section className="control-group">
            <div>
              <p className="eyebrow">Creator proceeds</p>
              <h2>{formatUnits(snapshot.creatorProceeds, 6)} USDG</h2>
              <p>
                Withdrawal has one fixed destination: the current tier owner. No
                redirect is available.
              </p>
            </div>
            <button
              className="button button-applause"
              disabled={!canOwnerWrite}
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
                          amount: snapshot.creatorProceeds,
                        }) || next.creatorProceeds === 0n,
                    ),
                )
              }
              type="button"
            >
              Withdraw to current owner
            </button>
          </section>

          <section className="control-group">
            <div>
              <p className="eyebrow">Presentation</p>
              <h2>Mutable metadata</h2>
            </div>
            <label className="creator-field">
              <span>Description</span>
              <textarea
                onChange={(event) => setDescription(event.target.value)}
                rows={4}
                value={description}
              />
              <span>Creator image URI</span>
              <input
                onChange={(event) => setImageURI(event.target.value)}
                value={imageURI}
              />
              <span>Website URI</span>
              <input
                onChange={(event) => setExternalURI(event.target.value)}
                value={externalURI}
              />
              {metadataError && <small role="alert">{metadataError}</small>}
            </label>
            <button
              className="button button-outline"
              disabled={!canOwnerWrite || Boolean(metadataError)}
              onClick={() =>
                void perform(
                  "Update tier presentation",
                  tierWrite("setTierMetadata", [
                    { description, imageURI, externalURI },
                  ]),
                  () =>
                    reconcileSnapshot(
                      (next) =>
                        next.description === description &&
                        next.imageURI === imageURI &&
                        next.externalURI === externalURI,
                    ),
                )
              }
              type="button"
            >
              Update metadata
            </button>
          </section>

          <section className="control-group">
            <div>
              <p className="eyebrow">Two-step ownership</p>
              <h2>Move the creator role deliberately</h2>
              <p>
                Controls, prior proceeds, and refund top-up responsibility move
                only after the pending wallet accepts.
              </p>
            </div>
            <label className="creator-field">
              <span>New creator owner</span>
              <input
                className="font-mono"
                onChange={(event) => setNewOwner(event.target.value)}
                value={newOwner}
              />
              {newOwnerError && <small role="alert">{newOwnerError}</small>}
            </label>
            <div className="creator-actions">
              <button
                className="button button-outline"
                disabled={!canOwnerWrite || !isNonZeroAddress(newOwner.trim())}
                onClick={() =>
                  void perform(
                    "Start ownership transfer",
                    tierWrite("transferOwnership", [
                      getAddress(newOwner.trim()),
                    ]),
                    () =>
                      reconcileSnapshot((next) =>
                        isSameAddress(
                          next.pendingOwner,
                          getAddress(newOwner.trim()),
                        ),
                      ),
                  )
                }
                type="button"
              >
                Name pending owner
              </button>
              <button
                className="button button-applause"
                disabled={!writesVerified || !permissions.canAcceptOwnership}
                onClick={() =>
                  void perform(
                    "Accept tier ownership",
                    tierWrite("acceptOwnership"),
                    () =>
                      reconcileSnapshot(
                        (next) =>
                          account.address !== undefined &&
                          isSameAddress(next.creator, account.address) &&
                          isSameAddress(next.pendingOwner, zeroAddress),
                      ),
                  )
                }
                type="button"
              >
                Accept ownership
              </button>
            </div>
          </section>
        </div>
      </div>

      {!writesVerified && (
        <p className="inline-status" role="status">
          Writes stay disabled until this registered tier is fresh, the wallet
          uses {publicConfig.chain.name}, and the expected contract interfaces
          are verified.
        </p>
      )}
      <p className="eyebrow">Prepared action · {activeAction}</p>
      <TransactionFlow
        onReconcile={() => void recovery.recheck()}
        state={transaction}
      />
    </div>
  );
}

export function TierManagement({ tierAddress }: { tierAddress: Address }) {
  const deployment = publicConfig.deployment;
  const client = useMemo(() => createDirectReadClient(), []);
  const management = useQuery({
    queryKey: ["tier-management", tierAddress],
    enabled: deployment.status === "ready",
    queryFn: () => {
      if (deployment.status !== "ready") throw new Error(deployment.detail);
      return readTierManagementState(client, {
        tier: tierAddress,
        deployment,
      });
    },
  });

  if (deployment.status !== "ready") {
    return <ReadStateView state={unavailableDeploymentState(deployment)} />;
  }
  if (management.isError) {
    const classified = classifyReadError(management.error);
    return (
      <ReadStateView
        onRetry={() => void management.refetch()}
        state={
          classified.status === "rate-limited"
            ? classified
            : {
                status: "unavailable",
                reason: "rpc-unavailable",
                label: classified.label,
              }
        }
      />
    );
  }
  if (!management.data || management.isLoading) {
    return (
      <ReadStateView
        state={{
          status: "loading",
          label: "Verifying tier authority and current operating controls.",
        }}
      />
    );
  }

  return (
    <ReadStateView
      onRetry={() => void management.refetch()}
      state={management.data}
    >
      {(snapshot) => (
        <ManagementControls
          capturedBlock={
            management.data?.status === "valid" ||
            management.data?.status === "stale"
              ? management.data.capturedBlock
              : 0n
          }
          fresh={management.data?.status === "valid"}
          onRefresh={async () => (await management.refetch()).data}
          snapshot={snapshot}
        />
      )}
    </ReadStateView>
  );
}
