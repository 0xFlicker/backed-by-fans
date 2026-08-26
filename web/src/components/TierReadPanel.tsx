"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatUnits, type Address } from "viem";

import type { TierSnapshot } from "@/contracts/types";
import { ReadStateView } from "@/components/ReadState";
import { WalletReadiness } from "@/components/WalletReadiness";
import { publicConfig } from "@/lib/config";
import {
  createDirectReadClient,
  readTierSnapshotState,
} from "@/lib/direct-read";
import {
  classifyReadError,
  unavailableDeploymentState,
} from "@/lib/read-state";

function formatPeriod(seconds: bigint) {
  const days = seconds / 86_400n;
  return days > 0n
    ? `${days.toString()} days`
    : `${seconds.toString()} seconds`;
}

function TierSnapshotView({ tier }: { tier: TierSnapshot }) {
  return (
    <>
      <div className="tier-identity">
        <div>
          <p className="eyebrow">Factory-registered membership</p>
          <h1 className="font-display">{tier.name}</h1>
          <p>
            {tier.description || "The creator has not added a description yet."}
          </p>
        </div>
        <div className="creator-frame compact" aria-hidden="true">
          <span>{tier.symbol.slice(0, 3)}</span>
        </div>
      </div>

      <dl className="tier-facts">
        <div>
          <dt>Price per period</dt>
          <dd>
            {tier.pricePerPeriod === 0n
              ? "Choose your support"
              : `${formatUnits(tier.pricePerPeriod, 6)} USDG`}
          </dd>
        </div>
        <div>
          <dt>Period</dt>
          <dd>{formatPeriod(tier.periodDuration)}</dd>
        </div>
        <div>
          <dt>Capacity held</dt>
          <dd>
            {tier.occupiedSupply.toString()} /{" "}
            {tier.supplyCap === 0n ? "Unlimited" : tier.supplyCap.toString()}
          </dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{tier.paused ? "Time increases paused" : "Open"}</dd>
        </div>
        <div>
          <dt>Membership rewards</dt>
          <dd>{(tier.rewardBps / 100).toFixed(2)}%</dd>
        </div>
        <div>
          <dt>Referral share</dt>
          <dd>{(tier.referralBps / 100).toFixed(2)}%</dd>
        </div>
      </dl>

      <details className="contract-facts">
        <summary>Verified contract facts</summary>
        <dl>
          <div>
            <dt>Tier</dt>
            <dd className="font-mono">{tier.address}</dd>
          </div>
          <div>
            <dt>Creator owner</dt>
            <dd className="font-mono">{tier.creator}</dd>
          </div>
          <div>
            <dt>Factory</dt>
            <dd className="font-mono">{tier.factory}</dd>
          </div>
          <div>
            <dt>Payment token</dt>
            <dd className="font-mono">{tier.paymentToken}</dd>
          </div>
        </dl>
      </details>

      <section className="wallet-readiness" aria-labelledby="readiness-title">
        <div>
          <p className="eyebrow">Before any action</p>
          <h2 id="readiness-title">Wallet readiness</h2>
        </div>
        <WalletReadiness estimatedCost={tier.pricePerPeriod} />
      </section>
    </>
  );
}

export function TierReadPanel({ tierAddress }: { tierAddress: Address }) {
  const deployment = publicConfig.deployment;
  const client = useMemo(() => createDirectReadClient(), []);
  const tier = useQuery({
    queryKey: ["tier", tierAddress],
    enabled: deployment.status === "ready",
    queryFn: () => {
      if (deployment.status !== "ready") throw new Error(deployment.detail);
      return readTierSnapshotState(client, {
        tier: tierAddress,
        factory: deployment.factoryAddress,
        paymentToken: deployment.usdgAddress,
      });
    },
  });

  if (deployment.status !== "ready") {
    return <ReadStateView state={unavailableDeploymentState(deployment)} />;
  }

  if (tier.isError) {
    const classified = classifyReadError(tier.error);
    return (
      <ReadStateView
        onRetry={() => void tier.refetch()}
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

  if (tier.isLoading || !tier.data) {
    return (
      <ReadStateView
        state={{
          status: "loading",
          label:
            "Checking factory registration, USDG binding, and membership interfaces.",
        }}
      />
    );
  }

  return (
    <ReadStateView onRetry={() => void tier.refetch()} state={tier.data}>
      {(snapshot) => <TierSnapshotView tier={snapshot} />}
    </ReadStateView>
  );
}
