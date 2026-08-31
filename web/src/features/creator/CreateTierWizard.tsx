"use client";

import Link from "next/link";
import type { Route } from "next";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { simulateContract } from "@wagmi/core";
import {
  bytesToHex,
  formatUnits,
  zeroAddress,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { useAccount, useConfig, useSwitchChain, useWriteContract } from "wagmi";

import { TransactionFlow } from "@/components/TransactionFlow";
import { WalletControl } from "@/components/WalletControl";
import { WalletReadiness } from "@/components/WalletReadiness";
import {
  onchainMediaStoreFactoryAbi,
  onchainMetadataRendererAbi,
  robinhoodMembershipFactoryAbi,
} from "@/contracts";
import type {
  ProtocolDependencySnapshot,
  TierMediaConfig,
} from "@/contracts/types";
import {
  defaultCreatorForm,
  evaluateCreatorForm,
  type CreatorForm,
  type TierConfig,
} from "@/features/creator/config";
import { CreatorStudio } from "@/features/creator-studio/CreatorStudio";
import {
  createDefaultArtConfig,
  toContractArtConfig,
  type AnyStudioArtConfig,
} from "@/features/creator-studio/art-config";
import {
  MediaCandidateOwner,
  processImageSource,
  type ExactMediaCandidate,
} from "@/features/creator-studio/image-processing";
import { LatestTaskQueue } from "@/features/creator-studio/latest-task-queue";
import {
  defaultNativeMediaSettings,
  type NativeMediaLibraryModel,
  type NativeMediaSettings,
  type NativeMediaState,
  type RpcMediaConsent,
} from "@/features/creator-studio/MediaEditor";
import {
  svgPreviewDataURI,
  type PreviewSelection,
} from "@/features/creator-studio/PreviewGallery";
import { decodeRendererTokenURI } from "@/features/creator-studio/renderer-preview";
import { supportsFoundingSixStudio } from "@/features/creator-studio/RendererPicker";
import {
  emptyMediaConfig,
  makeRendererPreviewContext,
  mediaMimeIndex,
  nativeCandidateMediaConfig,
  studioPreviewFingerprint,
} from "@/features/creator-studio/studio-protocol";
import {
  persistUnsignedStudioDraft,
  recoverStoredUnsignedStudioDraft,
  removeStoredUnsignedStudioDraft,
  studioDraftAbiVersion,
  studioDraftRendererBoundsVersion,
  studioDraftStorageKey,
  type StudioDraftScope,
  type StudioMediaDraft,
} from "@/features/creator-studio/studio-draft";
import { useContractPreviews } from "@/features/creator-studio/use-contract-previews";
import { assertSufficientGas } from "@/features/protocol/gas-readiness";
import { readProtocolDependencies } from "@/features/protocol/protocol-read";
import {
  creatorMediaPageSize,
  readCreatorMediaPage,
  readConfirmedOnchainMedia,
  reconcileCreatedTier,
  reconcileStoredMedia,
  type ConfirmedOnchainMedia,
} from "@/features/protocol/registry-reconciliation";
import {
  isSuccessfulWriteReceipt,
  reconcileSuccessfulWrite,
  type SuccessfulWriteReceipt,
} from "@/features/protocol/write-reconciliation";
import { deploymentWriteGuard } from "@/features/protocol/deployment-write-guard";
import { isSameAddress } from "@/lib/address";
import { useActiveNetwork } from "@/lib/use-active-network";
import {
  decodeTransactionError,
  initialTransactionState,
  isTransactionInFlight,
  transactionReducer,
} from "@/lib/transaction-state";

const steps = [
  { id: "metadata", label: "Identity" },
  { id: "art", label: "Art Studio" },
  { id: "price", label: "Price & period" },
  { id: "splits", label: "Support split" },
  { id: "limits", label: "Capacity" },
  { id: "risks", label: "Risks" },
  { id: "review", label: "Review" },
] as const;

type StepId = (typeof steps)[number]["id"];

const previewOnlyCreator =
  "0x0000000000000000000000000000000000000bbf" as Address;

function freshBytes(length: number) {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

function freshCollectionSeed() {
  const seed = BigInt(bytesToHex(freshBytes(16)));
  return seed === 0n ? 1n : seed;
}

function createInitialStudioSession() {
  try {
    const salt = freshBytes(32);
    if (salt.every((value) => value === 0)) salt[31] = 1;
    return {
      art: createDefaultArtConfig("stack", freshCollectionSeed()),
      tierSalt: bytesToHex(salt),
    };
  } catch {
    return {
      art: createDefaultArtConfig(),
      tierSalt: undefined,
    };
  }
}

type NativeProcessingRequest = {
  generation: number;
  source: Blob;
  settings: NativeMediaSettings;
  art: AnyStudioArtConfig;
};

type CreatorProtocolScope = {
  chainId: number;
  factory: Address;
  mediaRegistry: Address;
  creator: Address;
};

type MediaVerificationAttempt = {
  client: PublicClient;
  scope: CreatorProtocolScope;
  dependencies: ProtocolDependencySnapshot;
  receipt: SuccessfulWriteReceipt;
  payload: Hex;
  mime: 1 | 2;
  selectionGeneration: number;
};

type TierVerificationAttempt = {
  client: PublicClient;
  scope: CreatorProtocolScope;
  dependencies: ProtocolDependencySnapshot;
  receipt: SuccessfulWriteReceipt;
  config: TierConfig;
  draftScope: StudioDraftScope;
};

function creatorProtocolScopeKey(scope: CreatorProtocolScope | undefined) {
  return scope
    ? [
        scope.chainId,
        scope.factory.toLowerCase(),
        scope.mediaRegistry.toLowerCase(),
        scope.creator.toLowerCase(),
      ].join(":")
    : undefined;
}

function sameCreatorProtocolScope(
  left: CreatorProtocolScope | undefined,
  right: CreatorProtocolScope,
) {
  return (
    left !== undefined &&
    left.chainId === right.chainId &&
    isSameAddress(left.factory, right.factory) &&
    isSameAddress(left.mediaRegistry, right.mediaRegistry) &&
    isSameAddress(left.creator, right.creator)
  );
}

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
      <p
        aria-hidden={!error}
        className="field-error"
        id={`${id}-error`}
        role={error ? "alert" : undefined}
      >
        {error ?? "\u00a0"}
      </p>
    </div>
  );
}

function usd(value: bigint) {
  return `${formatUnits(value, 6)} USDG`;
}

