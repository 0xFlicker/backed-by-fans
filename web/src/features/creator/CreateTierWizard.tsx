"use client";

import Link from "next/link";
import type { Route } from "next";
import {
  useMemo,
  useReducer,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { formatUnits, type Address } from "viem";
import {
  useAccount,
  useChainId,
  useSwitchChain,
  useWriteContract,
} from "wagmi";

import { TransactionFlow } from "@/components/TransactionFlow";
import { WalletControl } from "@/components/WalletControl";
import { WalletReadiness } from "@/components/WalletReadiness";
import { factoryAbi } from "@/contracts/abis";
import {
  defaultCreatorForm,
  evaluateCreatorForm,
  type CreatorForm,
  type TierConfig,
} from "@/features/creator/config";
import {
  factoryWriteGuard,
  verifyFactoryAuthenticity,
} from "@/features/protocol/factory-authenticity";
import { assertSufficientGas } from "@/features/protocol/gas-readiness";
import { reconcileCreatedTier } from "@/features/protocol/registry-reconciliation";
import {
  isSuccessfulWriteReceipt,
  reconcileSuccessfulWrite,
  type SuccessfulWriteReceipt,
} from "@/features/protocol/write-reconciliation";
import { publicConfig } from "@/lib/config";
import { createDirectReadClient } from "@/lib/direct-read";
import {
  decodeTransactionError,
  initialTransactionState,
  isTransactionInFlight,
  transactionReducer,
} from "@/lib/transaction-state";

const steps = [
  { id: "metadata", label: "Identity" },
  { id: "price", label: "Price & period" },
  { id: "splits", label: "Support split" },
  { id: "limits", label: "Capacity" },
  { id: "risks", label: "Risks" },
  { id: "review", label: "Review" },
] as const;

type StepId = (typeof steps)[number]["id"];

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="creator-field">
      <label htmlFor={id}>{label}</label>
      <p className="field-hint" id={`${id}-hint`}>
        {hint}
      </p>
      {children}
      {error && (
        <p className="field-error" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function usd(value: bigint) {
  return `${formatUnits(value, 6)} USDG`;
}

export function CreateTierWizard() {
  const [form, setForm] = useState(defaultCreatorForm);
  const [step, setStep] = useState<StepId>("metadata");
  const [economicsAcknowledged, setEconomicsAcknowledged] = useState(false);
  const [giftingAcknowledged, setGiftingAcknowledged] = useState(false);
  const [createdTier, setCreatedTier] = useState<Address>();
  const [confirmationNote, setConfirmationNote] = useState<string>();
  const [transaction, dispatch] = useReducer(
    transactionReducer,
    initialTransactionState,
  );
  const deployInFlight = useRef(false);
  const account = useAccount();
  const chainId = useChainId();
  const write = useWriteContract();
  const client = useMemo(() => createDirectReadClient(), []);
  const gas = useQuery({
    queryKey: ["creator-gas-balance", publicConfig.chainId, account.address],
    enabled: Boolean(
      publicConfig.deployment.status === "ready" &&
      account.address &&
      chainId === publicConfig.chainId,
    ),
    queryFn: () => client.getBalance({ address: account.address! }),
  });
  const switchChain = useSwitchChain();
  const result = useMemo(
    () => evaluateCreatorForm(form, account.address),
    [account.address, form],
  );
  const factoryAuthenticity = useQuery({
    queryKey: ["factory-authenticity", publicConfig.chainId],
    enabled: publicConfig.deployment.status === "ready",
    queryFn: () => verifyFactoryAuthenticity(client, publicConfig.deployment),
  });
  const guard = factoryWriteGuard({
    deployment: publicConfig.deployment,
    walletChainId: account.isConnected ? chainId : undefined,
    expectedChainId: publicConfig.chainId,
    authenticity: factoryAuthenticity.data,
  });
  const formValid = Boolean(result.config);
  const acknowledged = economicsAcknowledged && giftingAcknowledged;
  const deployEnabled =
    formValid &&
    acknowledged &&
    guard.enabled &&
    (gas.data ?? 0n) > 0n &&
    !write.isPending &&
    !isTransactionInFlight(transaction.phase);

  function update(key: keyof CreatorForm) {
    return (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((current) => ({ ...current, [key]: event.target.value }));
      setCreatedTier(undefined);
      setConfirmationNote(undefined);
    };
  }

  function go(direction: 1 | -1) {
    const index = steps.findIndex(({ id }) => id === step);
    const next =
      steps[Math.max(0, Math.min(steps.length - 1, index + direction))];
    setStep(next.id);
  }

  async function reconcileDeployment(
    config: TierConfig,
    receipt: SuccessfulWriteReceipt,
  ) {
    if (publicConfig.deployment.status !== "ready") return undefined;
    const tier = await reconcileCreatedTier(client, {
      factory: publicConfig.deployment.factoryAddress,
      config,
      receipt,
    });
    if (tier) {
      setCreatedTier(tier);
      setConfirmationNote(
        "The successful receipt and factory registry confirm this tier with the complete reviewed launch terms.",
      );
      return tier;
    }
    throw new Error(
      "The successful receipt did not prove one registered tier with the complete reviewed launch terms.",
    );
  }

  async function deploy() {
    if (deployInFlight.current) return;
    deployInFlight.current = true;
    try {
      await deployOnce();
    } finally {
      deployInFlight.current = false;
    }
  }

  async function deployOnce() {
    if (
      !deployEnabled ||
      !result.config ||
      publicConfig.deployment.status !== "ready" ||
      !account.address
    ) {
      return;
    }
    const creator = account.address;
    const config = result.config;
    const factory = publicConfig.deployment.factoryAddress;

    setConfirmationNote(undefined);

    let waitingForReceipt = false;
    try {
      dispatch({ type: "SIMULATE" });
      const { request } = await client.simulateContract({
        account: creator,
        address: factory,
        abi: factoryAbi,
        functionName: "createTier",
        args: [config],
      });
      await assertSufficientGas(client, creator, request);
      dispatch({ type: "SIMULATED", approvalRequired: false });
      dispatch({ type: "SIGN" });
      const hash = await write.writeContractAsync(request);
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
          error: "The wallet cancelled the deployment transaction.",
        });
        return;
      }
      if (!isSuccessfulWriteReceipt(receipt)) {
        dispatch({
          type: "REVERTED",
          error: "The deployment transaction reverted onchain.",
        });
        return;
      }
      dispatch({ type: "CONFIRM" });
      await reconcileSuccessfulWrite({
        dispatch,
        receipt,
        reconcile: (successfulReceipt) =>
          reconcileDeployment(config, successfulReceipt),
      });
    } catch (error) {
      dispatch({
        type: waitingForReceipt ? "UNCERTAIN" : "FAILED",
        error: decodeTransactionError(error),
      });
    }
  }

  if (createdTier) {
    const sharePath = `/tiers/${createdTier}` as Route;
    const managePath = `/tiers/${createdTier}/manage` as Route;
    return (
      <section
        className="creator-success"
        aria-labelledby="creator-success-title"
      >
        <p className="eyebrow">House lights up</p>
        <h1 className="font-display" id="creator-success-title">
          Your membership is ready to share.
        </h1>
        <p>{confirmationNote}</p>
        <code>{createdTier}</code>
        <div className="creator-actions">
          <Link className="button button-applause" href={sharePath}>
            Open membership page
          </Link>
          <Link className="button button-outline" href={managePath}>
            Manage tier
          </Link>
          <button
            className="button button-dark"
            onClick={() =>
              void navigator.clipboard.writeText(
                new URL(sharePath, window.location.origin).toString(),
              )
            }
            type="button"
          >
            Copy share link
          </button>
        </div>
        <TransactionFlow state={transaction} />
      </section>
    );
  }

  return (
    <div className="creator-workspace">
      <aside className="creator-steps" aria-label="Creator setup steps">
        <p className="eyebrow">Set the room</p>
        <ol>
          {steps.map((item, index) => (
            <li className={step === item.id ? "is-current" : ""} key={item.id}>
              <button
                aria-label={item.label}
                onClick={() => setStep(item.id)}
                type="button"
              >
                <span>{index + 1}</span>
                {item.label}
              </button>
            </li>
          ))}
        </ol>
        <p className="small-copy">
          Your entries stay here while you connect, switch network, or recover
          from a wallet error.
        </p>
      </aside>

      <section className="creator-stage" aria-labelledby={`step-${step}`}>
        {step === "metadata" && (
          <div className="creator-step-panel">
            <p className="eyebrow">01 · Identity</p>
            <h2 id="step-metadata">Name the membership</h2>
            <p>
              Give fans a clear, creator-led invitation. You can update the
              description and links later; the name and symbol are permanent.
            </p>
            <div className="creator-field-grid">
              <Field
                error={result.errors.name}
                hint="Permanent · 100 UTF-8 bytes maximum"
                id="tier-name"
                label="Membership name"
              >
                <input
                  aria-describedby="tier-name-hint tier-name-error"
                  id="tier-name"
                  onChange={update("name")}
                  required
                  value={form.name}
                />
              </Field>
              <Field
                error={result.errors.symbol}
                hint="Permanent · short ERC-721 symbol"
                id="tier-symbol"
                label="Symbol"
              >
                <input
                  aria-describedby="tier-symbol-hint tier-symbol-error"
                  id="tier-symbol"
                  onChange={update("symbol")}
                  required
                  value={form.symbol}
                />
              </Field>
            </div>
            <Field
              error={result.errors.description}
              hint="Mutable · describe the relationship, access, or creative work"
              id="tier-description"
              label="Description"
            >
              <textarea
                aria-describedby="tier-description-hint tier-description-error"
                id="tier-description"
                onChange={update("description")}
                rows={5}
                value={form.description}
              />
            </Field>
            <div className="creator-field-grid">
              <Field
                error={result.errors.imageURI}
                hint="Mutable · HTTPS or IPFS presentation URI"
                id="tier-image"
                label="Creator image URI"
              >
                <input
                  aria-describedby="tier-image-hint tier-image-error"
                  id="tier-image"
                  onChange={update("imageURI")}
                  placeholder="https://… or ipfs://…"
                  value={form.imageURI}
                />
              </Field>
              <Field
                error={result.errors.externalURI}
                hint="Mutable · your public home or membership context"
                id="tier-website"
                label="Website URI"
              >
                <input
                  aria-describedby="tier-website-hint tier-website-error"
                  id="tier-website"
                  onChange={update("externalURI")}
                  placeholder="https://…"
                  value={form.externalURI}
                />
              </Field>
            </div>
          </div>
        )}

        {step === "price" && (
          <div className="creator-step-panel">
            <p className="eyebrow">02 · Price & period</p>
            <h2 id="step-price">Set the permanent rhythm</h2>
            <p>
              Price and period cannot change after deployment. Supporters renew
              manually; this protocol never schedules a charge.
            </p>
            <div className="creator-field-grid">
              <Field
                error={result.errors.priceUsd}
                hint="Permanent · use 0 for choose-your-support self-actions"
                id="tier-price"
                label="USDG per period"
              >
                <input
                  aria-describedby="tier-price-hint tier-price-error"
                  id="tier-price"
                  inputMode="decimal"
                  min="0"
                  onChange={update("priceUsd")}
                  value={form.priceUsd}
                />
              </Field>
              <Field
                error={result.errors.periodDays}
                hint="Permanent · whole days"
                id="tier-period"
                label="Days per period"
              >
                <input
                  aria-describedby="tier-period-hint tier-period-error"
                  id="tier-period"
                  inputMode="numeric"
                  min="1"
                  onChange={update("periodDays")}
                  value={form.periodDays}
                />
              </Field>
            </div>
          </div>
        )}

        {step === "splits" && (
          <div className="creator-step-panel">
            <p className="eyebrow">03 · Support split</p>
            <h2 id="step-splits">Choose how support is recognized</h2>
            <p>
              Rewards recognize membership support inside this tier. They are
              not equity, yield, dividends, or a promised return.
            </p>
            <div className="creator-field-grid">
              <Field
                error={result.errors.rewardPercent}
                hint="Permanent · any basis-point rate that keeps the total valid"
                id="tier-reward"
                label="Membership rewards (%)"
              >
                <input
                  aria-describedby="tier-reward-hint tier-reward-error"
                  id="tier-reward"
                  inputMode="decimal"
                  min="0"
                  onChange={update("rewardPercent")}
                  value={form.rewardPercent}
                />
              </Field>
              <Field
                error={result.errors.referralPercent}
                hint="Permanent · unused referral share returns to creator proceeds"
                id="tier-referral"
                label="Referral share (%)"
              >
                <input
                  aria-describedby="tier-referral-hint tier-referral-error"
                  id="tier-referral"
                  inputMode="decimal"
                  min="0"
                  onChange={update("referralPercent")}
                  value={form.referralPercent}
                />
              </Field>
            </div>
            {result.split && (
              <div className="split-preview" aria-label="Payment split preview">
                <div>
                  <p className="eyebrow">One period</p>
                  <strong>{usd(result.split.gross)}</strong>
                </div>
                <dl>
                  <div>
                    <dt>Protocol</dt>
                    <dd>{usd(result.split.protocol)}</dd>
                  </div>
                  <div>
                    <dt>Membership rewards</dt>
                    <dd>{usd(result.split.reward)}</dd>
                  </div>
                  <div>
                    <dt>Referral when locked</dt>
                    <dd>{usd(result.split.referral)}</dd>
                  </div>
                  <div>
                    <dt>Creator · referred</dt>
                    <dd>{usd(result.split.creatorReferred)}</dd>
                  </div>
                  <div>
                    <dt>Creator · unreferred</dt>
                    <dd>{usd(result.split.creatorUnreferred)}</dd>
                  </div>
                </dl>
              </div>
            )}
          </div>
        )}

        {step === "limits" && (
          <div className="creator-step-panel">
            <p className="eyebrow">04 · Capacity</p>
            <h2 id="step-limits">Set today’s operating limits</h2>
            <p>
              These values can change later. Zero means unlimited. Lowering a
              limit never removes existing time or occupied places.
            </p>
            <div className="creator-field-grid">
              <Field
                error={result.errors.supplyCap}
                hint="Mutable · 0 is unlimited; never lower than occupied supply"
                id="tier-capacity"
                label="Membership capacity"
              >
                <input
                  aria-describedby="tier-capacity-hint tier-capacity-error"
                  id="tier-capacity"
                  inputMode="numeric"
                  min="0"
                  onChange={update("supplyCap")}
                  value={form.supplyCap}
                />
              </Field>
              <Field
                error={result.errors.maxPrepaidPeriods}
                hint="Mutable · 12 is about one year at the default period"
                id="tier-prepayment"
                label="Maximum prepaid periods"
              >
                <input
                  aria-describedby="tier-prepayment-hint tier-prepayment-error"
                  id="tier-prepayment"
                  inputMode="numeric"
                  min="0"
                  onChange={update("maxPrepaidPeriods")}
                  value={form.maxPrepaidPeriods}
                />
              </Field>
            </div>
          </div>
        )}

        {step === "risks" && (
          <div className="creator-step-panel">
            <p className="eyebrow">05 · Material risks</p>
            <h2 id="step-risks">Know what permissionless means</h2>
            <ul className="risk-list">
              {result.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
              <li>
                A gift can create a permanent credential and reward shares for a
                recipient who did not ask for it.
              </li>
              <li>
                A blocked refund recipient can leave capacity held until time
                expires and someone synchronizes the membership.
              </li>
            </ul>
            <label className="acknowledgement">
              <input
                checked={economicsAcknowledged}
                onChange={(event) =>
                  setEconomicsAcknowledged(event.target.checked)
                }
                type="checkbox"
              />
              <span>
                I understand price, period, reward rate, referral rate, payment
                token, and the fixed 1% protocol fee are permanent.
              </span>
            </label>
            <label className="acknowledgement">
              <input
                checked={giftingAcknowledged}
                onChange={(event) =>
                  setGiftingAcknowledged(event.target.checked)
                }
                type="checkbox"
              />
              <span>
                I understand permissionless gifts can hold capacity, create
                permanent shares, and may not be immediately refundable.
              </span>
            </label>
          </div>
        )}

        {step === "review" && (
          <div className="creator-step-panel">
            <p className="eyebrow">06 · Immutable review</p>
            <h2 id="step-review">Read it once as your future self</h2>
            <div className="terms-review">
              <section>
                <p className="eyebrow">Locked at deployment</p>
                <dl>
                  <div>
                    <dt>Name / symbol</dt>
                    <dd>
                      {form.name || "—"} / {form.symbol || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>Price / period</dt>
                    <dd>
                      {form.priceUsd || "—"} USDG / {form.periodDays || "—"}{" "}
                      days
                    </dd>
                  </div>
                  <div>
                    <dt>Reward / referral</dt>
                    <dd>
                      {form.rewardPercent || "—"}% /{" "}
                      {form.referralPercent || "—"}%
                    </dd>
                  </div>
                </dl>
              </section>
              <section>
                <p className="eyebrow">Mutable after deployment</p>
                <dl>
                  <div>
                    <dt>Capacity</dt>
                    <dd>
                      {form.supplyCap === "0" ? "Unlimited" : form.supplyCap}
                    </dd>
                  </div>
                  <div>
                    <dt>Prepayment</dt>
                    <dd>
                      {form.maxPrepaidPeriods === "0"
                        ? "Unlimited"
                        : `${form.maxPrepaidPeriods} periods`}
                    </dd>
                  </div>
                  <div>
                    <dt>Controls</dt>
                    <dd>Pause, metadata, grants, refunds, and ownership</dd>
                  </div>
                </dl>
              </section>
            </div>

            <div className="wallet-review">
              <div>
                <p className="eyebrow">Wallet and network</p>
                <WalletControl />
              </div>
              {account.isConnected && chainId !== publicConfig.chainId && (
                <button
                  className="button button-warning"
                  onClick={() =>
                    switchChain.switchChain({ chainId: publicConfig.chainId })
                  }
                  type="button"
                >
                  Switch to {publicConfig.chain.name}
                </button>
              )}
              <WalletReadiness />
            </div>

            {!formValid && (
              <p className="inline-status" role="alert">
                Review the highlighted setup fields before preparing a
                signature.
              </p>
            )}
            {!acknowledged && (
              <p className="inline-status" role="status">
                Both permanence and gifting acknowledgements are required.
              </p>
            )}
            {!guard.enabled && (
              <p className="inline-status" role="status">
                Writes are unavailable: {guard.reason}
              </p>
            )}
            <button
              className="button button-applause button-deploy"
              disabled={!deployEnabled}
              onClick={() => void deploy()}
              type="button"
            >
              Simulate and deploy membership
            </button>
            <TransactionFlow
              onRetry={() => void deploy()}
              state={transaction}
            />
          </div>
        )}

        <nav className="creator-step-actions" aria-label="Setup step controls">
          <button
            className="button button-outline"
            disabled={step === steps[0].id}
            onClick={() => go(-1)}
            type="button"
          >
            Back
          </button>
          <button
            className="button button-dark"
            disabled={step === steps.at(-1)?.id}
            onClick={() => go(1)}
            type="button"
          >
            Next step
          </button>
        </nav>
      </section>
    </div>
  );
}
