"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  decodeFunctionResult,
  encodeFunctionData,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";

import { onchainMetadataRendererAbi } from "@/contracts";
import type {
  ProtocolDependencySnapshot,
  TierArtConfig,
  TierMediaConfig,
} from "@/contracts/types";
import {
  representativeTokenIds,
  type ContractSVGPreview,
  type PreviewGalleryModel,
  type PreviewResource,
  type PreviewSelection,
  type RepresentativeTokenId,
} from "@/features/creator-studio/PreviewGallery";
import {
  makeRendererPreviewContext,
  studioPreviewFingerprint,
} from "@/features/creator-studio/studio-protocol";
import { previewLimiter } from "@/features/creator-studio/preview-limiter";

const focusedDebounceMs = 300;
const galleryDebounceMs = 1_000;
const previewReferenceTimestamp = 1_800_000_000n;

type PreviewDraft = {
  tierName: string;
  description: string;
  externalURI: string;
  tierIdentity: Hex;
  art: TierArtConfig;
  media: TierMediaConfig;
  nativeMedia?: Hex;
};

type SettledDraft = {
  fingerprint: string;
  draft: PreviewDraft;
};

type PreviewQueriesInput = {
  client?: PublicClient;
  protocol?: ProtocolDependencySnapshot;
  renderer?: Address;
  draft?: PreviewDraft;
  selection: PreviewSelection;
  enabled: boolean;
  blockedMessage?: string;
};

async function readRendererPreview(
  client: PublicClient,
  renderer: Address,
  context: ReturnType<typeof makeRendererPreviewContext>,
  signal: AbortSignal,
): Promise<string> {
  const data = encodeFunctionData({
    abi: onchainMetadataRendererAbi,
    functionName: "previewSVG",
    args: [context],
  });
  const response = await client.call({
    batch: false,
    data,
    requestOptions: { retryCount: 0, signal },
    to: renderer,
  });
  if (!response.data) {
    throw new Error("The contract renderer returned no preview data.");
  }
  return decodeFunctionResult({
    abi: onchainMetadataRendererAbi,
    functionName: "previewSVG",
    data: response.data,
  }) as string;
}

function errorMessage(error: unknown) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "The contract renderer could not produce this preview.";
}

function svgResource(
  enabled: boolean,
  query: {
    data?: ContractSVGPreview;
    error: Error | null;
    isFetching: boolean;
  },
): PreviewResource<ContractSVGPreview> {
  if (!enabled) return { status: "idle" };
  if (query.isFetching) {
    return { status: "loading", message: "Rendering the exact SVG…" };
  }
  if (query.error)
    return { status: "error", message: errorMessage(query.error) };
  return query.data
    ? { status: "ready", value: query.data }
    : { status: "idle" };
}

function useSettledDraft(
  value: SettledDraft | undefined,
  delay: number,
): SettledDraft | undefined {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timeout = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timeout);
  }, [delay, value]);
  return settled;
}

function svgDescription(selection: PreviewSelection, engine: number) {
  return `${selection.state === "active" ? "Active" : "Archival afterglow"} onchain membership, token ${selection.tokenId}, renderer engine ${engine + 1}.`;
}

function svgQueryKey(
  protocol: ProtocolDependencySnapshot | undefined,
  renderer: Address | undefined,
  draft: SettledDraft | undefined,
  tokenId: RepresentativeTokenId,
  state: PreviewSelection["state"],
) {
  return [
    "creator-studio-preview-svg",
    protocol?.chainId,
    renderer,
    draft?.fingerprint,
    tokenId,
    state,
  ] as const;
}

async function renderSVG(input: {
  client: PublicClient;
  protocol: ProtocolDependencySnapshot;
  renderer: Address;
  settledDraft: SettledDraft;
  tokenId: RepresentativeTokenId;
  state: PreviewSelection["state"];
  signal: AbortSignal;
}): Promise<ContractSVGPreview> {
  const draft = input.settledDraft.draft;
  const selection = { tokenId: input.tokenId, state: input.state };
  const context = makeRendererPreviewContext({
    ...draft,
    tokenId: input.tokenId,
    state: input.state,
    referenceTimestamp: previewReferenceTimestamp,
    editingPlaceholders: true,
  });
  const svg = await previewLimiter.run(
    (signal) =>
      readRendererPreview(input.client, input.renderer, context, signal),
    input.signal,
  );
  return {
    svg,
    title: `${draft.tierName.trim() || "Creator Membership"} · token ${input.tokenId}`,
    description: svgDescription(selection, draft.art.engine),
  };
}