export function CreateTierWizard() {
  const [initialStudioSession] = useState(createInitialStudioSession);
  const [form, setForm] = useState(defaultCreatorForm);
  const [art, setArt] = useState<AnyStudioArtConfig>(initialStudioSession.art);
  const [media, setMedia] = useState<StudioMediaDraft>({ mode: "none" });
  const [selection, setSelection] = useState<PreviewSelection>({
    tokenId: 7,
    state: "active",
  });
  const [tierSalt, setTierSalt] = useState<Hex | undefined>(
    initialStudioSession.tierSalt,
  );
  const [nativeSettings, setNativeSettings] = useState<NativeMediaSettings>(
    defaultNativeMediaSettings,
  );
  const [nativeState, setNativeState] = useState<NativeMediaState>({
    status: "empty",
  });
  const [rpcConsent, setRpcConsent] = useState<RpcMediaConsent>("not-required");
  const [confirmedMedia, setConfirmedMedia] = useState<ConfirmedOnchainMedia>();
  const [confirmedMediaScope, setConfirmedMediaScope] = useState<{
    chainId: number;
    registry: Address;
    creator: Address;
  }>();
  const [candidate, setCandidate] = useState<ExactMediaCandidate>();
  const [draftReadyKey, setDraftReadyKey] = useState<string>();
  const [draftNotice, setDraftNotice] = useState<string>();
  const [draftRecoveryBlock, setDraftRecoveryBlock] = useState<{
    key: string;
    message: string;
    reason: "rejected" | "storage";
  }>();
  const [draftAutosaveBypassKey, setDraftAutosaveBypassKey] =
    useState<string>();
  const [draftRecoveryRevision, setDraftRecoveryRevision] = useState(0);
  const [touchedFields, setTouchedFields] = useState<
    Partial<Record<keyof CreatorForm, boolean>>
  >({});
  const [step, setStep] = useState<StepId>("metadata");
  const [economicsAcknowledged, setEconomicsAcknowledged] = useState(false);
  const [giftingAcknowledged, setGiftingAcknowledged] = useState(false);
  const [createdTier, setCreatedTier] = useState<{
    address: Address;
    scope: CreatorProtocolScope;
  }>();
  const [confirmationNote, setConfirmationNote] = useState<string>();
  const [mediaLibraryPage, setMediaLibraryPage] = useState(0);
  const [rendererChoice, setRendererChoice] = useState<{
    registryScopeKey: string;
    version: number;
  }>();
  const [selectingNativeStore, setSelectingNativeStore] = useState<Address>();
  const [mediaLibraryNotice, setMediaLibraryNotice] = useState<{
    scopeKey: string;
    tone: "info" | "error";
    message: string;
  }>();
  const [pendingMediaVerification, setPendingMediaVerification] =
    useState<MediaVerificationAttempt>();
  const [pendingTierVerification, setPendingTierVerification] =
    useState<TierVerificationAttempt>();
  const [transaction, dispatch] = useReducer(
    transactionReducer,
    initialTransactionState,
  );
  const [mediaTransaction, dispatchMedia] = useReducer(
    transactionReducer,
    initialTransactionState,
  );
  const deployInFlight = useRef(false);
  const mediaWriteInFlight = useRef(false);
  const mediaVerificationInFlight = useRef(false);
  const tierVerificationInFlight = useRef(false);
  const mediaSelectionGeneration = useRef(0);
  const candidateOwner = useRef(new MediaCandidateOwner());
  const sourceBlob = useRef<Blob | undefined>(undefined);
  const processingGeneration = useRef(0);
  const [processingQueue] = useState(
    () => new LatestTaskQueue<NativeProcessingRequest>(),
  );
  const processingDebounce = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const account = useAccount();
  const write = useWriteContract();
  const wagmiConfig = useConfig();
  const active = useActiveNetwork();
  const { client, deployment } = active;
  const protocol = useQuery({
    queryKey: [
      "creator-protocol-dependencies",
      active.clientChainId,
      deployment.status === "ready" ? deployment.factoryAddress : "unavailable",
    ],
    enabled: Boolean(deployment.status === "ready" && client),
    queryFn: async (): Promise<ProtocolDependencySnapshot> => {
      const result = await readProtocolDependencies(client!, deployment);
      if (result.status !== "valid") throw new Error(result.label);
      return result.data;
    },
    retry: false,
  });
  const rendererRegistryScopeKey = protocol.data
    ? `${protocol.data.chainId}:${protocol.data.factory.toLowerCase()}:${protocol.data.rendererSchema.toLowerCase()}`
    : undefined;
  const enabledRenderers = useMemo(
    () => protocol.data?.renderers.filter((renderer) => renderer.enabled) ?? [],
    [protocol.data],
  );
  const selectedRenderer = useMemo(() => {
    if (!protocol.data || !rendererRegistryScopeKey) return undefined;
    const version =
      rendererChoice?.registryScopeKey === rendererRegistryScopeKey
        ? rendererChoice.version
        : protocol.data.defaultRendererVersion;
    const renderer = enabledRenderers.find(
      (entry) => entry.version === version,
    );
    return renderer && supportsFoundingSixStudio(renderer)
      ? renderer
      : undefined;
  }, [
    enabledRenderers,
    protocol.data,
    rendererChoice,
    rendererRegistryScopeKey,
  ]);
  const gas = useQuery({
    queryKey: ["creator-gas-balance", active.chainId, account.address],
    enabled: Boolean(
      deployment.status === "ready" && account.address && client,
    ),
    queryFn: () => client!.getBalance({ address: account.address! }),
  });
  const switchChain = useSwitchChain();
  const contractArt = useMemo(() => toContractArtConfig(art), [art]);
  const currentCreatorScope = useMemo<CreatorProtocolScope | undefined>(
    () =>
      protocol.data && account.address
        ? {
            chainId: protocol.data.chainId,
            factory: protocol.data.factory,
            mediaRegistry: protocol.data.mediaStoreFactory,
            creator: account.address,
          }
        : undefined,
    [account.address, protocol.data],
  );
  const currentCreatorScopeKey = creatorProtocolScopeKey(currentCreatorScope);
  const currentCreatorScopeRef = useRef(currentCreatorScope);
  const currentPendingMediaVerification =
    pendingMediaVerification &&
    sameCreatorProtocolScope(
      currentCreatorScope,
      pendingMediaVerification.scope,
    )
      ? pendingMediaVerification
      : undefined;
  const currentPendingTierVerification =
    pendingTierVerification &&
    sameCreatorProtocolScope(currentCreatorScope, pendingTierVerification.scope)
      ? pendingTierVerification
      : undefined;
  const currentCreatedTier =
    createdTier &&
    sameCreatorProtocolScope(currentCreatorScope, createdTier.scope)
      ? createdTier
      : undefined;
  const draftScope = useMemo<StudioDraftScope | undefined>(
    () =>
      protocol.data && account.address && selectedRenderer
        ? {
            chainId: protocol.data.chainId,
            factory: protocol.data.factory,
            creator: account.address,
            rendererVersion: selectedRenderer.version,
            renderer: selectedRenderer.implementation,
            mediaRegistry: protocol.data.mediaStoreFactory,
            abiVersion: studioDraftAbiVersion,
            rendererBoundsVersion: studioDraftRendererBoundsVersion,
          }
        : undefined,
    [account.address, protocol.data, selectedRenderer],
  );
  const draftScopeKey = useMemo(
    () => (draftScope ? studioDraftStorageKey(draftScope) : undefined),
    [draftScope],
  );
  const previousDraftScopeKey = useRef(draftScopeKey);
  useEffect(() => {
    if (
      previousDraftScopeKey.current &&
      previousDraftScopeKey.current !== draftScopeKey
    ) {
      setDraftAutosaveBypassKey(undefined);
    }
    previousDraftScopeKey.current = draftScopeKey;
  }, [draftScopeKey]);
  const draftScopeBlocked =
    draftRecoveryBlock?.key === draftScopeKey &&
    draftAutosaveBypassKey !== draftScopeKey;
  const draftScopeReady =
    !draftScopeBlocked &&
    (draftScopeKey === undefined ||
      draftReadyKey === draftScopeKey ||
      draftAutosaveBypassKey === draftScopeKey);
  const currentConfirmedMedia =
    confirmedMedia &&
    confirmedMediaScope &&
    protocol.data?.chainId === confirmedMediaScope.chainId &&
    isSameAddress(
      protocol.data.mediaStoreFactory,
      confirmedMediaScope.registry,
    ) &&
    account.address !== undefined &&
    isSameAddress(account.address, confirmedMediaScope.creator)
      ? confirmedMedia
      : undefined;
  const mediaLibraryOffset = BigInt(mediaLibraryPage * creatorMediaPageSize);
  const creatorMediaLibrary = useQuery({
    queryKey: [
      "creator-onchain-media-library",
      currentCreatorScopeKey,
      mediaLibraryPage,
    ],
    enabled: Boolean(
      client &&
      protocol.data &&
      account.address &&
      media.mode === "native" &&
      draftScopeReady,
    ),
    retry: false,
    queryFn: async () => {
      const page = await readCreatorMediaPage(client!, {
        protocolDependencies: protocol.data!,
        creator: account.address!,
        offset: mediaLibraryOffset,
      });
      if (!page) {
        throw new Error(
          "The connected creator media registry could not be verified.",
        );
      }
      return page;
    },
  });
  const nativeLibrary = useMemo<NativeMediaLibraryModel | undefined>(() => {
    if (!currentCreatorScopeKey || media.mode !== "native") return undefined;
    const notice =
      mediaLibraryNotice?.scopeKey === currentCreatorScopeKey
        ? mediaLibraryNotice
        : undefined;
    if (creatorMediaLibrary.error) {
      return {
        status: "error",
        records: [],
        total: 0n,
        offset: mediaLibraryOffset,
        limit: creatorMediaPageSize,
        message:
          creatorMediaLibrary.error instanceof Error
            ? creatorMediaLibrary.error.message
            : "The connected creator media library could not be read.",
      };
    }
    if (!creatorMediaLibrary.data) {
      return {
        status: "loading",
        records: [],
        total: 0n,
        offset: mediaLibraryOffset,
        limit: creatorMediaPageSize,
      };
    }
    return {
      status: "ready",
      ...creatorMediaLibrary.data,
      selectedStore: currentConfirmedMedia?.store,
      selectingStore: selectingNativeStore,
      message: notice?.message,
      messageTone: notice?.tone,
    };
  }, [
    creatorMediaLibrary.data,
    creatorMediaLibrary.error,
    currentConfirmedMedia?.store,
    currentCreatorScopeKey,
    media.mode,
    mediaLibraryNotice,
    mediaLibraryOffset,
    selectingNativeStore,
  ]);
  const publicationMedia = useMemo<TierMediaConfig | undefined>(() => {
    if (media.mode === "none") return emptyMediaConfig;
    return currentConfirmedMedia;
  }, [currentConfirmedMedia, media.mode]);
  const creative = useMemo(
    () =>
      tierSalt && publicationMedia && selectedRenderer
        ? {
            tierSalt,
            rendererVersion: selectedRenderer.version,
            art: contractArt,
            media: publicationMedia,
          }
        : undefined,
    [contractArt, publicationMedia, selectedRenderer, tierSalt],
  );
  const result = useMemo(
    () => evaluateCreatorForm(form, account.address, creative),
    [account.address, creative, form],
  );
  const guard = deploymentWriteGuard({
    deployment,
    walletChainId: account.isConnected ? account.chainId : undefined,
    expectedChainId: active.clientChainId,
  });
  const formValid = Boolean(result.config);
  const acknowledged = economicsAcknowledged && giftingAcknowledged;
  const deployEnabled =
    formValid &&
    acknowledged &&
    Boolean(protocol.data) &&
    draftScopeReady &&
    guard.enabled &&
    (gas.data ?? 0n) > 0n &&
    !write.isPending &&
    !currentPendingTierVerification &&
    !isTransactionInFlight(transaction.phase) &&
    !isTransactionInFlight(mediaTransaction.phase);

  useEffect(
    () => () => {
      processingGeneration.current += 1;
      if (processingDebounce.current) {
        clearTimeout(processingDebounce.current);
      }
      processingQueue.clear();
      candidateOwner.current.dispose();
    },
    [processingQueue],
  );

  useLayoutEffect(() => {
    currentCreatorScopeRef.current = currentCreatorScope;
  }, [currentCreatorScope]);

  useEffect(() => {
    mediaSelectionGeneration.current += 1;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setSelectingNativeStore(undefined);
      setMediaLibraryPage(0);
      setMediaLibraryNotice(undefined);
      setCreatedTier(undefined);
      setConfirmationNote(undefined);
      dispatchMedia({ type: "RESET" });
      dispatch({ type: "RESET" });
    });
    return () => {
      cancelled = true;
    };
  }, [currentCreatorScopeKey]);

  useEffect(() => {
    const page = creatorMediaLibrary.data;
    if (!page || page.total === 0n || page.offset < page.total) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setMediaLibraryPage(
          Number((page.total - 1n) / BigInt(creatorMediaPageSize)),
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [creatorMediaLibrary.data]);

  useEffect(() => {
    if (
      !client ||
      !protocol.data ||
      !account.address ||
      !draftScope ||
      !draftScopeKey ||
      draftAutosaveBypassKey === draftScopeKey ||
      draftReadyKey === draftScopeKey
    ) {
      return;
    }

    let cancelled = false;
    const dependencies = protocol.data;
    const creator = account.address;
    const recoveryKey = draftScopeKey;
    const switchingScope = Boolean(
      draftReadyKey && draftReadyKey !== recoveryKey,
    );

    async function recoverCreativeDraft() {
      let recoveredNative: ConfirmedOnchainMedia | undefined;
      try {
        const recovered = await recoverStoredUnsignedStudioDraft(
          window.localStorage,
          draftScope!,
          {
            validateTierSalt: async (storedTierSalt) => {
              const identity = await client!.readContract({
                address: dependencies.factory,
                abi: robinhoodMembershipFactoryAbi,
                functionName: "predictTierIdentity",
                args: [creator, storedTierSalt],
              });
              const existingTier = await client!.readContract({
                address: dependencies.factory,
                abi: robinhoodMembershipFactoryAbi,
                functionName: "tierForIdentity",
                args: [identity],
              });
              return isSameAddress(existingTier, zeroAddress);
            },
            validateConfirmedStore: async (store) => {
              recoveredNative = await readConfirmedOnchainMedia(client!, {
                protocolDependencies: dependencies,
                creator,
                store,
              });
              return Boolean(recoveredNative);
            },
          },
        );
        if (cancelled) return;

        if (recovered.status === "ready") {
          mediaSelectionGeneration.current += 1;
          setSelectingNativeStore(undefined);
          processingGeneration.current += 1;
          candidateOwner.current.replace(undefined);
          sourceBlob.current = undefined;
          setCandidate(undefined);
          setTierSalt(recovered.draft.tierSalt);
          setArt(recovered.draft.art);
          setMedia(recovered.draft.media);
          setRpcConsent("not-required");
          if (
            recovered.draft.media.mode === "native" &&
            recovered.draft.media.confirmedStore &&
            recoveredNative
          ) {
            setConfirmedMedia(recoveredNative);
            setConfirmedMediaScope({
              chainId: dependencies.chainId,
              registry: dependencies.mediaStoreFactory,
              creator,
            });
            setNativeState({
              status: "stored",
              confirmedStore: recoveredNative.store,
            });
          } else {
            setConfirmedMedia(undefined);
            setConfirmedMediaScope(undefined);
            setNativeState({ status: "empty" });
          }
          setDraftNotice(
            "Your saved creative direction was restored and revalidated against the current contracts.",
          );
          setDraftRecoveryBlock(undefined);
          setDraftReadyKey(recoveryKey);
        } else if (recovered.status === "empty") {
          if (switchingScope) {
            const next = createInitialStudioSession();
            mediaSelectionGeneration.current += 1;
            setSelectingNativeStore(undefined);
            processingGeneration.current += 1;
            candidateOwner.current.replace(undefined);
            sourceBlob.current = undefined;
            setCandidate(undefined);
            setArt(next.art);
            setTierSalt(next.tierSalt);
            setMedia({ mode: "none" });
            setRpcConsent("not-required");
            setConfirmedMedia(undefined);
            setConfirmedMediaScope(undefined);
            setNativeState({ status: "empty" });
          }
          setDraftNotice(undefined);
          setDraftRecoveryBlock(undefined);
          setDraftReadyKey(recoveryKey);
        } else if (recovered.status === "rejected") {
          const message = `Saved Studio draft not restored: ${recovered.message}`;
          setDraftNotice(message);
          setDraftRecoveryBlock({
            key: recoveryKey,
            message,
            reason: "rejected",
          });
        }
      } catch (error) {
        if (cancelled) return;
        const message = `Creative draft recovery is unavailable: ${error instanceof Error ? error.message : "browser storage could not be read."}`;
        setDraftNotice(message);
        setDraftRecoveryBlock({ key: recoveryKey, message, reason: "storage" });
      }
    }

    void recoverCreativeDraft();
    return () => {
      cancelled = true;
    };
  }, [
    account.address,
    client,
    draftReadyKey,
    draftAutosaveBypassKey,
    draftRecoveryRevision,
    draftScope,
    draftScopeKey,
    protocol.data,
  ]);

  useEffect(() => {
    if (
      !draftScope ||
      !draftScopeKey ||
      !tierSalt ||
      draftAutosaveBypassKey === draftScopeKey ||
      draftReadyKey !== draftScopeKey
    ) {
      return;
    }

    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const mediaToPersist: StudioMediaDraft =
        media.mode === "native" && !currentConfirmedMedia
          ? { mode: "native", confirmedStore: null }
          : media;
      try {
        persistUnsignedStudioDraft(window.localStorage, {
          scope: draftScope,
          tierSalt,
          art,
          media: mediaToPersist,
        });
        setDraftRecoveryBlock((current) =>
          current?.key === draftScopeKey && current.reason === "storage"
            ? undefined
            : current,
        );
        setDraftNotice((current) =>
          current?.startsWith("Creative draft autosave paused:")
            ? "Creative draft autosave resumed."
            : current,
        );
      } catch (error) {
        const message = `Creative draft autosave paused: ${error instanceof Error ? error.message : "browser storage is unavailable."}`;
        setDraftNotice(message);
        setDraftRecoveryBlock({
          key: draftScopeKey,
          message,
          reason: "storage",
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [
    art,
    currentConfirmedMedia,
    draftAutosaveBypassKey,
    draftReadyKey,
    draftRecoveryRevision,
    draftScope,
    draftScopeKey,
    media,
    tierSalt,
  ]);

  const identityCreator = account.address ?? previewOnlyCreator;
  const tierIdentity = useQuery({
    queryKey: [
      "creator-tier-identity",
      protocol.data?.chainId,
      protocol.data?.factory,
      identityCreator,
      tierSalt,
    ],
    enabled: Boolean(client && protocol.data && tierSalt),
    retry: false,
    queryFn: () =>
      client!.readContract({
        address: protocol.data!.factory,
        abi: robinhoodMembershipFactoryAbi,
        functionName: "predictTierIdentity",
        args: [identityCreator, tierSalt!],
      }),
  });

  const candidateHex = useMemo(
    () =>
      candidate
        ? {
            payload: bytesToHex(candidate.writeBytes),
            renderer: bytesToHex(candidate.rendererCallBytes),
          }
        : undefined,
    [candidate],
  );
  const candidatePayload = candidateHex?.payload;
  const candidateMedia = useMemo(
    () => (candidate ? nativeCandidateMediaConfig(candidate) : undefined),
    [candidate],
  );
  const presentedNativeState: NativeMediaState =
    nativeState.status === "stored" && !currentConfirmedMedia
      ? candidate
        ? { status: "ready", candidate }
        : { status: "empty" }
      : nativeState;
  const nativeConsentBlocked = Boolean(
    media.mode === "native" &&
    candidate &&
    !currentConfirmedMedia &&
    rpcConsent !== "granted",
  );
  const previewMedia = useMemo(() => {
    if (media.mode === "none") return emptyMediaConfig;
    if (media.mode === "native") {
      if (currentConfirmedMedia) return currentConfirmedMedia;
      if (candidateMedia && rpcConsent === "granted") return candidateMedia;
      return emptyMediaConfig;
    }
    return emptyMediaConfig;
  }, [candidateMedia, currentConfirmedMedia, media.mode, rpcConsent]);
  const previewNativeMedia =
    media.mode === "native" &&
    !currentConfirmedMedia &&
    candidate &&
    rpcConsent === "granted"
      ? candidateHex?.renderer
      : undefined;
  const previewDraft = useMemo(
    () =>
      tierIdentity.data && protocol.data && selectedRenderer
        ? {
            tierName: form.name,
            description: form.description,
            externalURI: form.externalURI,
            tierIdentity: tierIdentity.data,
            art: contractArt,
            media: previewMedia,
            nativeMedia: previewNativeMedia,
          }
        : undefined,
    [
      contractArt,
      form.description,
      form.externalURI,
      form.name,
      previewMedia,
      previewNativeMedia,
      protocol.data,
      selectedRenderer,
      tierIdentity.data,
    ],
  );
  const contractPreviews = useContractPreviews({
    client,
    protocol: protocol.data,
    renderer: selectedRenderer?.implementation,
    draft: previewDraft,
    selection,
    enabled: Boolean(
      previewDraft &&
      selectedRenderer &&
      !nativeConsentBlocked &&
      draftScopeReady,
    ),
    blockedMessage: !protocol.data
      ? protocol.error
        ? "The canonical renderer registry is unavailable on this network."
        : "Preparing the canonical renderer registry."
      : !selectedRenderer
        ? enabledRenderers.length === 0
          ? "No compatible onchain artwork renderer is enabled for this network."
          : "Choose a compatible onchain artwork collection before rendering."
        : !draftScopeReady
          ? "Revalidate or discard the saved Studio draft before rendering against this creator scope."
          : nativeConsentBlocked
            ? "Allow this exact optimized candidate before it is sent to the configured RPC."
            : "Preparing the selected onchain renderer.",
  });

  const mediaGasQuote = useQuery({
    queryKey: [
      "creator-native-media-gas",
      protocol.data?.chainId,
      protocol.data?.mediaStoreFactory,
      account.address,
      candidateMedia?.digest,
      candidateMedia?.mime,
    ],
    enabled: Boolean(
      client &&
      protocol.data &&
      account.address &&
      candidatePayload &&
      candidateMedia &&
      media.mode === "native" &&
      !currentConfirmedMedia &&
      draftScopeReady &&
      rpcConsent === "granted",
    ),
    retry: false,
    queryFn: () =>
      client!.estimateContractGas({
        account: account.address!,
        address: protocol.data!.mediaStoreFactory,
        abi: onchainMediaStoreFactoryAbi,
        functionName: "store",
        args: [candidatePayload!, candidateMedia!.mime as 1 | 2],
      }),
  });

  const reviewFingerprint =
    result.config && tierIdentity.data
      ? studioPreviewFingerprint({
          tierName: result.config.name,
          description: result.config.metadata.description,
          externalURI: result.config.metadata.externalURI,
          tierIdentity: tierIdentity.data,
          art: result.config.art,
          media: result.config.media,
        })
      : undefined;
  const reviewToken = useQuery({
    queryKey: [
      "creator-final-token-uri",
      protocol.data?.chainId,
      selectedRenderer?.version,
      selectedRenderer?.implementation,
      reviewFingerprint,
    ],
    enabled: Boolean(
      step === "review" &&
      client &&
      protocol.data &&
      selectedRenderer &&
      result.config &&
      tierIdentity.data &&
      draftScopeReady,
    ),
    retry: false,
    staleTime: Infinity,
    queryFn: async () => {
      const context = makeRendererPreviewContext({
        tierName: result.config!.name,
        description: result.config!.metadata.description,
        externalURI: result.config!.metadata.externalURI,
        tierIdentity: tierIdentity.data!,
        art: result.config!.art,
        media: result.config!.media,
        tokenId: 7,
        state: "active",
        referenceTimestamp: BigInt(Math.floor(Date.now() / 1_000)),
      });
      const tokenURI = await client!.readContract({
        address: selectedRenderer!.implementation,
        abi: onchainMetadataRendererAbi,
        functionName: "previewTokenURI",
        args: [context],
      });
      return decodeRendererTokenURI(tokenURI);
    },
  });
  const publishEnabled = deployEnabled && Boolean(reviewToken.data);
  const activeDraftRecoveryBlock =
    draftRecoveryBlock?.key === draftScopeKey ? draftRecoveryBlock : undefined;

  const mediaStoreEnabled = Boolean(
    media.mode === "native" &&
    candidate &&
    candidatePayload &&
    candidateMedia &&
    !currentConfirmedMedia &&
    draftScopeReady &&
    rpcConsent === "granted" &&
    mediaGasQuote.data &&
    protocol.data &&
    account.address &&
    guard.enabled &&
    (gas.data ?? 0n) > 0n &&
    !write.isPending &&
    !currentPendingMediaVerification &&
    !isTransactionInFlight(mediaTransaction.phase) &&
    !isTransactionInFlight(transaction.phase),
  );

  function update(key: keyof CreatorForm) {
    return (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((current) => ({ ...current, [key]: event.target.value }));
      setCreatedTier(undefined);
      setConfirmationNote(undefined);
    };
  }

  function resetCompletion() {
    setCreatedTier(undefined);
    setConfirmationNote(undefined);
  }

  function handleRendererChange(version: number) {
    if (!rendererRegistryScopeKey) return;
    const renderer = enabledRenderers.find(
      (entry) => entry.version === version,
    );
    if (!renderer || !supportsFoundingSixStudio(renderer)) return;
    setRendererChoice({ registryScopeKey: rendererRegistryScopeKey, version });
    setDraftNotice(
      `${renderer.name} selected. Preview and publication will stay pinned to registry edition ${renderer.version}.`,
    );
    resetCompletion();
  }

  function invalidateMediaSelection() {
    mediaSelectionGeneration.current += 1;
    setSelectingNativeStore(undefined);
  }

  function retryDraftRecovery() {
    if (!draftScopeKey || draftRecoveryBlock?.key !== draftScopeKey) return;
    if (
      draftRecoveryBlock.reason === "storage" &&
      draftReadyKey === draftScopeKey
    ) {
      setDraftNotice("Retrying browser autosave for this creator…");
      setDraftRecoveryRevision((current) => current + 1);
      return;
    }
    setDraftRecoveryBlock(undefined);
    setDraftNotice("Revalidating the saved Studio draft…");
    setDraftRecoveryRevision((current) => current + 1);
  }

  function retryStudioIdentity() {
    const next = createInitialStudioSession();
    if (!next.tierSalt) {
      setDraftNotice(
        "Secure randomness is still unavailable. Check this browser and try again before publishing.",
      );
      return;
    }
    setTierSalt(next.tierSalt);
    setArt(next.art);
    setDraftNotice("A fresh permanent collection identity is ready.");
    resetCompletion();
  }

  function continueWithoutDraftAutosave() {
    if (
      !draftScopeKey ||
      draftRecoveryBlock?.key !== draftScopeKey ||
      draftRecoveryBlock.reason !== "storage"
    ) {
      return;
    }

    const next = createInitialStudioSession();
    if (!next.tierSalt) {
      setDraftNotice(
        "Secure randomness is unavailable. Browser autosave remains paused; retry before publishing.",
      );
      return;
    }

    invalidateMediaSelection();
    processingGeneration.current += 1;
    processingQueue.clear();
    if (processingDebounce.current) clearTimeout(processingDebounce.current);
    candidateOwner.current.replace(undefined);
    sourceBlob.current = undefined;
    setCandidate(undefined);
    setArt(next.art);
    setTierSalt(next.tierSalt);
    setMedia({ mode: "none" });
    setRpcConsent("not-required");
    setConfirmedMedia(undefined);
    setConfirmedMediaScope(undefined);
    setNativeState({ status: "empty" });
    setDraftAutosaveBypassKey(draftScopeKey);
    setDraftReadyKey(draftScopeKey);
    setDraftRecoveryBlock(undefined);
    setDraftNotice(
      "Continuing for this creator without browser autosave. This in-memory draft will not survive a reload.",
    );
    resetCompletion();
  }

  function discardBlockedDraft() {
    if (
      !draftScope ||
      !draftScopeKey ||
      draftRecoveryBlock?.key !== draftScopeKey
    ) {
      return;
    }
    try {
      removeStoredUnsignedStudioDraft(window.localStorage, draftScope);
    } catch (error) {
      setDraftNotice(
        `The saved draft could not be removed: ${error instanceof Error ? error.message : "browser storage is unavailable."}`,
      );
      return;
    }

    invalidateMediaSelection();
    processingGeneration.current += 1;
    candidateOwner.current.replace(undefined);
    sourceBlob.current = undefined;
    setCandidate(undefined);
    const next = createInitialStudioSession();
    setArt(next.art);
    setTierSalt(next.tierSalt);
    if (!next.tierSalt) {
      setDraftNotice(
        "The browser could not create a fresh secure collection identity. Reload before publishing this draft.",
      );
    }
    setMedia({ mode: "none" });
    setRpcConsent("not-required");
    setConfirmedMedia(undefined);
    setConfirmedMediaScope(undefined);
    setNativeState({ status: "empty" });
    setDraftRecoveryBlock(undefined);
    setDraftReadyKey(draftScopeKey);
    setDraftNotice((current) =>
      current?.startsWith("The browser could not create")
        ? current
        : "The blocked saved draft was removed. This creator now has a fresh Studio direction.",
    );
    resetCompletion();
  }

  async function runNativeImageRequest(request: NativeProcessingRequest) {
    try {
      const output =
        request.settings.mime === "image/jpeg"
          ? ({
              mime: "image/jpeg" as const,
              quality: request.settings.jpegQuality,
              background: "#120b0a",
            } as const)
          : ({
              mime: "image/png" as const,
              purpose: request.settings.pngPurpose,
            } as const);
      const next = await processImageSource(request.source, {
        dimension: request.settings.dimension,
        focalX: request.art.global.focalX,
        focalY: request.art.global.focalY,
        output,
      });
      if (request.generation !== processingGeneration.current) {
        next.dispose();
        return;
      }
      candidateOwner.current.replace(next);
      setCandidate(next);
      setNativeState({ status: "ready", candidate: next });
    } catch (error) {
      if (request.generation !== processingGeneration.current) return;
      setNativeState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "The browser could not prepare this image.",
      });
    }
  }

  function processNativeImage(
    source: Blob,
    settings: NativeMediaSettings,
    nextArt: AnyStudioArtConfig = art,
    debounce = false,
  ) {
    invalidateMediaSelection();
    const generation = ++processingGeneration.current;
    if (processingDebounce.current) clearTimeout(processingDebounce.current);
    candidateOwner.current.replace(undefined);
    setCandidate(undefined);
    setConfirmedMedia(undefined);
    setConfirmedMediaScope(undefined);
    setMedia({ mode: "native", confirmedStore: null });
    setRpcConsent("required");
    dispatchMedia({ type: "RESET" });
    setNativeState({
      status: "processing",
      message: "Cropping and encoding locally in this browser…",
    });
    resetCompletion();
    const enqueue = () => {
      processingQueue.enqueue(
        {
          generation,
          source,
          settings,
          art: nextArt,
        },
        runNativeImageRequest,
      );
    };
    if (debounce) processingDebounce.current = setTimeout(enqueue, 250);
    else enqueue();
  }

  function handleNativeSourceSelected(
    source: Blob,
    settings: NativeMediaSettings,
  ) {
    sourceBlob.current = source;
    void processNativeImage(source, settings);
  }

  function handleNativeSettingsChange(settings: NativeMediaSettings) {
    setNativeSettings(settings);
    if (sourceBlob.current) {
      processNativeImage(sourceBlob.current, settings, art, true);
    } else if (currentConfirmedMedia) {
      invalidateMediaSelection();
      setConfirmedMedia(undefined);
      setConfirmedMediaScope(undefined);
      setMedia({ mode: "native", confirmedStore: null });
      setNativeState({ status: "empty" });
      setDraftNotice(
        "Choose a source image or reselect stored media after changing its output settings.",
      );
    }
  }

  async function selectNativeStore(store: Address) {
    if (
      !client ||
      !protocol.data ||
      !account.address ||
      !currentCreatorScope ||
      !currentCreatorScopeKey ||
      selectingNativeStore
    ) {
      return;
    }
    const generation = ++mediaSelectionGeneration.current;
    const scope = currentCreatorScope;
    const dependencies = protocol.data;
    const creator = account.address;
    setSelectingNativeStore(store);
    setMediaLibraryNotice(undefined);
    try {
      const confirmed = await readConfirmedOnchainMedia(client, {
        protocolDependencies: dependencies,
        creator,
        store,
      });
      if (
        generation !== mediaSelectionGeneration.current ||
        !sameCreatorProtocolScope(currentCreatorScopeRef.current, scope)
      ) {
        return;
      }
      if (!confirmed) {
        setMediaLibraryNotice({
          scopeKey: currentCreatorScopeKey,
          tone: "error",
          message:
            "Could not verify that image against the connected creator and its immutable runtime bytes.",
        });
        return;
      }

      processingGeneration.current += 1;
      processingQueue.clear();
      if (processingDebounce.current) clearTimeout(processingDebounce.current);
      candidateOwner.current.replace(undefined);
      sourceBlob.current = undefined;
      setCandidate(undefined);
      setConfirmedMedia(confirmed);
      setConfirmedMediaScope({
        chainId: scope.chainId,
        registry: scope.mediaRegistry,
        creator: scope.creator,
      });
      setMedia({ mode: "native", confirmedStore: confirmed.store });
      setNativeState({
        status: "stored",
        confirmedStore: confirmed.store,
      });
      setRpcConsent("not-required");
      dispatchMedia({ type: "RESET" });
      setMediaLibraryNotice({
        scopeKey: currentCreatorScopeKey,
        tone: "info",
        message:
          "Immutable bytes verified. This stored image now drives the exact renderer preview.",
      });
      resetCompletion();
    } catch (error) {
      if (
        generation !== mediaSelectionGeneration.current ||
        !sameCreatorProtocolScope(currentCreatorScopeRef.current, scope)
      ) {
        return;
      }
      setMediaLibraryNotice({
        scopeKey: currentCreatorScopeKey,
        tone: "error",
        message:
          "Could not verify this stored image. " +
          decodeTransactionError(error),
      });
    } finally {
      if (generation === mediaSelectionGeneration.current) {
        setSelectingNativeStore(undefined);
      }
    }
  }

  function handleArtChange(next: AnyStudioArtConfig) {
    const cropChanged =
      next.global.focalX !== art.global.focalX ||
      next.global.focalY !== art.global.focalY;
    setArt(next);
    resetCompletion();
    if (cropChanged && media.mode === "native" && sourceBlob.current) {
      processNativeImage(sourceBlob.current, nativeSettings, next, true);
    }
  }

  function handleMediaChange(next: StudioMediaDraft) {
    invalidateMediaSelection();
    const normalized =
      next.mode === "native" && currentConfirmedMedia
        ? {
            mode: "native" as const,
            confirmedStore: currentConfirmedMedia.store,
          }
        : next;
    setMedia(normalized);
    resetCompletion();
    if (normalized.mode !== "native") {
      processingGeneration.current += 1;
      processingQueue.clear();
      if (processingDebounce.current) {
        clearTimeout(processingDebounce.current);
      }
      candidateOwner.current.replace(undefined);
      sourceBlob.current = undefined;
      setCandidate(undefined);
      setNativeState(
        currentConfirmedMedia
          ? {
              status: "stored",
              confirmedStore: currentConfirmedMedia.store,
            }
          : { status: "empty" },
      );
    }
  }

  async function verifyStoredMedia(attempt: MediaVerificationAttempt) {
    if (
      mediaVerificationInFlight.current ||
      !sameCreatorProtocolScope(currentCreatorScopeRef.current, attempt.scope)
    ) {
      return;
    }
    mediaVerificationInFlight.current = true;
    const scopedDispatch: typeof dispatchMedia = (event) => {
      if (
        sameCreatorProtocolScope(currentCreatorScopeRef.current, attempt.scope)
      ) {
        dispatchMedia(event);
      }
    };
    try {
      const stored = await reconcileSuccessfulWrite({
        dispatch: scopedDispatch,
        receipt: attempt.receipt,
        reconcile: (successfulReceipt) =>
          reconcileStoredMedia(attempt.client, {
            protocolDependencies: attempt.dependencies,
            creator: attempt.scope.creator,
            payload: attempt.payload,
            mime: attempt.mime,
            receipt: successfulReceipt,
          }),
      });
      if (
        !stored ||
        !sameCreatorProtocolScope(currentCreatorScopeRef.current, attempt.scope)
      ) {
        return;
      }
      setPendingMediaVerification(undefined);
      const stillSelectedCandidate =
        attempt.selectionGeneration === mediaSelectionGeneration.current;
      if (stillSelectedCandidate) {
        setConfirmedMedia(stored);
        setConfirmedMediaScope({
          chainId: attempt.scope.chainId,
          registry: attempt.scope.mediaRegistry,
          creator: attempt.scope.creator,
        });
        setMedia({ mode: "native", confirmedStore: stored.store });
        setNativeState({
          status: "stored",
          candidate,
          confirmedStore: stored.store,
        });
        setRpcConsent("not-required");
      }
      setMediaLibraryNotice({
        scopeKey: creatorProtocolScopeKey(attempt.scope)!,
        tone: "info",
        message: stillSelectedCandidate
          ? "Permanent storage verified. The image is now reusable from this creator’s onchain library."
          : "Permanent storage verified and added to the onchain library. Your newer media choice remains unchanged.",
      });
      void creatorMediaLibrary.refetch();
    } finally {
      mediaVerificationInFlight.current = false;
    }
  }

  async function storeNativeMedia() {
    if (mediaWriteInFlight.current || currentPendingMediaVerification) return;
    mediaWriteInFlight.current = true;
    try {
      await storeNativeMediaOnce();
    } finally {
      mediaWriteInFlight.current = false;
    }
  }

  async function storeNativeMediaOnce() {
    if (
      !mediaStoreEnabled ||
      !client ||
      !protocol.data ||
      !account.address ||
      !currentCreatorScope ||
      !candidate ||
      !candidatePayload ||
      !candidateMedia
    ) {
      return;
    }
    const dependencies = protocol.data;
    const creator = account.address;
    const scope = currentCreatorScope;
    const mime = mediaMimeIndex(candidate);
    const selectionGeneration = mediaSelectionGeneration.current;
    const scopedDispatch: typeof dispatchMedia = (event) => {
      if (sameCreatorProtocolScope(currentCreatorScopeRef.current, scope)) {
        dispatchMedia(event);
      }
    };
    let waitingForReceipt = false;
    try {
      scopedDispatch({ type: "SIMULATE" });
      const { request } = await simulateContract(wagmiConfig, {
        account: creator,
        chainId: dependencies.chainId,
        address: dependencies.mediaStoreFactory,
        abi: onchainMediaStoreFactoryAbi,
        functionName: "store",
        args: [candidatePayload, mime],
      });
      await assertSufficientGas(client, creator, request);
      scopedDispatch({ type: "SIMULATED", approvalRequired: false });
      scopedDispatch({ type: "SIGN" });
      const hash = await write.writeContractAsync(request);
      scopedDispatch({ type: "SIGNED" });
      scopedDispatch({ type: "SUBMITTED", hash });
      waitingForReceipt = true;
      let cancelled = false;
      const receipt = await client.waitForTransactionReceipt({
        hash,
        onReplaced: (replacement) => {
          cancelled ||= replacement.reason === "cancelled";
          scopedDispatch({
            type: "REPLACED",
            replacementHash: replacement.transaction.hash,
            reason: replacement.reason,
          });
        },
      });
      waitingForReceipt = false;
      if (cancelled) {
        scopedDispatch({
          type: "CANCELLED",
          error: "The wallet cancelled the media storage transaction.",
        });
        return;
      }
      if (!isSuccessfulWriteReceipt(receipt)) {
        scopedDispatch({
          type: "REVERTED",
          error: "The media storage transaction reverted onchain.",
        });
        return;
      }
      if (!sameCreatorProtocolScope(currentCreatorScopeRef.current, scope)) {
        return;
      }
      scopedDispatch({ type: "CONFIRM" });
      const attempt: MediaVerificationAttempt = {
        client,
        scope,
        dependencies,
        receipt,
        payload: candidatePayload,
        mime,
        selectionGeneration,
      };
      setPendingMediaVerification(attempt);
      await verifyStoredMedia(attempt);
    } catch (error) {
      scopedDispatch({
        type: waitingForReceipt ? "UNCERTAIN" : "FAILED",
        error: decodeTransactionError(error),
      });
    }
  }

  function normalizeEmptyPercent(key: "rewardPercent" | "referralPercent") {
    setForm((current) =>
      current[key].trim() === "" ? { ...current, [key]: "0" } : current,
    );
  }

  function touch(key: keyof CreatorForm) {
    setTouchedFields((current) => ({ ...current, [key]: true }));
  }

  function go(direction: 1 | -1) {
    const index = steps.findIndex(({ id }) => id === step);
    const next =
      steps[Math.max(0, Math.min(steps.length - 1, index + direction))];
    setStep(next.id);
  }

  async function verifyPublishedTier(attempt: TierVerificationAttempt) {
    if (
      tierVerificationInFlight.current ||
      !sameCreatorProtocolScope(currentCreatorScopeRef.current, attempt.scope)
    ) {
      return;
    }
    tierVerificationInFlight.current = true;
    const scopedDispatch: typeof dispatch = (event) => {
      if (
        sameCreatorProtocolScope(currentCreatorScopeRef.current, attempt.scope)
      ) {
        dispatch(event);
      }
    };
    try {
      const tier = await reconcileSuccessfulWrite({
        dispatch: scopedDispatch,
        receipt: attempt.receipt,
        reconcile: (successfulReceipt) =>
          reconcileCreatedTier(attempt.client, {
            protocolDependencies: attempt.dependencies,
            config: attempt.config,
            receipt: successfulReceipt,
          }),
      });
      if (
        !tier ||
        !sameCreatorProtocolScope(currentCreatorScopeRef.current, attempt.scope)
      ) {
        return;
      }
      setPendingTierVerification(undefined);
      let draftCleanupWarning = "";
      try {
        removeStoredUnsignedStudioDraft(
          window.localStorage,
          attempt.draftScope,
        );
      } catch {
        draftCleanupWarning =
          " Your browser could not clear the used local draft; on reload, the Studio will detect it and require a fresh direction.";
      }
      const next = createInitialStudioSession();
      setTierSalt(next.tierSalt);
      setArt(next.art);
      setMedia({ mode: "none" });
      setConfirmedMedia(undefined);
      setConfirmedMediaScope(undefined);
      setNativeState({ status: "empty" });
      setCreatedTier({ address: tier, scope: attempt.scope });
      setConfirmationNote(
        `The successful receipt and factory registry confirm this tier with the complete reviewed launch terms.${draftCleanupWarning}`,
      );
    } finally {
      tierVerificationInFlight.current = false;
    }
  }

  async function deploy() {
    if (deployInFlight.current || currentPendingTierVerification) return;
    deployInFlight.current = true;
    try {
      await deployOnce();
    } finally {
      deployInFlight.current = false;
    }
  }

  async function deployOnce() {
    if (
      !publishEnabled ||
      !result.config ||
      !client ||
      !account.address ||
      !protocol.data ||
      !currentCreatorScope ||
      !draftScope ||
      !draftScopeKey
    ) {
      return;
    }
    const creator = account.address;
    const config = result.config;
    const dependencies = protocol.data;
    const factory = dependencies.factory;
    const scope = currentCreatorScope;
    const scopedDispatch: typeof dispatch = (event) => {
      if (sameCreatorProtocolScope(currentCreatorScopeRef.current, scope)) {
        dispatch(event);
      }
    };

    setConfirmationNote(undefined);

    let waitingForReceipt = false;
    try {
      scopedDispatch({ type: "SIMULATE" });
      const { request } = await simulateContract(wagmiConfig, {
        account: creator,
        chainId: dependencies.chainId,
        address: factory,
        abi: robinhoodMembershipFactoryAbi,
        functionName: "createTier",
        args: [config],
      });
      await assertSufficientGas(client, creator, request);
      scopedDispatch({ type: "SIMULATED", approvalRequired: false });
      scopedDispatch({ type: "SIGN" });
      const hash = await write.writeContractAsync(request);
      scopedDispatch({ type: "SIGNED" });
      scopedDispatch({ type: "SUBMITTED", hash });
      waitingForReceipt = true;
      let cancelled = false;
      const receipt = await client.waitForTransactionReceipt({
        hash,
        onReplaced: (replacement) => {
          cancelled ||= replacement.reason === "cancelled";
          scopedDispatch({
            type: "REPLACED",
            replacementHash: replacement.transaction.hash,
            reason: replacement.reason,
          });
        },
      });
      waitingForReceipt = false;
      if (cancelled) {
        scopedDispatch({
          type: "CANCELLED",
          error: "The wallet cancelled the deployment transaction.",
        });
        return;
      }
      if (!isSuccessfulWriteReceipt(receipt)) {
        scopedDispatch({
          type: "REVERTED",
          error: "The deployment transaction reverted onchain.",
        });
        return;
      }
      if (!sameCreatorProtocolScope(currentCreatorScopeRef.current, scope)) {
        return;
      }
      scopedDispatch({ type: "CONFIRM" });
      const attempt: TierVerificationAttempt = {
        client,
        scope,
        dependencies,
        receipt,
        config,
        draftScope,
      };
      setPendingTierVerification(attempt);
      await verifyPublishedTier(attempt);
    } catch (error) {
      scopedDispatch({
        type: waitingForReceipt ? "UNCERTAIN" : "FAILED",
        error: decodeTransactionError(error),
      });
    }
  }

  if (currentCreatedTier) {
    const sharePath = ("/chains/" +
      currentCreatedTier.scope.chainId +
      "/tiers/" +
      currentCreatedTier.address) as Route;
    const managePath = (sharePath + "/manage") as Route;
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
        <code>{currentCreatedTier.address}</code>
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
    <div
      className={`creator-workspace${step === "art" ? "creator-workspace-studio" : ""}`}
    >
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
                error={touchedFields.name ? result.errors.name : undefined}
                hint="Permanent · 100 UTF-8 bytes maximum"
                id="tier-name"
                label="Membership name"
              >
                <input
                  aria-describedby="tier-name-hint tier-name-error"
                  id="tier-name"
                  onBlur={() => touch("name")}
                  onChange={update("name")}
                  placeholder="Creator membership"
                  required
                  value={form.name}
                />
              </Field>
              <Field
                error={touchedFields.symbol ? result.errors.symbol : undefined}
                hint="Permanent · short ERC-721 symbol"
                id="tier-symbol"
                label="Symbol"
              >
                <input
                  aria-describedby="tier-symbol-hint tier-symbol-error"
                  id="tier-symbol"
                  onBlur={() => touch("symbol")}
                  onChange={update("symbol")}
                  placeholder="FANS"
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
        )}

        {step === "art" && (
          <div className="creator-studio-step">
            <span className="sr-only" id="step-art">
              Art Studio
            </span>
            <CreatorStudio
              art={art}
              disabled={
                !draftScopeReady ||
                isTransactionInFlight(mediaTransaction.phase) ||
                isTransactionInFlight(transaction.phase)
              }
              media={media}
              nativeLibrary={nativeLibrary}
              nativeSettings={nativeSettings}
              nativeState={presentedNativeState}
              onArtChange={handleArtChange}
              onGrantRpcConsent={() => setRpcConsent("granted")}
              onKeepComposition={() => setStep("price")}
              onMediaChange={handleMediaChange}
              onNextNativeLibraryPage={() =>
                setMediaLibraryPage((current) => current + 1)
              }
              onNativeSourceSelected={handleNativeSourceSelected}
              onNativeSettingsChange={handleNativeSettingsChange}
              onPreviousNativeLibraryPage={() =>
                setMediaLibraryPage((current) => Math.max(0, current - 1))
              }
              onRefreshPreviews={contractPreviews.refreshSet}
              onRendererChange={handleRendererChange}
              onRetryNativeLibrary={() => void creatorMediaLibrary.refetch()}
              onRetryPreview={contractPreviews.retryFocused}
              onSelectNativeStore={(store) => void selectNativeStore(store)}
              onSelectionChange={setSelection}
              preview={contractPreviews.model}
              renderers={protocol.data?.renderers ?? []}
              rpcConsent={rpcConsent}
              selectedRendererVersion={selectedRenderer?.version}
              selection={selection}
            />

            {!tierSalt && (
              <section className="studio-commit-panel" role="alert">
                <div>
                  <p className="eyebrow">Secure identity unavailable</p>
                  <h2>The browser could not create permanent randomness.</h2>
                  <p>
                    Nothing can be published until a fresh collection identity
                    is created locally.
                  </p>
                </div>
                <button
                  className="button button-dark"
                  onClick={retryStudioIdentity}
                  type="button"
                >
                  Retry secure identity
                </button>
              </section>
            )}

            {draftNotice && !activeDraftRecoveryBlock && (
              <p className="inline-status" role="status">
                {draftNotice}
              </p>
            )}

            {activeDraftRecoveryBlock && (
              <section className="studio-commit-panel" role="alert">
                <div>
                  <p className="eyebrow">Saved draft needs attention</p>
                  <h2>Creative recovery is paused.</h2>
                  <p>{activeDraftRecoveryBlock.message}</p>
                  <p>
                    No contract preview or wallet action will use this creator
                    scope until recovery is resolved for this exact scope.
                  </p>
                </div>
                <div className="studio-commit-action">
                  <button
                    className="button button-dark"
                    onClick={retryDraftRecovery}
                    type="button"
                  >
                    Retry validation
                  </button>
                  {activeDraftRecoveryBlock.reason === "storage" ? (
                    <button
                      className="button button-outline"
                      onClick={continueWithoutDraftAutosave}
                      type="button"
                    >
                      Continue without browser autosave
                    </button>
                  ) : (
                    <button
                      className="button button-outline"
                      onClick={discardBlockedDraft}
                      type="button"
                    >
                      Discard saved draft
                    </button>
                  )}
                </div>
              </section>
            )}

            {media.mode === "native" && candidate && !currentConfirmedMedia && (
              <section
                aria-labelledby="store-native-media-heading"
                className="studio-commit-panel"
              >
                <div>
                  <p className="eyebrow">Separate permanent action</p>
                  <h2 id="store-native-media-heading">
                    Store this exact image on Robinhood Chain
                  </h2>
                  <p>
                    These {candidate.byteLength.toLocaleString("en-US")} bytes
                    and your creator address will remain public and
                    independently discoverable, even if you never publish the
                    membership tier.
                  </p>
                  <dl className="studio-commit-facts">
                    <div>
                      <dt>Exact format</dt>
                      <dd>{candidate.mime === "image/png" ? "PNG" : "JPEG"}</dd>
                    </div>
                    <div>
                      <dt>Estimated gas</dt>
                      <dd>
                        {mediaGasQuote.isFetching
                          ? "Estimating…"
                          : mediaGasQuote.data
                            ? mediaGasQuote.data.toLocaleString("en-US")
                            : "Allow RPC preview to estimate"}
                      </dd>
                    </div>
                  </dl>
                </div>
                <div className="studio-commit-action">
                  <WalletControl />
                  {!guard.enabled && (
                    <p className="inline-status">{guard.reason}</p>
                  )}
                  {mediaGasQuote.error && (
                    <p className="inline-status" role="alert">
                      The exact storage quote failed. Review the image or retry
                      the configured RPC.
                    </p>
                  )}
                  <button
                    className="button button-applause"
                    disabled={!mediaStoreEnabled}
                    onClick={() => void storeNativeMedia()}
                    type="button"
                  >
                    Store image permanently
                  </button>
                </div>
                <TransactionFlow
                  onRetry={() => void storeNativeMedia()}
                  state={mediaTransaction}
                />
              </section>
            )}

            {currentPendingMediaVerification && (
              <section className="studio-commit-panel" role="status">
                <div>
                  <p className="eyebrow">Receipt confirmed</p>
                  <h2>Verify the permanent image—do not store it again.</h2>
                  <p>
                    The wallet supplied a successful receipt. This retry only
                    repeats the canonical registry and runtime-byte checks with
                    that exact in-memory receipt and payload; it cannot submit
                    another transaction.
                  </p>
                </div>
                <button
                  className="button button-dark"
                  disabled={mediaTransaction.phase === "reconciliation"}
                  onClick={() =>
                    void verifyStoredMedia(currentPendingMediaVerification)
                  }
                  type="button"
                >
                  Retry onchain verification
                </button>
              </section>
            )}

            {media.mode === "native" && currentConfirmedMedia && (
              <section className="studio-stored-panel" role="status">
                <p className="eyebrow">Permanently stored</p>
                <h2>The image is ready for this membership.</h2>
                <p>
                  Art controls remain editable. Changing the encoded image or
                  format creates a new permanent media action; this confirmed
                  store remains reusable.
                </p>
                <code>{currentConfirmedMedia.store}</code>
              </section>
            )}
          </div>
        )}

        {step === "price" && (
          <div className="creator-step-panel">
            <p className="eyebrow">03 · Price & period</p>
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
            <p className="eyebrow">04 · Support split</p>
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
                  onBlur={() => normalizeEmptyPercent("rewardPercent")}
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
                  onBlur={() => normalizeEmptyPercent("referralPercent")}
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
            <p className="eyebrow">05 · Capacity</p>
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
            <p className="eyebrow">06 · Material risks</p>
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
            <p className="eyebrow">07 · Immutable review</p>
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
                      {form.rewardPercent || "0"}% /{" "}
                      {form.referralPercent || "0"}%
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

            <section
              aria-labelledby="final-art-review-heading"
              className="final-art-review"
            >
              <div className="final-art-copy">
                <p className="eyebrow">Authoritative renderer checkpoint</p>
                <h3 id="final-art-review-heading">
                  The full onchain token response
                </h3>
                <p>
                  This is decoded from the renderer&apos;s complete token URI,
                  including the canonical self-contained SVG that the tier will
                  publish.
                </p>
                <dl>
                  <div>
                    <dt>Artwork collection</dt>
                    <dd>
                      {selectedRenderer
                        ? `${selectedRenderer.name} · registry edition ${selectedRenderer.version}`
                        : "Choose a compatible renderer"}
                    </dd>
                  </div>
                  <div>
                    <dt>Engine</dt>
                    <dd>{art.engine.toUpperCase()}</dd>
                  </div>
                  <div>
                    <dt>Collection seed</dt>
                    <dd>
                      <code>
                        {art.collectionSeed.toString(16).padStart(32, "0")}
                      </code>
                    </dd>
                  </div>
                  <div>
                    <dt>Media identity</dt>
                    <dd>
                      {media.mode === "none"
                        ? "Generated onchain art"
                        : currentConfirmedMedia
                          ? `Robinhood Chain · ${currentConfirmedMedia.length.toLocaleString("en-US")} bytes`
                          : "Onchain image not stored yet"}
                    </dd>
                  </div>
                  <div>
                    <dt>Tier identity</dt>
                    <dd>
                      <code>
                        {tierIdentity.data ?? "Connect wallet to bind"}
                      </code>
                    </dd>
                  </div>
                </dl>
              </div>
              <div className="final-art-frame">
                {reviewToken.data ? (
                  // The renderer's exact data URI must bypass image optimization.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt={`${reviewToken.data.metadata.name} canonical onchain membership artwork`}
                    src={svgPreviewDataURI(reviewToken.data.svg)}
                  />
                ) : reviewToken.isFetching ? (
                  <p role="status">Decoding the complete token response…</p>
                ) : reviewToken.error ? (
                  <p role="alert">
                    The authoritative token preview failed. Return to the Art
                    Studio or retry the configured RPC before publishing.
                  </p>
                ) : (
                  <p>
                    Complete the Art Studio and connect the publishing wallet to
                    render the final token response.
                  </p>
                )}
              </div>
            </section>

            <div className="wallet-review">
              <div>
                <p className="eyebrow">Wallet and network</p>
                <WalletControl />
              </div>
              {account.isConnected &&
                account.chainId !== active.clientChainId && (
                  <button
                    className="button button-warning"
                    onClick={() =>
                      switchChain.switchChain({ chainId: active.clientChainId })
                    }
                    type="button"
                  >
                    Switch to {active.chain?.name ?? "a supported network"}
                  </button>
                )}
              <WalletReadiness />
            </div>

            {!formValid && (
              <p className="inline-status" role="alert">
                Review the highlighted setup fields and complete the immutable
                Art Studio selection before preparing a signature.
              </p>
            )}
            {result.creativeError && (
              <p className="inline-status" role="alert">
                {result.creativeError}
              </p>
            )}
            {reviewToken.isFetching && (
              <p className="inline-status" role="status">
                The final full token response is still rendering.
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
            {currentPendingTierVerification && (
              <section className="studio-commit-panel" role="status">
                <div>
                  <p className="eyebrow">Receipt confirmed</p>
                  <h2>Verify the membership—do not publish it again.</h2>
                  <p>
                    This retry performs only the canonical factory and tier
                    reads with the exact successful receipt and reviewed launch
                    config retained in this page session.
                  </p>
                </div>
                <button
                  className="button button-dark"
                  disabled={transaction.phase === "reconciliation"}
                  onClick={() =>
                    void verifyPublishedTier(currentPendingTierVerification)
                  }
                  type="button"
                >
                  Retry onchain verification
                </button>
              </section>
            )}
            <button
              className="button button-applause button-deploy"
              disabled={!publishEnabled}
              onClick={() => void deploy()}
              type="button"
            >
              Publish this membership
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
