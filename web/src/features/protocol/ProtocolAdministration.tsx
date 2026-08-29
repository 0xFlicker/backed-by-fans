"use client";

import { useReducer, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { simulateContract } from "@wagmi/core";
import { formatUnits, getAddress, zeroAddress, type Hash } from "viem";
import {
  useAccount,
  useConfig,
  usePublicClient,
  useWriteContract,
} from "wagmi";

import { ReadStateView } from "@/components/ReadState";
import { TransactionFlow } from "@/components/TransactionFlow";
import { WalletControl } from "@/components/WalletControl";
import { robinhoodMembershipFactoryAbi } from "@/contracts";
import { protocolPermissions } from "@/features/protocol/authority";
import {
  readProtocolState,
  type ProtocolSnapshot,
} from "@/features/protocol/protocol-read";
import {
  isSuccessfulWriteReceipt,
  reconcileSuccessfulWrite,
  type SuccessfulWriteReceipt,
} from "@/features/protocol/write-reconciliation";
import { receiptProvesProtocolWithdrawal } from "@/features/protocol/withdrawal-reconciliation";
import { deploymentWriteGuard } from "@/features/protocol/deployment-write-guard";
import { assertSufficientGas } from "@/features/protocol/gas-readiness";
import { getSupportedChain } from "@/lib/chains";
import { isNonZeroAddress, isSameAddress } from "@/lib/address";
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
import { useActiveNetwork } from "@/lib/use-active-network";

type SendWrite = () => Promise<Hash>;

function ProtocolControls({
  snapshot,
  onRefresh,
  expectedChainId,
}: {
  snapshot: ProtocolSnapshot;
  onRefresh: () => Promise<ReadState<ProtocolSnapshot> | undefined>;
  expectedChainId: 4663 | 46630 | 31337;
}) {
  const account = useAccount();
  const write = useWriteContract();
  const wagmiConfig = useConfig();
  const client = usePublicClient({ chainId: expectedChainId })!;
  const gas = useQuery({
    queryKey: [
      "protocol-gas-balance",
      expectedChainId,
      snapshot.factory,
      account.address,
    ],
    enabled: Boolean(account.address && account.chainId === expectedChainId),
    queryFn: () => client.getBalance({ address: account.address! }),
  });
  const [feeRecipient, setFeeRecipient] = useState("");
  const [newOwner, setNewOwner] = useState("");
  const [action, setAction] = useState("No action prepared");
  const [transaction, dispatch] = useReducer(
    transactionReducer,
    initialTransactionState,
  );
  const operationInFlight = useRef(false);
  const permissions = protocolPermissions(snapshot, account.address);
  const guard = deploymentWriteGuard({
    deployment: {
      status: "ready",
      chainId: expectedChainId,
      factoryAddress: snapshot.factory,
      usdgAddress: snapshot.paymentToken,
    },
    walletChainId: account.isConnected ? account.chainId : undefined,
    expectedChainId,
  });
  const writesVerified =
    guard.enabled &&
    (gas.data ?? 0n) > 0n &&
    !write.isPending &&
    !isTransactionInFlight(transaction.phase);

  function factoryWrite(
    functionName:
      | "setFeeRecipient"
      | "withdrawProtocolFees"
      | "transferOwnership"
      | "acceptOwnership",
    args: readonly unknown[] = [],
  ) {
    return async (): Promise<SendWrite> => {
      if (!account.address) {
        throw new Error("Connect the authorized wallet before simulating.");
      }
      const { request } = await simulateContract(wagmiConfig, {
        account: account.address,
        chainId: expectedChainId,
        address: snapshot.factory,
        abi: robinhoodMembershipFactoryAbi,
        functionName,
        args,
      } as never);
      await assertSufficientGas(client, account.address, request);
      return () => write.writeContractAsync(request);
    };
  }

  async function performUnlocked(
    label: string,
    simulate: () => Promise<SendWrite>,
    provesAction: (
      next: ProtocolSnapshot,
      receipt: SuccessfulWriteReceipt,
    ) => boolean,
  ) {
    setAction(label);
    let waitingForReceipt = false;
    try {
      dispatch({ type: "SIMULATE" });
      const send = await simulate();
      dispatch({ type: "SIMULATED", approvalRequired: false });
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
          error: "The wallet cancelled this protocol action.",
        });
        return;
      }
      if (!isSuccessfulWriteReceipt(receipt)) {
        dispatch({
          type: "REVERTED",
          error: "The protocol transaction reverted onchain.",
        });
        return;
      }
      dispatch({ type: "CONFIRM" });
      await reconcileSuccessfulWrite({
        dispatch,
        receipt,
        reconcile: async (successfulReceipt) => {
          const refreshed = await onRefresh();
          if (refreshed?.status !== "valid") {
            throw new Error("Fresh protocol state was unavailable.");
          }
          return provesAction(refreshed.data, successfulReceipt)
            ? refreshed.data
            : undefined;
        },
      });
    } catch (error) {
      dispatch({
        type: waitingForReceipt ? "UNCERTAIN" : "FAILED",
        error: decodeTransactionError(error),
      });
    }
  }

  async function perform(
    label: string,
    simulate: () => Promise<SendWrite>,
    provesAction: (
      next: ProtocolSnapshot,
      receipt: SuccessfulWriteReceipt,
    ) => boolean,
  ) {
    if (operationInFlight.current) return;
    operationInFlight.current = true;
    try {
      await performUnlocked(label, simulate, provesAction);
    } finally {
      operationInFlight.current = false;
    }
  }

  return (
    <div className="protocol-workspace">
      <header className="management-heading">
        <div>
          <p className="eyebrow">Protocol operations</p>
          <h1 className="font-display">Small authority, clearly bounded.</h1>
          <p>
            The protocol operator cannot pause or change a creator tier. This
            page exposes only the factory roles that exist onchain.
          </p>
        </div>
        <WalletControl />
      </header>

      <dl className="protocol-facts">
        <div>
          <dt>Permanent protocol fee</dt>
          <dd>{(snapshot.protocolFeeBps / 100).toFixed(2)}%</dd>
        </div>
        <div>
          <dt>Registered tiers</dt>
          <dd>{snapshot.tierCount.toString()}</dd>
        </div>
        <div>
          <dt>Factory-held USDG</dt>
          <dd>{formatUnits(snapshot.protocolBalance, 6)} USDG</dd>
        </div>
      </dl>

      <section className="operator-strip" aria-label="Protocol authority">
        <div>
          <span>Protocol owner</span>
          <code>{snapshot.owner}</code>
        </div>
        <div>
          <span>Fee recipient</span>
          <code>{snapshot.feeRecipient}</code>
        </div>
        <div>
          <span>Pending owner</span>
          <code>{snapshot.pendingOwner}</code>
        </div>
      </section>

      <div className="protocol-controls">
        <section className="control-group">
          <div>
            <p className="eyebrow">Fee destination</p>
            <h2>Change the fixed recipient</h2>
            <p>
              The new address becomes the only destination for both prior and
              future factory-held proceeds. The 1% rate does not change.
            </p>
          </div>
          <label className="creator-field">
            <span>New fee recipient</span>
            <input
              className="font-mono"
              onChange={(event) => setFeeRecipient(event.target.value)}
              value={feeRecipient}
            />
          </label>
          <button
            className="button button-outline"
            disabled={
              !writesVerified ||
              !permissions.isOwner ||
              !isNonZeroAddress(feeRecipient.trim()) ||
              isSameAddress(
                getAddress(feeRecipient.trim()),
                snapshot.feeRecipient,
              )
            }
            onClick={() =>
              void perform(
                "Change protocol fee recipient",
                factoryWrite("setFeeRecipient", [
                  getAddress(feeRecipient.trim()),
                ]),
                (next) =>
                  isSameAddress(
                    next.feeRecipient,
                    getAddress(feeRecipient.trim()),
                  ),
              )
            }
            type="button"
          >
            Set fee recipient
          </button>
        </section>

        <section className="control-group">
          <div>
            <p className="eyebrow">Fixed-destination withdrawal</p>
            <h2>{formatUnits(snapshot.protocolBalance, 6)} USDG available</h2>
            <p>
              Only the current fee recipient can withdraw, and funds always go
              to that same address. There is no destination field.
            </p>
          </div>
          <button
            className="button button-applause"
            disabled={
              !writesVerified ||
              !permissions.isFeeRecipient ||
              snapshot.protocolBalance === 0n
            }
            onClick={() =>
              void perform(
                "Withdraw protocol fees",
                factoryWrite("withdrawProtocolFees"),
                (next, receipt) =>
                  receiptProvesProtocolWithdrawal(receipt, {
                    factory: snapshot.factory,
                    recipient: snapshot.feeRecipient,
                    amount: snapshot.protocolBalance,
                  }) && next.protocolBalance === 0n,
              )
            }
            type="button"
          >
            Withdraw to fee recipient
          </button>
        </section>

        <section className="control-group">
          <div>
            <p className="eyebrow">Two-step ownership</p>
            <h2>Transfer protocol operations</h2>
            <p>
              Ownership changes only after the nominated wallet accepts. This
              role still receives no creator-tier authority.
            </p>
          </div>
          <label className="creator-field">
            <span>New protocol owner</span>
            <input
              className="font-mono"
              onChange={(event) => setNewOwner(event.target.value)}
              value={newOwner}
            />
          </label>
          <div className="creator-actions">
            <button
              className="button button-outline"
              disabled={
                !writesVerified ||
                !permissions.isOwner ||
                !isNonZeroAddress(newOwner.trim()) ||
                isSameAddress(
                  getAddress(newOwner.trim()),
                  snapshot.pendingOwner,
                )
              }
              onClick={() =>
                void perform(
                  "Start protocol ownership transfer",
                  factoryWrite("transferOwnership", [
                    getAddress(newOwner.trim()),
                  ]),
                  (next) =>
                    isSameAddress(
                      next.pendingOwner,
                      getAddress(newOwner.trim()),
                    ),
                )
              }
              type="button"
            >
              Name pending owner
            </button>
            <button
              className="button button-applause"
              disabled={!writesVerified || !permissions.isPendingOwner}
              onClick={() =>
                void perform(
                  "Accept protocol ownership",
                  factoryWrite("acceptOwnership"),
                  (next) =>
                    account.address !== undefined &&
                    isSameAddress(next.owner, account.address) &&
                    isSameAddress(next.pendingOwner, zeroAddress),
                )
              }
              type="button"
            >
              Accept ownership
            </button>
          </div>
        </section>
      </div>

      {!writesVerified && (
        <p className="inline-status" role="status">
          Protocol writes remain disabled until the configured factory and its
          bound contracts are verified on{" "}
          {getSupportedChain(expectedChainId).name}.
        </p>
      )}
      <p className="eyebrow">Prepared action · {action}</p>
      <TransactionFlow state={transaction} />
    </div>
  );
}

export function ProtocolAdministration() {
  const { chainId, client, deployment } = useActiveNetwork();
  const protocol = useQuery({
    queryKey: ["protocol-administration", chainId],
    enabled: deployment.status === "ready" && Boolean(client),
    queryFn: () => {
      if (!client) throw new Error("No public client is available.");
      return readProtocolState(client, deployment);
    },
  });

  if (deployment.status !== "ready") {
    return <ReadStateView state={unavailableDeploymentState(deployment)} />;
  }
  if (protocol.isError) {
    const classified = classifyReadError(protocol.error);
    return (
      <ReadStateView
        onRetry={() => void protocol.refetch()}
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
  if (!protocol.data || protocol.isLoading) {
    return (
      <ReadStateView
        state={{
          status: "loading",
          label: "Verifying factory authority and fixed fee custody.",
        }}
      />
    );
  }
  return (
    <ReadStateView
      onRetry={() => void protocol.refetch()}
      state={protocol.data}
    >
      {(snapshot) => (
        <ProtocolControls
          expectedChainId={deployment.chainId}
          onRefresh={async () => (await protocol.refetch()).data}
          snapshot={snapshot}
        />
      )}
    </ReadStateView>
  );
}
