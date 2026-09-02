"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Address, PublicClient } from "viem";

import { onchainMetadataRendererAbi } from "@/contracts";
import type { TierManagementSnapshot } from "@/contracts/types";
import { decodeRendererTokenURI } from "@/features/creator-studio/renderer-preview";
import { svgPreviewDataURI } from "@/features/creator-studio/PreviewGallery";
import { resolveRendererAddress } from "@/features/creator-studio/renderer-address";
import { makeRendererPreviewContext } from "@/features/creator-studio/studio-protocol";
import { readCreatedRendererAddresses } from "@/features/renderer-registry/registry-read";
import type { ReadyDeployment } from "@/lib/config";

type Choice = "current" | "default" | "custom" | `created:${Address}`;

function sameAddress(left: Address, right: Address) {
  return left.toLowerCase() === right.toLowerCase();
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
  const [choice, setChoice] = useState<Choice>("current");
  const [customAddress, setCustomAddress] = useState("");
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
    enabled: candidate.trim().length === 42,
    retry: false,
    queryFn: () =>
      resolveRendererAddress(client, {
        address: candidate,
        canonicalChainId: deployment.chainId,
        expectedSchema: snapshot.protocolDependencies.rendererSchema,
      }),
  });
  const preview = useQuery({
    queryKey: [
      "management-renderer-preview",
      resolution.data?.address,
      snapshot.tierIdentity,
      snapshot.renderer,
    ],
    enabled: Boolean(resolution.data),
    retry: false,
    queryFn: async () => {
      const context = makeRendererPreviewContext({
        tierName: snapshot.name,
        description: snapshot.description,
        externalURI: snapshot.externalURI,
        tierIdentity: snapshot.tierIdentity,
        art: snapshot.art,
        media: snapshot.media,
        tokenId: 7,
        state: "active",
        referenceTimestamp: BigInt(Math.floor(Date.now() / 1_000)),
      });
      const tokenURI = await client.readContract({
        address: resolution.data!.address,
        abi: onchainMetadataRendererAbi,
        functionName: "previewTokenURI",
        args: [context],
      });
      return decodeRendererTokenURI(tokenURI);
    },
  });
  const changed = Boolean(
    resolution.data && !sameAddress(resolution.data.address, snapshot.renderer),
  );

  return (
    <section className="control-group renderer-management">
      <div>
        <p className="eyebrow">Artwork renderer</p>
        <h2>Change every membership image</h2>
        <p>
          A renderer change updates the artwork for existing and future
          membership tokens. Payment terms, membership time, and your current
          art settings stay the same.
        </p>
      </div>
      <div
        aria-label="Artwork renderer"
        className="renderer-management-options"
        role="radiogroup"
      >
        <label>
          <input
            checked={choice === "current"}
            name="management-renderer"
            onChange={() => setChoice("current")}
            type="radio"
          />
          <span>
            <strong>Current</strong>
            <small>{snapshot.renderer}</small>
          </span>
        </label>
        {createdChoices.map((address, index) => (
          <label key={address}>
            <input
              checked={choice === `created:${address}`}
              name="management-renderer"
              onChange={() => setChoice(`created:${address}`)}
              type="radio"
            />
            <span>
              <strong>Your renderer {index + 1}</strong>
              <small>{address}</small>
            </span>
          </label>
        ))}
        {!sameAddress(snapshot.renderer, deployment.rendererAddress) ? (
          <label>
            <input
              checked={choice === "default"}
              name="management-renderer"
              onChange={() => setChoice("default")}
              type="radio"
            />
            <span>
              <strong>Original</strong>
              <small>Backed By Fans renderer</small>
            </span>
          </label>
        ) : null}
        <label>
          <input
            checked={choice === "custom"}
            name="management-renderer"
            onChange={() => setChoice("custom")}
            type="radio"
          />
          <span>
            <strong>Custom</strong>
            <small>Use a renderer contract address</small>
          </span>
        </label>
      </div>
      {choice === "custom" ? (
        <label className="creator-field">
          <span>Renderer contract address</span>
          <input
            className="font-mono"
            onChange={(event) => setCustomAddress(event.target.value)}
            placeholder="0x…"
            spellCheck={false}
            value={customAddress}
          />
        </label>
      ) : null}
      <div className="renderer-management-preview">
        {preview.data ? (
          // Renderer data URIs must bypass image optimization.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt={`${snapshot.name} artwork with the selected renderer`}
            src={svgPreviewDataURI(preview.data.svg)}
          />
        ) : resolution.isFetching || preview.isFetching ? (
          <p role="status">Loading artwork preview...</p>
        ) : resolution.error || preview.error ? (
          <p role="alert">
            This renderer could not preview the membership. Choose another
            renderer or try again.
          </p>
        ) : (
          <p>Select a renderer to preview it with this membership.</p>
        )}
      </div>
      <button
        className="button button-outline"
        disabled={!canUpdate || !changed || !preview.data}
        onClick={() => resolution.data && onUpdate(resolution.data.address)}
        type="button"
      >
        Update artwork for every membership
      </button>
    </section>
  );
}
