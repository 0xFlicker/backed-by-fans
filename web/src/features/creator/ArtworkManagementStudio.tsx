"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { simulateContract } from "@wagmi/core";
import { bytesToHex, zeroAddress, type Address } from "viem";
import {
  useAccount,
  useConfig,
  usePublicClient,
  useWriteContract,
} from "wagmi";

import { TransactionFlow } from "@/components/TransactionFlow";
import { WalletControl } from "@/components/WalletControl";
import { membershipTierAbi, onchainMediaStoreFactoryAbi } from "@/contracts";
import type {
  TierArtConfig,
  TierManagementSnapshot,
  TierMediaConfig,
} from "@/contracts/types";
import {
  CreatorStudio,
  type RendererChoice,
  type StudioRenderer,
} from "@/features/creator-studio/CreatorStudio";
import {
  canonicalArtEngineManifestNames,
  fromContractArtConfig,
  toContractArtConfig,
  type AnyStudioArtConfig,
} from "@/features/creator-studio/art-config";
import type { CustomRendererState } from "@/features/creator-studio/EnginePicker";
import {
  MediaCandidateOwner,
  processImageSource,
  type ExactMediaCandidate,
} from "@/features/creator-studio/image-processing";
import {
  defaultNativeMediaSettings,
  type NativeMediaLibraryModel,
  type NativeMediaSettings,
  type NativeMediaState,
} from "@/features/creator-studio/MediaEditor";
import type { PreviewSelection } from "@/features/creator-studio/PreviewGallery";
import { resolveRendererAddress } from "@/features/creator-studio/renderer-address";
import {
  emptyMediaConfig,
  mediaMimeIndex,
  nativeCandidateMediaConfig,
} from "@/features/creator-studio/studio-protocol";
import type { StudioMediaDraft } from "@/features/creator-studio/studio-draft";
import { useContractPreviews } from "@/features/creator-studio/use-contract-previews";
import { useRendererLibrary } from "@/features/creator-studio/use-renderer-library";
import { assertSufficientGas } from "@/features/protocol/gas-readiness";
import {
  creatorMediaPageSize,
  readConfirmedOnchainMedia,
  readCreatorMediaPage,
  reconcileStoredMedia,
  type ConfirmedOnchainMedia,
} from "@/features/protocol/registry-reconciliation";
import {
  isSuccessfulWriteReceipt,
  reconcileSuccessfulWrite,
} from "@/features/protocol/write-reconciliation";
import { isSameAddress } from "@/lib/address";
import type { ReadyDeployment } from "@/lib/config";
import {
  decodeTransactionError,
  initialTransactionState,
  isTransactionInFlight,
  transactionReducer,
} from "@/lib/transaction-state";

const confirmations = 3;

function sameValue(left: unknown, right: unknown) {
  return (
    JSON.stringify(left, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    ) ===
    JSON.stringify(right, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    )
  );
}

function hasMedia(media: TierMediaConfig) {
  return !isSameAddress(media.store, zeroAddress);
}

