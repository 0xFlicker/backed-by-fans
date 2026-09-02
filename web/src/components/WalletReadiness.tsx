"use client";

import { erc20Abi, formatEther, type Address } from "viem";
import { useAccount, useBalance, useReadContract } from "wagmi";

import { ReadStateView } from "@/components/ReadState";
import { getSupportedChain, type SupportedChainId } from "@/lib/chains";
import { getDeployment, publicConfig } from "@/lib/config";
import type { AcceptedPaymentToken } from "@/lib/payment-token-read";
import {
  classifyReadError,
  unavailableDeploymentState,
  type ReadState,
} from "@/lib/read-state";
import { testnetFundingReadiness } from "@/lib/testnet-funding";
import { formatRawTokenAmount } from "@/lib/token-amount";
import { useActiveNetwork } from "@/lib/use-active-network";

type VerifiedBalances = {
  eth: bigint;
  paymentToken?: bigint;
};

function tokenValue(value: bigint, token: AcceptedPaymentToken) {
  return `${formatRawTokenAmount({
    raw: value,
    decimals: token.decimals,
    multiplier: token.uiMultiplier,
  })} ${token.symbol}`;
}

function WalletBalanceGrid({
  balances,
  estimatedCost,
  networkName,
  paymentToken,
}: {
  balances: VerifiedBalances;
  estimatedCost?: bigint;
  networkName: string;
  paymentToken?: AcceptedPaymentToken;
}) {
  return (
    <dl className="readiness-grid">
      <div>
        <dt>Network</dt>
        <dd>{networkName}</dd>
      </div>
      <div>
        <dt>Network fee balance</dt>
        <dd>{Number(formatEther(balances.eth)).toFixed(5)} ETH</dd>
      </div>
      <div>
        <dt>Payment token</dt>
        <dd>
          {paymentToken && balances.paymentToken !== undefined
            ? tokenValue(balances.paymentToken, paymentToken)
            : (paymentToken?.symbol ?? "Choose a payment token")}
        </dd>
      </div>
      <div>
        <dt>Next payment</dt>
        <dd>
          {paymentToken && estimatedCost !== undefined
            ? tokenValue(estimatedCost, paymentToken)
            : "Choose an action to estimate"}
        </dd>
      </div>
    </dl>
  );
}

function FundingGuidance({
  chainId,
  gasBalance,
  paymentTokenBalance,
  estimatedCost,
  paymentToken,
}: {
  chainId: SupportedChainId;
  gasBalance?: bigint;
  paymentTokenBalance?: bigint;
  estimatedCost?: bigint;
  paymentToken?: AcceptedPaymentToken;
}) {
  const readiness = testnetFundingReadiness({
    chainId,
    gasBalance,
    paymentTokenBalance,
    requiredPayment: estimatedCost,
  });
  if (readiness.faucetUrl) {
    const missing = [
      readiness.gasShortfall ? "test ETH" : undefined,
      readiness.paymentTokenShortfall ? paymentToken?.symbol : undefined,
    ].filter(Boolean);
    return (
      <p className="readiness-guidance">
        Need {missing.join(" and ")}? Get test assets from the{" "}
        <a href={readiness.faucetUrl} rel="noreferrer" target="_blank">
          official Robinhood Chain testnet faucet
        </a>
        .
      </p>
    );
  }
  return (
    <p className="readiness-guidance">
      Keep enough ETH for network fees and enough{" "}
      {paymentToken?.symbol ?? "of the payment token"} for the next action.
    </p>
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
  paymentToken: AcceptedPaymentToken;
  estimatedCost?: bigint;
  chainId: SupportedChainId;
  networkName: string;
}) {
  const gas = useBalance({ address: account, chainId });
  const tokenBalance = useReadContract({
    address: paymentToken.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account],
    chainId,
  });

  if (gas.isLoading || tokenBalance.isLoading) {
    return (
      <ReadStateView
        state={{ status: "loading", label: "Checking wallet balances." }}
      />
    );
  }
  const error = gas.error ?? tokenBalance.error;
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
  if (gas.data === undefined || tokenBalance.data === undefined) return null;

  return (
    <>
      <WalletBalanceGrid
        balances={{ eth: gas.data.value, paymentToken: tokenBalance.data }}
        estimatedCost={estimatedCost}
        networkName={networkName}
        paymentToken={paymentToken}
      />
      <FundingGuidance
        chainId={chainId}
        estimatedCost={estimatedCost}
        gasBalance={gas.data.value}
        paymentToken={paymentToken}
        paymentTokenBalance={tokenBalance.data}
      />
    </>
  );
}

function ConnectedGasReadiness({
  account,
  chainId,
  networkName,
}: {
  account: Address;
  chainId: SupportedChainId;
  networkName: string;
}) {
  const gas = useBalance({ address: account, chainId });
  if (gas.isLoading) {
    return (
      <ReadStateView
        state={{ status: "loading", label: "Checking wallet balance." }}
      />
    );
  }
  if (gas.error) {
    const classified = classifyReadError(gas.error);
    return (
      <ReadStateView
        state={
          classified.status === "rate-limited"
            ? classified
            : { ...classified, reason: "rpc-unavailable" }
        }
      />
    );
  }
  if (!gas.data) return null;
  return (
    <>
      <WalletBalanceGrid
        balances={{ eth: gas.data.value }}
        networkName={networkName}
      />
      <FundingGuidance chainId={chainId} gasBalance={gas.data.value} />
    </>
  );
}

export function WalletReadiness({
  estimatedCost,
  expectedChainId,
  paymentToken,
  verifiedBalances,
}: {
  estimatedCost?: bigint;
  expectedChainId?: SupportedChainId;
  paymentToken?: AcceptedPaymentToken;
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
  if (verifiedBalances) {
    return (
      <>
        <WalletBalanceGrid
          balances={verifiedBalances}
          estimatedCost={estimatedCost}
          networkName={chain.name}
          paymentToken={paymentToken}
        />
        <FundingGuidance
          chainId={deployment.chainId}
          estimatedCost={estimatedCost}
          gasBalance={verifiedBalances.eth}
          paymentToken={paymentToken}
          paymentTokenBalance={verifiedBalances.paymentToken}
        />
      </>
    );
  }
  return paymentToken ? (
    <ConnectedWalletReadiness
      account={account.address}
      chainId={deployment.chainId}
      estimatedCost={estimatedCost}
      networkName={chain.name}
      paymentToken={paymentToken}
    />
  ) : (
    <ConnectedGasReadiness
      account={account.address}
      chainId={deployment.chainId}
      networkName={chain.name}
    />
  );
}
