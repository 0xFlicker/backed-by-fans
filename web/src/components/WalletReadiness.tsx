"use client";

import { formatEther, formatUnits, type Address } from "viem";
import { useAccount, useBalance, useReadContract } from "wagmi";

import { usdgAbi } from "@/contracts";
import { ReadStateView } from "@/components/ReadState";
import { getSupportedChain, type SupportedChainId } from "@/lib/chains";
import { getDeployment, publicConfig } from "@/lib/config";
import {
  classifyReadError,
  unavailableDeploymentState,
  type ReadState,
} from "@/lib/read-state";
import { useActiveNetwork } from "@/lib/use-active-network";

type VerifiedBalances = {
  eth: bigint;
  usdg: bigint;
};

function WalletBalanceGrid({
  balances,
  estimatedCost,
  networkName,
}: {
  balances: VerifiedBalances;
  estimatedCost?: bigint;
  networkName: string;
}) {
  return (
    <dl className="readiness-grid">
      <div>
        <dt>Network</dt>
        <dd>{networkName}</dd>
      </div>
      <div>
        <dt>Network fee (ETH)</dt>
        <dd>{Number(formatEther(balances.eth)).toFixed(5)}</dd>
      </div>
      <div>
        <dt>USDG balance</dt>
        <dd>{formatUnits(balances.usdg, 6)}</dd>
      </div>
      <div>
        <dt>Estimated cost</dt>
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
  chainId,
  networkName,
}: {
  account: Address;
  paymentToken: Address;
  estimatedCost?: bigint;
  chainId: 4663 | 46630 | 31337;
  networkName: string;
}) {
  const gas = useBalance({ address: account, chainId });
  const usdg = useReadContract({
    address: paymentToken,
    abi: usdgAbi,
    functionName: "balanceOf",
    args: [account],
    chainId,
  });

  if (gas.isLoading || usdg.isLoading) {
    return (
      <ReadStateView
        state={{ status: "loading", label: "Checking wallet balances." }}
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
      networkName={networkName}
    />
  ) : null;
}

export function WalletReadiness({
  estimatedCost,
  expectedChainId,
  verifiedBalances,
}: {
  estimatedCost?: bigint;
  expectedChainId?: SupportedChainId;
  verifiedBalances?: VerifiedBalances;
}) {
  const account = useAccount();
  const active = useActiveNetwork();
  const deployment = expectedChainId
    ? getDeployment(publicConfig, expectedChainId)
    : active.deployment;
  const chain = expectedChainId
    ? getSupportedChain(expectedChainId)
    : active.chain;

  if (deployment.status !== "ready") {
    return <ReadStateView state={unavailableDeploymentState(deployment)} />;
  }

  if (!account.address || !account.isConnected) {
    return (
      <div className="readiness-empty">
        <p>Connect a wallet to check the network and balances.</p>
        <p>
          Keep USDG and a small amount of ETH on Robinhood Chain. Backed By Fans
          does not provide a fiat checkout.
        </p>
      </div>
    );
  }

  if (!chain) {
    return (
      <ReadStateView
        state={{
          status: "wrong-chain",
          expectedChainId: deployment.chainId,
          actualChainId: active.chainId,
          label: "Switch to a supported Backed By Fans network.",
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
          networkName={chain.name}
        />
      ) : (
        <ConnectedWalletReadiness
          account={account.address}
          estimatedCost={estimatedCost}
          paymentToken={deployment.usdgAddress}
          chainId={deployment.chainId}
          networkName={chain.name}
        />
      )}
      <p className="readiness-guidance">
        Need funds? Transfer USDG and a small amount of ETH to this wallet on{" "}
        {chain.name}. Backed By Fans does not provide a fiat checkout.
      </p>
    </>
  );
}