export function ArtworkManagementStudio({
  snapshot,
  deployment,
  onRefresh,
}: {
  snapshot: TierManagementSnapshot;
  deployment: ReadyDeployment;
  onRefresh: () => Promise<TierManagementSnapshot | undefined>;
}) {
  const account = useAccount();
  const wagmiConfig = useConfig();
  const client = usePublicClient({ chainId: deployment.chainId })!;
  const write = useWriteContract();
  const initialArt = useMemo(
    () => fromContractArtConfig(snapshot.art),
    [snapshot.art],
  );
  const [art, setArt] = useState<AnyStudioArtConfig>(initialArt);
  const [media, setMedia] = useState<StudioMediaDraft>(
    hasMedia(snapshot.media)
      ? { mode: "native", confirmedStore: snapshot.media.store }
      : { mode: "none" },
  );
  const [confirmedMedia, setConfirmedMedia] = useState<
    ConfirmedOnchainMedia | undefined
  >(
    hasMedia(snapshot.media)
      ? (snapshot.media as ConfirmedOnchainMedia)
      : undefined,
  );
  const [candidate, setCandidate] = useState<ExactMediaCandidate>();
  const [nativeState, setNativeState] = useState<NativeMediaState>(
    hasMedia(snapshot.media)
      ? { status: "stored", confirmedStore: snapshot.media.store }
      : { status: "empty" },
  );
  const [nativeSettings, setNativeSettings] = useState(
    defaultNativeMediaSettings,
  );
  const [selection, setSelection] = useState<PreviewSelection>({
    tokenId: 7,
    state: "active",
  });
  const [rendererChoice, setRendererChoice] = useState<RendererChoice>(
    isSameAddress(snapshot.renderer, deployment.rendererAddress)
      ? "original"
      : "custom",
  );
  const [rendererAddress, setRendererAddress] = useState(
    isSameAddress(snapshot.renderer, deployment.rendererAddress)
      ? ""
      : snapshot.renderer,
  );
  const [rendererResolution, setRendererResolution] =
    useState<StudioRenderer>();
  const [rendererState, setRendererState] = useState<CustomRendererState>(
    isSameAddress(snapshot.renderer, deployment.rendererAddress)
      ? { status: "idle" }
      : { status: "loading" },
  );
  const [rendererEngine, setRendererEngine] = useState(snapshot.art.engine);
  const [mediaPage, setMediaPage] = useState(0);
  const [selectingStore, setSelectingStore] = useState<Address>();
  const [imageTransaction, dispatchImage] = useReducer(
    transactionReducer,
    initialTransactionState,
  );
  const [updateTransaction, dispatchUpdate] = useReducer(
    transactionReducer,
    initialTransactionState,
  );
  const source = useRef<Blob | undefined>(undefined);
  const processingGeneration = useRef(0);
  const rendererGeneration = useRef(0);
  const candidateOwner = useRef(new MediaCandidateOwner());
  const updateInFlight = useRef(false);

  useEffect(
    () => () => {
      processingGeneration.current += 1;
      candidateOwner.current.dispose();
    },
    [],
  );

  const originalRenderer = useMemo<StudioRenderer>(
    () => ({
      address: deployment.rendererAddress,
      name: snapshot.protocolDependencies.rendererName,
      engines:
        snapshot.protocolDependencies.rendererEngineNames.length > 0
          ? snapshot.protocolDependencies.rendererEngineNames
          : canonicalArtEngineManifestNames,
    }),
    [deployment.rendererAddress, snapshot.protocolDependencies],
  );

  useEffect(() => {
    if (isSameAddress(snapshot.renderer, deployment.rendererAddress)) return;
    const generation = ++rendererGeneration.current;
    void resolveRendererAddress(client, {
      address: snapshot.renderer,
      canonicalChainId: deployment.chainId,
      expectedSchema: snapshot.protocolDependencies.rendererSchema,
    })
      .then((resolved) => {
        if (rendererGeneration.current !== generation) return;
        setRendererResolution(resolved);
        setRendererState({ status: "ready", rendererName: resolved.name });
      })
      .catch((error: unknown) => {
        if (rendererGeneration.current !== generation) return;
        setRendererState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "The current renderer could not be loaded.",
        });
      });
  }, [
    client,
    deployment.chainId,
    deployment.rendererAddress,
    snapshot.protocolDependencies.rendererSchema,
    snapshot.renderer,
  ]);

  const rendererLibrary = useRendererLibrary({
    client,
    registry: deployment.rendererRegistryAddress,
    owner: snapshot.creator,
    canonicalChainId: deployment.chainId,
    expectedSchema: snapshot.protocolDependencies.rendererSchema,
  });

  const libraryOffset = BigInt(mediaPage * creatorMediaPageSize);
  const mediaLibrary = useQuery({
    queryKey: [
      "artwork-management-media",
      deployment.chainId,
      snapshot.creator,
      mediaPage,
    ],
    retry: false,
    queryFn: () =>
      readCreatorMediaPage(client, {
        protocolDependencies: snapshot.protocolDependencies,
        creator: snapshot.creator,
        offset: libraryOffset,
      }),
  });
  const nativeLibrary = useMemo<NativeMediaLibraryModel>(() => {
    if (mediaLibrary.error) {
      return {
        status: "error",
        records: [],
        total: 0n,
        offset: libraryOffset,
        limit: creatorMediaPageSize,
        message: decodeTransactionError(mediaLibrary.error),
      };
    }
    if (!mediaLibrary.data) {
      return {
        status: "loading",
        records: [],
        total: 0n,
        offset: libraryOffset,
        limit: creatorMediaPageSize,
      };
    }
    return {
      status: "ready",
      ...mediaLibrary.data,
      selectedStore:
        media.mode === "native" ? confirmedMedia?.store : undefined,
      selectingStore,
    };
  }, [
    confirmedMedia?.store,
    libraryOffset,
    media.mode,
    mediaLibrary.data,
    mediaLibrary.error,
    selectingStore,
  ]);

  const selectedRenderer =
    rendererChoice === "original" ? originalRenderer : rendererResolution;
  const contractArt = useMemo<TierArtConfig>(
    () => ({ ...toContractArtConfig(art), engine: rendererEngine }),
    [art, rendererEngine],
  );
  const candidateMedia = useMemo(
    () => (candidate ? nativeCandidateMediaConfig(candidate) : undefined),
    [candidate],
  );
  const proposedMedia =
    media.mode === "none"
      ? emptyMediaConfig
      : (confirmedMedia ?? candidateMedia ?? emptyMediaConfig);
  const previewDraft = useMemo(
    () => ({
      tierName: snapshot.name,
      description: snapshot.description,
      externalURI: snapshot.externalURI,
      tierIdentity: snapshot.tierIdentity,
      art: contractArt,
      media: proposedMedia,
      nativeMedia: candidate
        ? bytesToHex(candidate.rendererCallBytes)
        : undefined,
    }),
    [candidate, contractArt, proposedMedia, snapshot],
  );
  const previews = useContractPreviews({
    client,
    protocol: snapshot.protocolDependencies,
    renderer: selectedRenderer?.address,
    draft: previewDraft,
    selection,
    enabled: Boolean(selectedRenderer),
    blockedMessage: "Choose a renderer to preview this artwork.",
  });

  function resolveCustomRenderer(value: string) {
    const generation = ++rendererGeneration.current;
    setRendererAddress(value);
    setRendererResolution(undefined);
    setRendererEngine(0);
    dispatchUpdate({ type: "RESET" });
    if (value.trim().length !== 42) {
      setRendererState({ status: "idle" });
      return;
    }
    setRendererState({ status: "loading" });
    void resolveRendererAddress(client, {
      address: value,
      canonicalChainId: deployment.chainId,
      expectedSchema: snapshot.protocolDependencies.rendererSchema,
    })
      .then((resolved) => {
        if (rendererGeneration.current !== generation) return;
        setRendererResolution(resolved);
        setRendererState({ status: "ready", rendererName: resolved.name });
      })
      .catch((error: unknown) => {
        if (rendererGeneration.current !== generation) return;
        setRendererState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "That renderer could not be loaded.",
        });
      });
  }

  function changeRendererChoice(choice: RendererChoice) {
    rendererGeneration.current += 1;
    setRendererChoice(choice);
    setRendererEngine(0);
    dispatchUpdate({ type: "RESET" });
    if (choice === "original") {
      setRendererResolution(undefined);
      setRendererState({ status: "idle" });
    } else if (choice === "custom") {
      resolveCustomRenderer(rendererAddress);
    }
  }

  async function processImage(
    blob: Blob,
    settings: NativeMediaSettings,
    nextArt = art,
  ) {
    const generation = ++processingGeneration.current;
    source.current = blob;
    candidateOwner.current.replace(undefined);
    setCandidate(undefined);
    setConfirmedMedia(undefined);
    setMedia({ mode: "native", confirmedStore: null });
    setNativeState({ status: "processing", message: "Preparing image..." });
    try {
      const next = await processImageSource(blob, {
        dimension: settings.dimension,
        focalX: nextArt.global.focalX,
        focalY: nextArt.global.focalY,
        output:
          settings.mime === "image/jpeg"
            ? {
                mime: "image/jpeg",
                quality: settings.jpegQuality,
                background: "#120b0a",
              }
            : { mime: "image/png", purpose: settings.pngPurpose },
      });
      if (generation !== processingGeneration.current) {
        next.dispose();
        return;
      }
      candidateOwner.current.replace(next);
      setCandidate(next);
      setNativeState({ status: "ready", candidate: next });
    } catch (error) {
      if (generation !== processingGeneration.current) return;
      setNativeState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "The browser could not prepare this image.",
      });
    }
  }

  async function selectStoredMedia(store: Address) {
    setSelectingStore(store);
    try {
      const selected = await readConfirmedOnchainMedia(client, {
        protocolDependencies: snapshot.protocolDependencies,
        creator: snapshot.creator,
        store,
      });
      if (!selected) throw new Error("That saved image is unavailable.");
      processingGeneration.current += 1;
      candidateOwner.current.replace(undefined);
      source.current = undefined;
      setCandidate(undefined);
      setConfirmedMedia(selected);
      setMedia({ mode: "native", confirmedStore: selected.store });
      setNativeState({ status: "stored", confirmedStore: selected.store });
    } catch (error) {
      setNativeState({
        status: "error",
        message: decodeTransactionError(error),
      });
    } finally {
      setSelectingStore(undefined);
    }
  }

  async function submitAndConfirm(
    dispatch: typeof dispatchUpdate,
    request: Parameters<typeof write.writeContractAsync>[0],
  ) {
    dispatch({ type: "SIMULATED", approvalRequired: false });
    dispatch({ type: "SIGN" });
    const hash = await write.writeContractAsync(request);
    dispatch({ type: "SIGNED" });
    dispatch({ type: "SUBMITTED", hash });
    let cancelled = false;
    const receipt = await client.waitForTransactionReceipt({
      confirmations,
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
    if (cancelled) {
      dispatch({
        type: "CANCELLED",
        error: "The wallet cancelled this artwork update.",
      });
      return undefined;
    }
    if (!isSuccessfulWriteReceipt(receipt)) {
      dispatch({
        type: "REVERTED",
        error: "The artwork transaction reverted onchain.",
      });
      return undefined;
    }
    dispatch({ type: "CONFIRM" });
    return receipt;
  }

  async function storeCandidate(): Promise<ConfirmedOnchainMedia | undefined> {
    if (!candidate || !account.address) return undefined;
    dispatchImage({ type: "SIMULATE" });
    const payload = bytesToHex(candidate.writeBytes);
    const mime = mediaMimeIndex(candidate);
    const { request } = await simulateContract(wagmiConfig, {
      account: account.address,
      chainId: deployment.chainId,
      address: snapshot.protocolDependencies.mediaStoreFactory,
      abi: onchainMediaStoreFactoryAbi,
      functionName: "store",
      args: [payload, mime],
    });
    await assertSufficientGas(client, account.address, request);
    const receipt = await submitAndConfirm(dispatchImage, request);
    if (!receipt) return undefined;
    return reconcileSuccessfulWrite({
      dispatch: dispatchImage,
      receipt,
      reconcile: (successfulReceipt) =>
        reconcileStoredMedia(client, {
          protocolDependencies: snapshot.protocolDependencies,
          creator: snapshot.creator,
          payload,
          mime,
          receipt: successfulReceipt,
        }),
    });
  }

  async function updateArtwork() {
    if (updateInFlight.current || !account.address || !selectedRenderer) return;
    updateInFlight.current = true;
    let stage: "image" | "update" = candidate ? "image" : "update";
    try {
      let finalMedia = proposedMedia;
      if (candidate) {
        const stored = await storeCandidate();
        if (!stored) return;
        finalMedia = stored;
        setConfirmedMedia(stored);
        setCandidate(undefined);
        setMedia({ mode: "native", confirmedStore: stored.store });
        setNativeState({
          status: "stored",
          candidate,
          confirmedStore: stored.store,
        });
        void mediaLibrary.refetch();
      }
      stage = "update";
      dispatchUpdate({ type: "SIMULATE" });
      const { request } = await simulateContract(wagmiConfig, {
        account: account.address,
        chainId: deployment.chainId,
        address: snapshot.address,
        abi: membershipTierAbi,
        functionName: "setPresentation",
        args: [selectedRenderer.address, contractArt, finalMedia],
      });
      await assertSufficientGas(client, account.address, request);
      const receipt = await submitAndConfirm(dispatchUpdate, request);
      if (!receipt) return;
      await reconcileSuccessfulWrite({
        dispatch: dispatchUpdate,
        receipt,
        reconcile: async () => {
          const refreshed = await onRefresh();
          return refreshed &&
            isSameAddress(refreshed.renderer, selectedRenderer.address) &&
            sameValue(refreshed.art, contractArt) &&
            sameValue(refreshed.media, finalMedia)
            ? refreshed
            : undefined;
        },
      });
    } catch (error) {
      const dispatch = stage === "image" ? dispatchImage : dispatchUpdate;
      dispatch({ type: "FAILED", error: decodeTransactionError(error) });
    } finally {
      updateInFlight.current = false;
    }
  }

  const inFlight =
    write.isPending ||
    isTransactionInFlight(imageTransaction.phase) ||
    isTransactionInFlight(updateTransaction.phase);
  const ownerConnected =
    account.address !== undefined &&
    account.chainId === deployment.chainId &&
    isSameAddress(account.address, snapshot.creator);
  const changed = Boolean(
    selectedRenderer &&
    (!isSameAddress(selectedRenderer.address, snapshot.renderer) ||
      !sameValue(contractArt, snapshot.art) ||
      !sameValue(proposedMedia, snapshot.media)),
  );
  const canSave =
    ownerConnected &&
    !inFlight &&
    changed &&
    Boolean(selectedRenderer) &&
    previews.model.focusedSVG.status === "ready" &&
    (media.mode === "none" || Boolean(confirmedMedia || candidate));
  const backHref =
    `/chains/${deployment.chainId}/tiers/${snapshot.address}/manage` as Route;

  return (
    <div className="artwork-management-studio">
      <header className="artwork-management-header">
        <div>
          <p className="eyebrow">Published membership</p>
          <h1>Update {snapshot.name} artwork</h1>
          <p>
            Changes apply to existing and future membership tokens. Payment
            terms and membership time do not change.
          </p>
        </div>
        <Link className="button button-outline" href={backHref}>
          Back to tier controls
        </Link>
      </header>

      <CreatorStudio
        art={art}
        rendererLibrary={rendererLibrary.data ?? []}
        customRendererAddress={rendererAddress}
        customRendererState={rendererState}
        disabled={inFlight}
        media={media}
        nativeLibrary={nativeLibrary}
        nativeSettings={nativeSettings}
        nativeState={nativeState}
        onArtChange={(next) => {
          const cropChanged =
            next.global.focalX !== art.global.focalX ||
            next.global.focalY !== art.global.focalY;
          setArt(next);
          if (cropChanged && source.current)
            void processImage(source.current, nativeSettings, next);
        }}
        onCreatedRendererChange={(renderer) => {
          rendererGeneration.current += 1;
          setRendererResolution(renderer);
          setRendererState({ status: "idle" });
          setRendererEngine(0);
        }}
        onCustomRendererAddressChange={resolveCustomRenderer}
        onEngineChange={setRendererEngine}
        onMediaChange={(next) => {
          setMedia(next);
          if (next.mode === "none") {
            processingGeneration.current += 1;
            candidateOwner.current.replace(undefined);
            source.current = undefined;
            setCandidate(undefined);
            setConfirmedMedia(undefined);
            setNativeState({ status: "empty" });
          }
        }}
        onNextNativeLibraryPage={() => setMediaPage((current) => current + 1)}
        onNativeSettingsChange={(settings) => {
          setNativeSettings(settings);
          if (source.current) void processImage(source.current, settings);
        }}
        onNativeSourceSelected={(blob, settings) =>
          void processImage(blob, settings)
        }
        onPreviousNativeLibraryPage={() =>
          setMediaPage((current) => Math.max(0, current - 1))
        }
        onRefreshPreviews={previews.refreshSet}
        onRendererChoiceChange={changeRendererChoice}
        onRetryNativeLibrary={() => void mediaLibrary.refetch()}
        onRetryPreview={previews.retryFocused}
        onSelectNativeStore={(store) => void selectStoredMedia(store)}
        onSelectionChange={setSelection}
        preview={previews.model}
        renderer={selectedRenderer}
        rendererChoice={rendererChoice}
        selectedEngine={rendererEngine}
        selection={selection}
        styleEngines={originalRenderer.engines}
      />

      <section className="studio-commit-panel">
        <div>
          <p className="eyebrow">Save artwork</p>
          <h2>Use this design for every membership</h2>
          <p>
            {candidate
              ? "Your new image will be stored first, then the membership artwork will be updated."
              : "Your wallet will update the renderer, design settings, and selected image together."}
          </p>
        </div>
        <div className="studio-commit-actions">
          <WalletControl />
          <button
            className="button button-dark"
            disabled={!canSave}
            onClick={() => void updateArtwork()}
            type="button"
          >
            Save artwork
          </button>
        </div>
        {!ownerConnected ? (
          <p className="field-hint">
            Connect the current creator wallet on this network to save.
          </p>
        ) : !changed ? (
          <p className="field-hint">
            Make a change in Art Studio to save new artwork.
          </p>
        ) : null}
        <TransactionFlow
          state={imageTransaction}
          onRetry={() => void updateArtwork()}
        />
        <TransactionFlow
          state={updateTransaction}
          onRetry={() => void updateArtwork()}
        />
      </section>
    </div>
  );
}
