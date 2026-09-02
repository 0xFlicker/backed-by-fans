"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Address, PublicClient } from "viem";

import type { TierManagementSnapshot } from "@/contracts/types";
import styles from "@/features/creator-studio/CreatorStudio.module.css";
import {
  PreviewGallery,
  type PreviewSelection,
} from "@/features/creator-studio/PreviewGallery";
import { resolveRendererAddress } from "@/features/creator-studio/renderer-address";
import { useContractPreviews } from "@/features/creator-studio/use-contract-previews";
import { readCreatedRendererAddresses } from "@/features/renderer-registry/registry-read";
import type { ReadyDeployment } from "@/lib/config";

type Choice = "current" | "default" | "custom" | `created:${Address}`;

function sameAddress(left: Address, right: Address) {
  return left.toLowerCase() === right.toLowerCase();
}

function shortAddress(address: Address) {
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

export function RendererManagementControl({
  snapshot,
  deployment,
  client,
  owner,
  canUpdate,
  onUpdate,
}: {
  snapshot: TierManagementSnapshot;
  deployment: ReadyDeployment;
  client: PublicClient;
  owner?: Address;
  canUpdate: boolean;
  onUpdate: (renderer: Address) => void;
}) {
  const [studioOpen, setStudioOpen] = useState(false);
  const [choice, setChoice] = useState<Choice>("current");
  const [customAddress, setCustomAddress] = useState("");
  const [selection, setSelection] = useState<PreviewSelection>({
    tokenId: 7,
    state: "active",
  });
  const created = useQuery({
    queryKey: [
      "management-created-renderers",
      deployment.chainId,
      deployment.rendererRegistryAddress,
      owner,
    ],
    enabled: Boolean(deployment.rendererRegistryAddress && owner),
    retry: false,
    queryFn: () =>
      readCreatedRendererAddresses(
        client,
        deployment.rendererRegistryAddress!,
        owner!,
      ),
  });
  const createdChoices = useMemo(
    () =>
      (created.data ?? []).filter(
        (address) =>
          !sameAddress(address, snapshot.renderer) &&
          !sameAddress(address, deployment.rendererAddress),
      ),
    [created.data, deployment.rendererAddress, snapshot.renderer],
  );
  const candidate =
    choice === "current"
      ? snapshot.renderer
      : choice === "default"
        ? deployment.rendererAddress
        : choice === "custom"
          ? customAddress
          : choice.slice("created:".length);
  const resolution = useQuery({
    queryKey: [
      "management-renderer-resolution",
      deployment.chainId,
      candidate,
      snapshot.protocolDependencies.rendererSchema,
    ],
    enabled: studioOpen && candidate.trim().length === 42,
    retry: false,
    queryFn: () =>
      resolveRendererAddress(client, {
        address: candidate,
        canonicalChainId: deployment.chainId,
        expectedSchema: snapshot.protocolDependencies.rendererSchema,
      }),
  });
  const draft = useMemo(
    () => ({
      tierName: snapshot.name,
      description: snapshot.description,
      externalURI: snapshot.externalURI,
      tierIdentity: snapshot.tierIdentity,
      art: snapshot.art,
      media: snapshot.media,
    }),
    [snapshot],
  );
  const previews = useContractPreviews({
    client,
    protocol: snapshot.protocolDependencies,
    renderer: resolution.data?.address,
    draft,
    selection,
    enabled: studioOpen && Boolean(resolution.data),
    blockedMessage: "Choose a renderer to preview this membership.",
  });
  const changed = Boolean(
    resolution.data && !sameAddress(resolution.data.address, snapshot.renderer),
  );
  const previewReady = previews.model.focusedSVG.status === "ready";

  if (!studioOpen) {
    return (
      <section className="control-group renderer-management">
        <div>
          <p className="eyebrow">Artwork renderer</p>
          <h2>Change your membership artwork</h2>
          <p>
            Reopen Art Studio to try another renderer with this tier’s current
            art and image settings. A change updates existing and future
            membership tokens.
          </p>
        </div>
        <div className={styles.rendererEntrySummary}>
          <span>Current renderer</span>
          <code title={snapshot.renderer}>
            {shortAddress(snapshot.renderer)}
          </code>
        </div>
        <button
          className="button button-outline"
          disabled={!canUpdate}
          onClick={() => setStudioOpen(true)}
          type="button"
        >
          Open Art Studio
        </button>
      </section>
    );
  }

  return (
    <section aria-label="Update membership artwork" className={styles.studio}>
      <header className={styles.rendererStudioHeader}>
        <div>
          <p className={styles.kicker}>Art Studio</p>
          <h1>Update your membership artwork</h1>
          <p>
            Choose a renderer and review it across representative memberships.
            Your existing art and image settings stay the same.
          </p>
        </div>
        <button
          className={styles.studioBackButton}
          onClick={() => setStudioOpen(false)}
          type="button"
        >
          Back to tier controls
        </button>
      </header>

      <div className={styles.workbench}>
        <div className={styles.previewColumn}>
          <PreviewGallery
            model={previews.model}
            onRefreshSet={previews.refreshSet}
            onRetryFocused={previews.retryFocused}
            onSelectionChange={setSelection}
            selection={selection}
          />
        </div>

        <div className={styles.toolColumn}>
          <fieldset
            aria-label="Artwork renderer"
            className={styles.enginePicker}
          >
            <legend>Choose a renderer</legend>
            <p className={styles.sectionHint}>
              Your renderers appear first, followed by the original design and a
              contract address option.
            </p>
            <div
              aria-label="Artwork renderer"
              className={styles.engineList}
              role="radiogroup"
            >
              <button
                aria-checked={choice === "current"}
                className={styles.engineChoice}
                data-engine="stack"
                onClick={() => setChoice("current")}
                role="radio"
                type="button"
              >
                <span className={styles.engineNumber}>01</span>
                <span className={styles.engineCopy}>
                  <strong>CURRENT</strong>
                  <span>Current membership artwork</span>
                  <small>{snapshot.renderer}</small>
                </span>
              </button>
              {createdChoices.map((address, index) => (
                <button
                  aria-checked={choice === `created:${address}`}
                  className={styles.engineChoice}
                  data-engine="afterimage"
                  key={address}
                  onClick={() => setChoice(`created:${address}`)}
                  role="radio"
                  type="button"
                >
                  <span className={styles.engineNumber}>
                    {String(index + 2).padStart(2, "0")}
                  </span>
                  <span className={styles.engineCopy}>
                    <strong>YOUR RENDERER {index + 1}</strong>
                    <span>Deployed from your wallet</span>
                    <small>{address}</small>
                  </span>
                </button>
              ))}
              {!sameAddress(snapshot.renderer, deployment.rendererAddress) ? (
                <button
                  aria-checked={choice === "default"}
                  className={styles.engineChoice}
                  data-engine="loom"
                  onClick={() => setChoice("default")}
                  role="radio"
                  type="button"
                >
                  <span className={styles.engineNumber}>
                    {String(createdChoices.length + 2).padStart(2, "0")}
                  </span>
                  <span className={styles.engineCopy}>
                    <strong>ORIGINAL</strong>
                    <span>Backed By Fans renderer</span>
                    <small>{deployment.rendererAddress}</small>
                  </span>
                </button>
              ) : null}
              <button
                aria-checked={choice === "custom"}
                className={styles.engineChoice}
                data-engine="custom"
                onClick={() => setChoice("custom")}
                role="radio"
                type="button"
              >
                <span className={styles.engineNumber}>
                  {String(
                    createdChoices.length +
                      (sameAddress(
                        snapshot.renderer,
                        deployment.rendererAddress,
                      )
                        ? 2
                        : 3),
                  ).padStart(2, "0")}
                </span>
                <span className={styles.engineCopy}>
                  <strong>CUSTOM</strong>
                  <span>Use a renderer contract address</span>
                </span>
              </button>
              {choice === "custom" ? (
                <div className={styles.customRendererField}>
                  <label htmlFor="management-renderer-address">
                    Renderer contract address
                  </label>
                  <input
                    aria-invalid={Boolean(resolution.error)}
                    id="management-renderer-address"
                    onChange={(event) => setCustomAddress(event.target.value)}
                    placeholder="0x..."
                    spellCheck={false}
                    value={customAddress}
                  />
                  {resolution.error ? (
                    <p role="alert">
                      This address is not a compatible renderer. Check it and
                      try again.
                    </p>
                  ) : (
                    <p>Paste a compatible renderer on this network.</p>
                  )}
                </div>
              ) : null}
            </div>
          </fieldset>

          <div className={styles.rendererUpdateAction}>
            <p>
              Updating changes the artwork for every existing and future
              membership. Payment terms and membership time do not change.
            </p>
            <button
              className={styles.primaryButton}
              disabled={!canUpdate || !changed || !previewReady}
              onClick={() =>
                resolution.data && onUpdate(resolution.data.address)
              }
              type="button"
            >
              Update artwork
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
