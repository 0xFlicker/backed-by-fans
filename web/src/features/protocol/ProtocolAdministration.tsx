"use client";

import { useMemo, useReducer, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  formatUnits,
  getAddress,
  isAddress,
  zeroAddress,
  type Hash,
} from "viem";
import { useAccount, useChainId, useWalletClient } from "wagmi";

import { ReadStateView } from "@/components/ReadState";
import { TransactionFlow } from "@/components/TransactionFlow";
import { WalletControl } from "@/components/WalletControl";
import { factoryAbi } from "@/contracts/abis";
import { protocolPermissions } from "@/features/protocol/authority";
import {
  readProtocolState,
  type ProtocolSnapshot,
} from "@/features/protocol/protocol-read";
import {
  executeTransaction,
  waitForWriteReceipt,
} from "@/features/protocol/write-transaction";
import { useTransactionReconciliation } from "@/features/protocol/use-transaction-reconciliation";
import { factoryWriteGuard } from "@/features/protocol/factory-authenticity";
import { publicConfig } from "@/lib/config";
import { isSameAddress } from "@/lib/address";
import { createDirectReadClient } from "@/lib/direct-read";
import {
  classifyReadError,
  type ReadState,
  unavailableDeploymentState,
} from "@/lib/read-state";
import {
  initialTransactionState,
  isTransactionInFlight,
  transactionReducer,
} from "@/lib/transaction-state";

type SendWrite = () => Promise<Hash>;

function ProtocolControls({
  snapshot,
  onRefresh,
}: {
  snapshot: ProtocolSnapshot;
  onRefresh: () => Promise<ReadState<ProtocolSnapshot> | undefined>;
}) {
  const account = useAccount();
  const chainId = useChainId();
  const wallet = useWalletClient({ chainId: publicConfig.chainId });
  const client = useMemo(() => createDirectReadClient(), []);
  const [feeRecipient, setFeeRecipient] = useState("");
  const [newOwner, setNewOwner] = useState("");
  const [action, setAction] = useState("No action prepared");
  const [transaction, dispatch] = useReducer(
    transactionReducer,
    initialTransactionState,
  );
  const recovery = useTransactionReconciliation(dispatch);
  const permissions = protocolPermissions(snapshot, account.address);
  const guard = factoryWriteGuard({
    deployment: publicConfig.deployment,
    walletChainId: account.isConnected ? chainId : undefined,
    expectedChainId: publicConfig.chainId,
    authenticity: snapshot.authenticity,
  });
  const writesVerified =
    guard.enabled &&
    Boolean(wallet.data) &&
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
      if (!account.address || !wallet.data) {
        throw new Error("Connect the authorized wallet before simulating.");
      }
      const { request } = await client.simulateContract({
        account: account.address,
        address: snapshot.factory,
        abi: factoryAbi,
        functionName,
        args,
      } as never);
      return () => wallet.data!.writeContract(request);
    };
  }

  async function perform(
    label: string,
    simulate: () => Promise<SendWrite>,
    provesAction: (next: ProtocolSnapshot) => boolean,
  ) {
    setAction(label);
    const reconcile = async () => {
      const refreshed = await onRefresh();
      if (refreshed?.status !== "valid") {
        throw new Error("Fresh protocol state was unavailable.");
      }
      return provesAction(refreshed.data) ? refreshed.data : undefined;
    };
    const tracked = recovery.track(reconcile);
    const result = await executeTransaction({
      dispatch,
      simulate,
      submit: (send) => send(),
      wait: async (hash, onReplaced) => {
        return waitForWriteReceipt(client, hash, onReplaced);
      },
      reconcile: tracked,
    });
    if (result !== undefined) recovery.clear();
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
              !isAddress(feeRecipient.trim())
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
            disabled={!writesVerified || !permissions.isFeeRecipient}
            onClick={() =>
              void perform(
                "Withdraw protocol fees",
                factoryWrite("withdrawProtocolFees"),
                (next) => next.protocolBalance === 0n,
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
                !isAddress(newOwner.trim())
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
          bound contracts are verified on {publicConfig.chain.name}.
        </p>
      )}
      <p className="eyebrow">Prepared action · {action}</p>
      <TransactionFlow
        onReconcile={() => void recovery.recheck()}
        state={transaction}
      />
    </div>
  );
}

export function ProtocolAdministration() {
  const client = useMemo(() => createDirectReadClient(), []);
  const protocol = useQuery({
    queryKey: ["protocol-administration", publicConfig.chainId],
    enabled: publicConfig.deployment.status === "ready",
    queryFn: () => readProtocolState(client, publicConfig.deployment),
  });

  if (publicConfig.deployment.status !== "ready") {
    return (
      <ReadStateView
        state={unavailableDeploymentState(publicConfig.deployment)}
      />
    );
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
          onRefresh={async () => (await protocol.refetch()).data}
          snapshot={snapshot}
        />
      )}
    </ReadStateView>
  );
}
