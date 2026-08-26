"use client";

import { useMemo, useReducer, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  formatUnits,
  getAddress,
  isAddress,
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
import { executeTransaction } from "@/features/protocol/write-transaction";
import { getWriteGuard, type AuthenticityResult } from "@/lib/authenticity";
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
    gross: bigint;
    topUp: bigint;
  }>();
  const [description, setDescription] = useState(snapshot.description);
  const [imageURI, setImageURI] = useState(snapshot.imageURI);
  const [externalURI, setExternalURI] = useState(snapshot.externalURI);
  const [newOwner, setNewOwner] = useState("");
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
    !isTransactionInFlight(transaction.phase);
  const canOwnerWrite = writesVerified && permissions.canOperate;

  async function waitForReceipt(hash: Hash, onReplaced: (hash: Hash) => void) {
    const receipt = await client.waitForTransactionReceipt({
      hash,
      onReplaced: (replacement) => onReplaced(replacement.transaction.hash),
    });
    return { status: receipt.status } as const;
  }

  async function perform(
    label: string,
    simulate: () => Promise<SendWrite>,
    approval?: () => Promise<SendWrite>,
  ) {
    setActiveAction(label);
    return executeTransaction({
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
      reconcile: async () => {
        const refreshed = await onRefresh();
        if (refreshed?.status !== "valid") {
          throw new Error("Fresh tier state was unavailable.");
        }
        return refreshed.data;
      },
    });
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
      return () => wallet.data!.writeContract(request);
    };
  }

  async function previewRefund() {
    const tokenId = parseTokenId(refundToken);
    if (tokenId === undefined) return;
    try {
      const [gross, topUp] = await client.readContract({
        address: snapshot.address,
        abi: tierAbi,
        functionName: "previewRefund",
        args: [tokenId],
      });
      setRefundPreview({ tokenId, gross, topUp });
    } catch (error) {
      dispatch({ type: "FAILED", error: classifyReadError(error).label });
    }
  }

  async function refund() {
    if (!refundPreview || !account.address || !wallet.data) return;
    dispatch({ type: "SIMULATE" });
    try {
      let approval: (() => Promise<SendWrite>) | undefined;
      if (refundPreview.topUp > 0n) {
        const allowance = await client.readContract({
          address: snapshot.paymentToken,
          abi: tokenAbi,
          functionName: "allowance",
          args: [account.address, snapshot.address],
        });
        if (allowance < refundPreview.topUp) {
          approval = async () => {
            const { request } = await client.simulateContract({
              account: account.address,
              address: snapshot.paymentToken,
              abi: tokenAbi,
              functionName: "approve",
              args: [snapshot.address, refundPreview.topUp],
            });
            return () => wallet.data!.writeContract(request);
          };
        }
      }
      await perform(
        `Refund membership #${refundPreview.tokenId}`,
        tierWrite("refund", [refundPreview.tokenId]),
        approval,
      );
    } catch (error) {
      dispatch({ type: "FAILED", error: decodeTransactionError(error) });
    }
  }

  const capError = validateSupplyCap(supplyCap, snapshot.occupiedSupply);
  const prepaymentValue = parseUint64Input(prepayment, { allowZero: true });
  const grantPeriodsValue = parseUint64Input(grantPeriods, {
    allowZero: false,
  });
  const revokeTokenValue = parseTokenId(revokeToken);
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
                    !isAddress(grantRecipient.trim()) ||
                    grantPeriodsValue === undefined
                  }
                  onClick={() =>
                    void perform(
                      "Grant complimentary time",
                      tierWrite("grantTime", [
                        getAddress(grantRecipient.trim()),
                        grantPeriodsValue!,
                      ]),
                    )
                  }
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
                  onClick={() =>
                    void perform(
                      "Revoke remaining grant time",
                      tierWrite("revokeGrantTime", [revokeTokenValue!]),
                    )
                  }
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
                parseTokenId(refundToken) === undefined
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
              disabled={!canOwnerWrite || !refundPreview}
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
                disabled={!canOwnerWrite || !isAddress(newOwner.trim())}
                onClick={() =>
                  void perform(
                    "Start ownership transfer",
                    tierWrite("transferOwnership", [
                      getAddress(newOwner.trim()),
                    ]),
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
      <TransactionFlow state={transaction} />
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
        factory: deployment.factoryAddress,
        paymentToken: deployment.usdgAddress,
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