export function useContractPreviews(input: PreviewQueriesInput): {
  model: PreviewGalleryModel;
  refreshSet: () => void;
  retryFocused: () => void;
} {
  const normalized = useMemo<SettledDraft | undefined>(() => {
    if (!input.draft) return undefined;
    return {
      draft: input.draft,
      fingerprint: studioPreviewFingerprint(input.draft),
    };
  }, [input.draft]);
  const focusedDraft = useSettledDraft(normalized, focusedDebounceMs);
  const galleryDraft = useSettledDraft(normalized, galleryDebounceMs);
  const baseEnabled = Boolean(
    input.enabled &&
    input.client &&
    input.protocol &&
    input.renderer &&
    focusedDraft,
  );
  const galleryEnabled = Boolean(
    input.enabled &&
    input.client &&
    input.protocol &&
    input.renderer &&
    galleryDraft,
  );

  const focusedQuery = useQuery<ContractSVGPreview>({
    queryKey: svgQueryKey(
      input.protocol,
      input.renderer,
      focusedDraft,
      input.selection.tokenId,
      input.selection.state,
    ),
    enabled: baseEnabled,
    placeholderData: (previous) => previous,
    retry: false,
    staleTime: Infinity,
    gcTime: 5 * 60_000,
    queryFn: ({ signal }) =>
      renderSVG({
        client: input.client!,
        protocol: input.protocol!,
        renderer: input.renderer!,
        settledDraft: focusedDraft!,
        tokenId: input.selection.tokenId,
        state: input.selection.state,
        signal,
      }),
  });

  const galleryQueries = useQueries({
    queries: representativeTokenIds.map((tokenId) => ({
      queryKey: svgQueryKey(
        input.protocol,
        input.renderer,
        galleryDraft,
        tokenId,
        input.selection.state,
      ),
      enabled: galleryEnabled,
      placeholderData: (previous: ContractSVGPreview | undefined) => previous,
      retry: false,
      staleTime: Infinity,
      gcTime: 5 * 60_000,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        renderSVG({
          client: input.client!,
          protocol: input.protocol!,
          renderer: input.renderer!,
          settledDraft: galleryDraft!,
          tokenId,
          state: input.selection.state,
          signal,
        }),
    })),
  });

  const thumbnails = Object.fromEntries(
    representativeTokenIds.map((tokenId, index) => {
      const galleryQuery = galleryQueries[index];
      if (!galleryEnabled) return [tokenId, { status: "idle" } as const];
      if (galleryQuery.isFetching) {
        return [tokenId, { status: "loading" } as const];
      }
      if (galleryQuery.error) {
        return [
          tokenId,
          {
            status: "error",
            message: errorMessage(galleryQuery.error),
          } as const,
        ];
      }
      const value = galleryQuery.data;
      return [
        tokenId,
        value
          ? ({ status: "ready", value } as const)
          : ({ status: "idle" } as const),
      ];
    }),
  ) as PreviewGalleryModel["thumbnails"];

  const announcement = !input.enabled
    ? input.blockedMessage
    : focusedQuery.isFetching
      ? "Refreshing the exact contract-rendered composition."
      : focusedQuery.data
        ? `Token ${input.selection.tokenId} ${input.selection.state} preview is ready.`
        : undefined;

  return {
    model: {
      focusedSVG: svgResource(baseEnabled, focusedQuery),
      retainedSVG: focusedQuery.data,
      thumbnails,
      announcement,
    },
    refreshSet: () => {
      for (const query of galleryQueries) void query.refetch();
    },
    retryFocused: () => {
      void focusedQuery.refetch();
    },
  };
}
