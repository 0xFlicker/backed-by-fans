"use client";

import { formatEther, formatUnits, type Address } from "viem";
import { useAccount, useBalance, useChainId, useReadContract } from "wagmi";

import { tokenAbi } from "@/contracts/abis";
import { ReadStateView } from "@/components/ReadState";
import { publicConfig } from "@/lib/config";
import {
  classifyReadError,
  unavailableDeploymentState,
  type ReadState,
} from "@/lib/read-state";

type VerifiedBalances = {
  eth: bigint;
  usdg: bigint;
};

function WalletBalanceGrid({
  balances,
  estimatedCost,
}: {
  balances: VerifiedBalances;
  estimatedCost?: bigint;
}) {
  return (
    <dl className="readiness-grid">
      <div>
        <dt>Network</dt>
        <dd>{publicConfig.chain.name}</dd>
      </div>
      <div>
        <dt>ETH for gas</dt>
        <dd>{Number(formatEther(balances.eth)).toFixed(5)}</dd>
      </div>
      <div>
        <dt>USDG balance</dt>
        <dd>{formatUnits(balances.usdg, 6)}</dd>
      </div>
      <div>
        <dt>Estimated membership cost</dt>
        <dd>
          {estimatedCost === undefined
            ? "Choose an action to estimate"
            : `${formatUnits(estimatedCost, 6)} USDG`}
        </dd>
      </div>
    </dl>
  );
}

function ConnectedWalletReadiness({
  account,
  paymentToken,
  estimatedCost,
}: {
  account: Address;
  paymentToken: Address;
  estimatedCost?: bigint;
}) {
  const gas = useBalance({ address: account, chainId: publicConfig.chainId });
  const usdg = useReadContract({
    address: paymentToken,
    abi: tokenAbi,
    functionName: "balanceOf",
    args: [account],
    chainId: publicConfig.chainId,
  });

  if (gas.isLoading || usdg.isLoading) {
    return (
      <ReadStateView
        state={{ status: "loading", label: "Checking ETH and USDG balances." }}
      />
    );
  }

  const error = gas.error ?? usdg.error;
  if (error) {
    const classified = classifyReadError(error);
    const state: ReadState<never> =
      classified.status === "rate-limited"
        ? classified
        : {
            status: "unavailable",
            reason: "rpc-unavailable",
            label: classified.label,
          };
    return <ReadStateView state={state} />;
  }

  return gas.data !== undefined && usdg.data !== undefined ? (
    <WalletBalanceGrid
      balances={{ eth: gas.data.value, usdg: usdg.data }}
      estimatedCost={estimatedCost}
    />
  ) : null;
}

export function WalletReadiness({
  estimatedCost,
  verifiedBalances,
}: {
  estimatedCost?: bigint;
  verifiedBalances?: VerifiedBalances;
}) {
  const account = useAccount();
  const chainId = useChainId();

  if (publicConfig.deployment.status !== "ready") {
    return (
      <ReadStateView
        state={unavailableDeploymentState(publicConfig.deployment)}
      />
    );
  }

  if (!account.address || !account.isConnected) {
    return (
      <div className="readiness-empty">
        <p>Connect a wallet to check network, ETH for gas, and USDG.</p>
        <p>
          Before joining, move USDG onto the configured Robinhood Chain network
          and keep a small ETH balance for gas. Backed By Fans does not provide
          a fiat checkout.
        </p>
      </div>
    );
  }

  if (chainId !== publicConfig.chainId) {
    return (
      <ReadStateView
        state={{
          status: "wrong-chain",
          expectedChainId: publicConfig.chainId,
          actualChainId: chainId,
          label: `Switch to ${publicConfig.chain.name} before preparing a transaction.`,
        }}
      />
    );
  }

  return (
    <>
      {verifiedBalances ? (
        <WalletBalanceGrid
          balances={verifiedBalances}
          estimatedCost={estimatedCost}
        />
      ) : (
        <ConnectedWalletReadiness
          account={account.address}
          estimatedCost={estimatedCost}
          paymentToken={publicConfig.deployment.usdgAddress}
        />
      )}
      <p className="readiness-guidance">
        Need funds? Transfer USDG to this wallet on {publicConfig.chain.name}{" "}
        and keep a small ETH balance for gas. Backed By Fans does not provide a
        fiat checkout.
      </p>
    </>
  );
}
