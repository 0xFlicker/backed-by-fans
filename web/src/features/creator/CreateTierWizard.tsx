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
  membershipFactoryAbi,
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
import { PaymentTokenPicker } from "@/features/creator/PaymentTokenPicker";
import {
  CreatorStudio,
  type RendererChoice,
  type StudioRenderer,
} from "@/features/creator-studio/CreatorStudio";
import {
  canonicalArtEngineManifestNames,
  createDefaultArtConfig,
  toContractArtConfig,
  type AnyStudioArtConfig,
} from "@/features/creator-studio/art-config";
import type { CustomRendererState } from "@/features/creator-studio/EnginePicker";
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
} from "@/features/creator-studio/MediaEditor";
import {
  svgPreviewDataURI,
  type PreviewSelection,
} from "@/features/creator-studio/PreviewGallery";
import { decodeRendererTokenURI } from "@/features/creator-studio/renderer-preview";
import { resolveRendererAddress } from "@/features/creator-studio/renderer-address";
import { readCreatedRendererAddresses } from "@/features/renderer-registry/registry-read";
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
import {
  membershipRendererSchema,
  readProtocolDependencies,
} from "@/features/protocol/protocol-read";
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
import {
  readAcceptedPaymentTokens,
  type AcceptedPaymentToken,
} from "@/lib/payment-token-read";
import { formatRawTokenAmount } from "@/lib/token-amount";
import { useActiveNetwork } from "@/lib/use-active-network";
import {
  decodeTransactionError,
  initialTransactionState,
  isTransactionInFlight,
  transactionReducer,
  type TransactionPhase,
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

const publicationConfirmations = 3;

const previewOnlyCreator =
  "0x0000000000000000000000000000000000000bbf" as Address;

class DraftValidationUnavailableError extends Error {
  constructor(cause: unknown) {
    super(
      cause instanceof Error
        ? cause.message
        : "The canonical chain is unavailable.",
      { cause },
    );
    this.name = "DraftValidationUnavailableError";
  }
}

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

function formattedPayment(value: bigint, token?: AcceptedPaymentToken) {
  return token
    ? `${formatRawTokenAmount({
        raw: value,
        decimals: token.decimals,
        multiplier: token.uiMultiplier,
      })} ${token.symbol}`
    : value.toString();
}

function publicationStepStatus(phase: TransactionPhase, waiting = false) {
  if (waiting) return "Next";
  if (phase === "confirmed") return "Complete";
  if (isTransactionInFlight(phase)) return "In progress";
  if (phase === "idle") return "Ready";
  return "Needs attention";
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
  const [rendererChoice, setRendererChoice] =
    useState<RendererChoice>("original");
  const [rendererAddress, setRendererAddress] = useState("");
  const [rendererEngine, setRendererEngine] = useState(0);
  const [rendererResolution, setRendererResolution] =
    useState<StudioRenderer>();
  const [rendererCustomState, setRendererCustomState] =
    useState<CustomRendererState>({ status: "idle" });
  const rendererResolutionGeneration = useRef(0);
  const rendererScope = useRef<string | undefined>(undefined);
  const [selectingNativeStore, setSelectingNativeStore] = useState<Address>();
  const [mediaLibraryNotice, setMediaLibraryNotice] = useState<{
    scopeKey: string;
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
  const rendererScopeKey =
    deployment.status === "ready"
      ? `${deployment.chainId}:${deployment.factoryAddress.toLowerCase()}:${deployment.rendererAddress.toLowerCase()}`
      : `${active.clientChainId}:unavailable`;
  const originalRenderer = useMemo(() => {
    const address =
      protocol.data?.renderer ??
      (deployment.status === "ready" ? deployment.rendererAddress : undefined);
    if (!address) return undefined;
    return {
      address,
      name: protocol.data?.rendererName ?? "BACKED BY FANS / FOUNDING SIX",
      engines:
        protocol.data?.rendererEngineNames.length ===
        canonicalArtEngineManifestNames.length
          ? protocol.data.rendererEngineNames
          : canonicalArtEngineManifestNames,
    };
  }, [deployment, protocol.data]);
  const createdRenderers = useQuery({
    queryKey: [
      "creator-renderers",
      deployment.status === "ready"
        ? deployment.rendererRegistryAddress
        : undefined,
      account.address,
    ],
    enabled: Boolean(
      deployment.status === "ready" &&
      deployment.rendererRegistryAddress &&
      account.address &&
      client,
    ),
    queryFn: async () => {
      if (
        deployment.status !== "ready" ||
        !deployment.rendererRegistryAddress ||
        !account.address ||
        !client ||
        (deployment.chainId !== 46_630 && deployment.chainId !== 31_337)
      ) {
        return [];
      }
      const addresses = await readCreatedRendererAddresses(
        client,
        deployment.rendererRegistryAddress,
        account.address,
      );
      const canonicalChainId = deployment.chainId;
      const resolutions = await Promise.allSettled(
        addresses.map((address) =>
          resolveRendererAddress(client, {
            address,
            canonicalChainId,
            expectedSchema: membershipRendererSchema,
          }),
        ),
      );
      return resolutions.flatMap((resolution) =>
        resolution.status === "fulfilled" ? [resolution.value] : [],
      );
    },
    retry: false,
  });
  const selectedRenderer =
    rendererChoice === "original" ? originalRenderer : rendererResolution;

  useEffect(() => {
    if (rendererScope.current === rendererScopeKey) return;
    rendererScope.current = rendererScopeKey;
    rendererResolutionGeneration.current += 1;
    setRendererChoice("original");
    setRendererAddress("");
    setRendererEngine(0);
    setRendererResolution(undefined);
    setRendererCustomState({ status: "idle" });
  }, [rendererScopeKey]);
  const gas = useQuery({
    queryKey: ["creator-gas-balance", active.chainId, account.address],
    enabled: Boolean(
      deployment.status === "ready" && account.address && client,
    ),
    queryFn: () => client!.getBalance({ address: account.address! }),
  });
  const paymentTokens = useQuery({
    queryKey: [
      "creator-payment-tokens",
      deployment.status === "ready" ? deployment.chainId : undefined,
      deployment.status === "ready" ? deployment.factoryAddress : undefined,
      account.address,
    ],
    enabled: Boolean(deployment.status === "ready" && client),
    retry: false,
    queryFn: async () => {
      if (deployment.status !== "ready" || !client) {
        throw new Error("Payment tokens are unavailable on this network.");
      }
      return readAcceptedPaymentTokens(client, {
        chainId: deployment.chainId,
        factory: deployment.factoryAddress,
        wallet: account.address,
      });
    },
  });
  const acceptedPaymentTokens = useMemo(
    () =>
      paymentTokens.data?.status === "valid" ||
      paymentTokens.data?.status === "partial"
        ? paymentTokens.data.data
        : [],
    [paymentTokens.data],
  );
  const effectivePaymentTokenAddress =
    form.paymentToken ||
    acceptedPaymentTokens.find((token) => token.enabled)?.address ||
    "";
  const effectiveForm = useMemo(
    () =>
      form.paymentToken || !effectivePaymentTokenAddress
        ? form
        : { ...form, paymentToken: effectivePaymentTokenAddress },
    [effectivePaymentTokenAddress, form],
  );
  const selectedPaymentToken = acceptedPaymentTokens.find(
    (token) =>
      token.address.toLowerCase() ===
      effectivePaymentTokenAddress.toLowerCase(),
  );
  const switchChain = useSwitchChain();
  const contractArt = useMemo(
    () => ({ ...toContractArtConfig(art), engine: rendererEngine }),
    [art, rendererEngine],
  );
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
      protocol.data && account.address
        ? {
            chainId: protocol.data.chainId,
            factory: protocol.data.factory,
            creator: account.address,
            renderer: selectedRenderer?.address ?? protocol.data.renderer,
            mediaRegistry: protocol.data.mediaStoreFactory,
            abiVersion: studioDraftAbiVersion,
            rendererBoundsVersion: studioDraftRendererBoundsVersion,
          }
        : undefined,
    [account.address, protocol.data, selectedRenderer?.address],
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
      client && protocol.data && account.address && draftScopeReady,
    ),
    retry: false,
    queryFn: async () => {
      const page = await readCreatorMediaPage(client!, {
        protocolDependencies: protocol.data!,
        creator: account.address!,
        offset: mediaLibraryOffset,
      });
      if (!page) {
        throw new Error("Saved images could not be loaded.");
      }
      return page;
    },
  });
  const nativeLibrary = useMemo<NativeMediaLibraryModel | undefined>(() => {
    if (!currentCreatorScopeKey) return undefined;
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
            : "Saved images could not be loaded.",
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
      selectedStore:
        media.mode === "native" ? currentConfirmedMedia?.store : undefined,
      selectingStore: selectingNativeStore,
      message: notice?.message,
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
  const localImageSelected = media.mode === "native" && Boolean(candidate);
  const localImageNeedsStorage = Boolean(
    localImageSelected && !currentConfirmedMedia,
  );
  const publicationMedia = useMemo<TierMediaConfig | undefined>(() => {
    if (media.mode === "none") return emptyMediaConfig;
    return currentConfirmedMedia ?? candidateMedia;
  }, [candidateMedia, currentConfirmedMedia, media.mode]);
  const creative = useMemo(
    () =>
      tierSalt && publicationMedia && selectedRenderer
        ? {
            tierSalt,
            renderer: selectedRenderer.address,
            art: contractArt,
            media: publicationMedia,
          }
        : undefined,
    [contractArt, publicationMedia, selectedRenderer, tierSalt],
  );
  const result = useMemo(
    () =>
      evaluateCreatorForm(
        effectiveForm,
        account.address,
        creative,
        selectedPaymentToken,
      ),
    [account.address, creative, effectiveForm, selectedPaymentToken],
  );
  const guard = deploymentWriteGuard({
    deployment,
    walletChainId: account.isConnected ? account.chainId : undefined,
    expectedChainId: active.clientChainId,
  });
  const formValid = Boolean(result.config);
  const acknowledged = economicsAcknowledged && giftingAcknowledged;

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
              try {
                const identity = await client!.readContract({
                  address: dependencies.factory,
                  abi: membershipFactoryAbi,
                  functionName: "predictTierIdentity",
                  args: [creator, storedTierSalt],
                });
                const existingTier = await client!.readContract({
                  address: dependencies.factory,
                  abi: membershipFactoryAbi,
                  functionName: "tierForIdentity",
                  args: [identity],
                });
                return isSameAddress(existingTier, zeroAddress);
              } catch (cause) {
                throw new DraftValidationUnavailableError(cause);
              }
            },
            validateConfirmedStore: async (store) => {
              try {
                recoveredNative = await readConfirmedOnchainMedia(client!, {
                  protocolDependencies: dependencies,
                  creator,
                  store,
                });
                return Boolean(recoveredNative);
              } catch (cause) {
                throw new DraftValidationUnavailableError(cause);
              }
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
          setDraftNotice(undefined);
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
        if (error instanceof DraftValidationUnavailableError) {
          const message = `Saved draft could not be checked: ${error.message} Continuing without autosave for this renderer.`;
          setDraftNotice(message);
          setDraftAutosaveBypassKey(recoveryKey);
          setDraftReadyKey(recoveryKey);
          setDraftRecoveryBlock(undefined);
          return;
        }
        const message = `Saved draft could not be loaded: ${error instanceof Error ? error.message : "browser storage could not be read."}`;
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
          current?.startsWith("Autosave paused:")
            ? "Autosave resumed."
            : current,
        );
      } catch (error) {
        const message = `Autosave paused: ${error instanceof Error ? error.message : "browser storage is unavailable."}`;
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
        abi: membershipFactoryAbi,
        functionName: "predictTierIdentity",
        args: [identityCreator, tierSalt!],
      }),
  });

  const presentedNativeState: NativeMediaState =
    nativeState.status === "stored" && !currentConfirmedMedia
      ? candidate
        ? { status: "ready", candidate }
        : { status: "empty" }
      : nativeState;
  const previewMedia = useMemo(() => {
    if (media.mode === "none") return emptyMediaConfig;
    if (media.mode === "native") {
      if (currentConfirmedMedia) return currentConfirmedMedia;
      if (candidateMedia) return candidateMedia;
      return emptyMediaConfig;
    }
    return emptyMediaConfig;
  }, [candidateMedia, currentConfirmedMedia, media.mode]);
  const previewNativeMedia =
    media.mode === "native" && !currentConfirmedMedia && candidate
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
    renderer: selectedRenderer?.address,
    draft: previewDraft,
    selection,
    enabled: Boolean(previewDraft && selectedRenderer && draftScopeReady),
    blockedMessage: !protocol.data
      ? protocol.error
        ? "Artwork is unavailable on this network."
        : "Preparing artwork..."
      : !selectedRenderer
        ? "Enter a custom renderer contract address."
        : !draftScopeReady
          ? "Review the saved Art Studio draft first."
          : "Preparing artwork...",
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
      draftScopeReady,
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
      selectedRenderer?.address,
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
        nativeMedia: localImageNeedsStorage
          ? candidateHex?.renderer
          : undefined,
        tokenId: 7,
        state: "active",
        referenceTimestamp: BigInt(Math.floor(Date.now() / 1_000)),
      });
      const tokenURI = await client!.readContract({
        address: selectedRenderer!.address,
        abi: onchainMetadataRendererAbi,
        functionName: "previewTokenURI",
        args: [context],
      });
      return decodeRendererTokenURI(tokenURI);
    },
  });
  const activeDraftRecoveryBlock =
    draftRecoveryBlock?.key === draftScopeKey ? draftRecoveryBlock : undefined;

  const mediaStoreEnabled = Boolean(
    localImageNeedsStorage &&
    candidate &&
    candidatePayload &&
    candidateMedia &&
    !currentConfirmedMedia &&
    draftScopeReady &&
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
  const deployEnabled =
    formValid &&
    acknowledged &&
    Boolean(protocol.data) &&
    draftScopeReady &&
    guard.enabled &&
    (gas.data ?? 0n) > 0n &&
    (!localImageNeedsStorage || mediaStoreEnabled) &&
    !write.isPending &&
    !currentPendingTierVerification &&
    !isTransactionInFlight(transaction.phase) &&
    !isTransactionInFlight(mediaTransaction.phase);
  const publishEnabled = deployEnabled && Boolean(reviewToken.data);
  const imageQueueComplete =
    localImageSelected && Boolean(currentConfirmedMedia);
  const imageQueueStatus = imageQueueComplete
    ? "Complete"
    : publicationStepStatus(mediaTransaction.phase);
  const membershipQueueStatus = publicationStepStatus(
    transaction.phase,
    localImageNeedsStorage && mediaTransaction.phase !== "confirmed",
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

  function handleRendererAddressChange(value: string) {
    const generation = ++rendererResolutionGeneration.current;
    setRendererAddress(value);
    setRendererResolution(undefined);
    setRendererEngine(0);
    setRendererCustomState({ status: "idle" });
    resetCompletion();

    const address = value.trim();
    if (!address) return;
    if (address.length !== 42) {
      if (address.length > 42) {
        setRendererCustomState({
          status: "error",
          message: "Enter a valid renderer address.",
        });
      }
      return;
    }
    if (!client || deployment.status !== "ready") {
      setRendererCustomState({
        status: "error",
        message: "The renderer network is unavailable.",
      });
      return;
    }
    if (deployment.chainId !== 46_630 && deployment.chainId !== 31_337) {
      setRendererCustomState({
        status: "error",
        message: "Custom renderers are not available on this network.",
      });
      return;
    }
    setRendererCustomState({ status: "loading" });
    void resolveRendererAddress(client, {
      address,
      canonicalChainId: deployment.chainId,
      expectedSchema: membershipRendererSchema,
    })
      .then((resolution) => {
        if (rendererResolutionGeneration.current !== generation) return;
        setRendererResolution(resolution);
        setRendererEngine(0);
        setRendererCustomState({
          status: "ready",
          rendererName: resolution.name,
        });
      })
      .catch((error: unknown) => {
        if (rendererResolutionGeneration.current !== generation) return;
        setRendererCustomState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "That renderer could not be loaded.",
        });
      });
  }

  function handleRendererChoiceChange(choice: RendererChoice) {
    rendererResolutionGeneration.current += 1;
    setRendererChoice(choice);
    setRendererEngine(0);
    if (choice === "custom" && rendererAddress.trim().length === 42) {
      handleRendererAddressChange(rendererAddress);
    } else if (choice === "custom") {
      setRendererResolution(undefined);
    }
    resetCompletion();
  }

  function handleCreatedRendererChange(renderer: StudioRenderer) {
    rendererResolutionGeneration.current += 1;
    setRendererResolution(renderer);
    setRendererCustomState({ status: "idle" });
    setRendererEngine(0);
    resetCompletion();
  }

  function handleRendererEngineChange(engine: number) {
    setRendererEngine(engine);
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
      setDraftNotice("Retrying autosave...");
      setDraftRecoveryRevision((current) => current + 1);
      return;
    }
    setDraftRecoveryBlock(undefined);
    setDraftNotice("Checking the saved draft...");
    setDraftRecoveryRevision((current) => current + 1);
  }

  function retryStudioIdentity() {
    const next = createInitialStudioSession();
    if (!next.tierSalt) {
      setDraftNotice(
        "The browser still could not prepare the collection. Try again.",
      );
      return;
    }
    setTierSalt(next.tierSalt);
    setArt(next.art);
    setDraftNotice("A new collection is ready.");
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
        "The browser could not prepare the collection. Try again before publishing.",
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
    setConfirmedMedia(undefined);
    setConfirmedMediaScope(undefined);
    setNativeState({ status: "empty" });
    setDraftAutosaveBypassKey(draftScopeKey);
    setDraftReadyKey(draftScopeKey);
    setDraftRecoveryBlock(undefined);
    setDraftNotice("Autosave is off. Reloading will lose this draft.");
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
        "The browser could not prepare a new collection. Reload before publishing.",
      );
    }
    setMedia({ mode: "none" });
    setConfirmedMedia(undefined);
    setConfirmedMediaScope(undefined);
    setNativeState({ status: "empty" });
    setDraftRecoveryBlock(undefined);
    setDraftReadyKey(draftScopeKey);
    setDraftNotice((current) =>
      current?.startsWith("The browser could not prepare")
        ? current
        : "The saved draft was removed. A new direction is ready.",
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
    dispatchMedia({ type: "RESET" });
    setNativeState({
      status: "processing",
      message: "Preparing image...",
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
          message: "That stored image is unavailable for this membership.",
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
      dispatchMedia({ type: "RESET" });
      setMediaLibraryNotice(undefined);
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

  async function verifyStoredMedia(
    attempt: MediaVerificationAttempt,
  ): Promise<ConfirmedOnchainMedia | undefined> {
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
      }
      void creatorMediaLibrary.refetch();
      return stored;
    } finally {
      mediaVerificationInFlight.current = false;
    }
  }

  async function storeNativeMediaOnce(): Promise<
    ConfirmedOnchainMedia | undefined
  > {
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
        confirmations: publicationConfirmations,
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
          error: "The wallet cancelled image storage.",
        });
        return;
      }
      if (!isSuccessfulWriteReceipt(receipt)) {
        scopedDispatch({
          type: "REVERTED",
          error: "The image could not be stored.",
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
      return await verifyStoredMedia(attempt);
    } catch (error) {
      scopedDispatch({
        type: waitingForReceipt ? "UNCERTAIN" : "FAILED",
        error: decodeTransactionError(error),
      });
      return undefined;
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
        draftCleanupWarning = " Your browser could not clear the saved draft.";
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
        `The membership was published with the terms you reviewed.${draftCleanupWarning}`,
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
      !publicationMedia ||
      !client ||
      !account.address ||
      !protocol.data ||
      !selectedRenderer ||
      !tierSalt ||
      !currentCreatorScope ||
      !draftScope ||
      !draftScopeKey
    ) {
      return;
    }
    const creator = account.address;
    const dependencies = protocol.data;
    const factory = dependencies.factory;
    const scope = currentCreatorScope;
    const selectionGeneration = mediaSelectionGeneration.current;
    let mediaForPublication = publicationMedia;

    if (localImageNeedsStorage) {
      const stored = await storeNativeMediaOnce();
      if (
        !stored ||
        selectionGeneration !== mediaSelectionGeneration.current ||
        !sameCreatorProtocolScope(currentCreatorScopeRef.current, scope)
      ) {
        return;
      }
      mediaForPublication = stored;
    }

    const scopedDispatch: typeof dispatch = (event) => {
      if (sameCreatorProtocolScope(currentCreatorScopeRef.current, scope)) {
        dispatch(event);
      }
    };

    setConfirmationNote(undefined);

    let waitingForReceipt = false;
    try {
      scopedDispatch({ type: "SIMULATE" });
      const refreshedTokens = await readAcceptedPaymentTokens(client, {
        chainId: dependencies.chainId,
        factory,
        wallet: creator,
      });
      if (
        refreshedTokens.status === "rate-limited" ||
        refreshedTokens.status === "unavailable"
      ) {
        throw new Error(refreshedTokens.label);
      }
      const refreshedPaymentToken = refreshedTokens.data.find(
        (token) =>
          token.address.toLowerCase() ===
          effectivePaymentTokenAddress.toLowerCase(),
      );
      const publicationResult = evaluateCreatorForm(
        effectiveForm,
        creator,
        {
          tierSalt,
          renderer: selectedRenderer.address,
          art: contractArt,
          media: mediaForPublication,
        },
        refreshedPaymentToken,
      );
      if (!publicationResult.config) {
        throw new Error(
          publicationResult.errors.paymentToken ??
            publicationResult.errors.displayedPrice ??
            "Review the membership terms before publishing.",
        );
      }
      const config = publicationResult.config;
      const { request } = await simulateContract(wagmiConfig, {
        account: creator,
        chainId: dependencies.chainId,
        address: factory,
        abi: membershipFactoryAbi,
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
        confirmations: publicationConfirmations,
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
          error: "The wallet cancelled publishing.",
        });
        return;
      }
      if (!isSuccessfulWriteReceipt(receipt)) {
        scopedDispatch({
          type: "REVERTED",
          error: "The membership could not be published.",
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
      className={
        step === "art"
          ? "creator-workspace creator-workspace-studio"
          : "creator-workspace"
      }
    >
      <aside className="creator-steps" aria-label="Creator setup steps">
        <p className="creator-steps-title">Create membership</p>
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
          Your progress stays here if the wallet reconnects.
        </p>
      </aside>

      <section className="creator-stage" aria-labelledby={`step-${step}`}>
        {step === "metadata" && (
          <div className="creator-step-panel">
            <h2 id="step-metadata">Name the membership</h2>
            <p>
              Choose the permanent name and symbol. You can edit the description
              and website later.
            </p>
            <div className="creator-field-grid">
              <Field
                error={touchedFields.name ? result.errors.name : undefined}
                hint="Permanent. Keep it short."
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
                hint="Permanent. A short label like FANS."
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
              hint="You can change this later."
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
              hint="You can change this later."
              id="tier-website"
              label="Website"
            >
              <input
                aria-describedby="tier-website-hint tier-website-error"
                id="tier-website"
                onChange={update("externalURI")}
                placeholder="https://..."
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
              createdRenderers={createdRenderers.data ?? []}
              customRendererAddress={rendererAddress}
              customRendererState={rendererCustomState}
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
              onCustomRendererAddressChange={handleRendererAddressChange}
              onCreatedRendererChange={handleCreatedRendererChange}
              onEngineChange={handleRendererEngineChange}
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
              onRendererChoiceChange={handleRendererChoiceChange}
              onRetryNativeLibrary={() => void creatorMediaLibrary.refetch()}
              onRetryPreview={contractPreviews.retryFocused}
              onSelectNativeStore={(store) => void selectNativeStore(store)}
              onSelectionChange={setSelection}
              preview={contractPreviews.model}
              renderer={selectedRenderer}
              rendererChoice={rendererChoice}
              selectedEngine={rendererEngine}
              selection={selection}
              styleEngines={
                originalRenderer?.engines ?? canonicalArtEngineManifestNames
              }
            />

            {!tierSalt && (
              <section className="studio-commit-panel" role="alert">
                <div>
                  <h2>Couldn&apos;t prepare this collection.</h2>
                  <p>Try again before publishing.</p>
                </div>
                <button
                  className="button button-dark"
                  onClick={retryStudioIdentity}
                  type="button"
                >
                  Try again
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
                  <h2>Saved draft needs attention.</h2>
                  <p>{activeDraftRecoveryBlock.message}</p>
                </div>
                <div className="studio-commit-action">
                  <button
                    className="button button-dark"
                    onClick={retryDraftRecovery}
                    type="button"
                  >
                    Try again
                  </button>
                  {activeDraftRecoveryBlock.reason === "storage" ? (
                    <button
                      className="button button-outline"
                      onClick={continueWithoutDraftAutosave}
                      type="button"
                    >
                      Continue without autosave
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
          </div>
        )}

        {step === "price" && (
          <div className="creator-step-panel">
            <h2 id="step-price">Set price and renewal</h2>
            <p>Price and period are permanent. Supporters renew manually.</p>
            <PaymentTokenPicker
              onRetry={() => void paymentTokens.refetch()}
              onSelect={(address) => {
                setForm((current) => ({
                  ...current,
                  paymentToken: address,
                }));
                resetCompletion();
              }}
              selected={selectedPaymentToken?.address}
              state={paymentTokens.data}
            />
            {result.errors.paymentToken ? (
              <p className="field-error" role="alert">
                {result.errors.paymentToken}
              </p>
            ) : null}
            <div className="creator-field-grid">
              <Field
                error={result.errors.displayedPrice}
                hint="Permanent. Enter 0 to let supporters choose the amount."
                id="tier-price"
                label={`Price per period${selectedPaymentToken ? ` (${selectedPaymentToken.symbol})` : ""}`}
              >
                <input
                  aria-describedby="tier-price-hint tier-price-error"
                  id="tier-price"
                  inputMode="decimal"
                  min="0"
                  onChange={update("displayedPrice")}
                  value={form.displayedPrice}
                />
              </Field>
              <Field
                error={result.errors.periodDays}
                hint="Permanent. Whole days."
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
            <h2 id="step-splits">Split each payment</h2>
            <p>
              Rewards are not equity, yield, dividends, or a promised return.
            </p>
            <div className="creator-field-grid">
              <Field
                error={result.errors.rewardPercent}
                hint="Permanent."
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
                hint="Permanent. Unused referral share goes to you."
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
                  <p>One payment</p>
                  <strong>
                    {formattedPayment(result.split.gross, selectedPaymentToken)}
                  </strong>
                </div>
                <dl>
                  <div>
                    <dt>Platform fee</dt>
                    <dd>
                      {formattedPayment(
                        result.split.protocol,
                        selectedPaymentToken,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Membership rewards</dt>
                    <dd>
                      {formattedPayment(
                        result.split.reward,
                        selectedPaymentToken,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Referral</dt>
                    <dd>
                      {formattedPayment(
                        result.split.referral,
                        selectedPaymentToken,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Creator with referral</dt>
                    <dd>
                      {formattedPayment(
                        result.split.creatorReferred,
                        selectedPaymentToken,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Creator without referral</dt>
                    <dd>
                      {formattedPayment(
                        result.split.creatorUnreferred,
                        selectedPaymentToken,
                      )}
                    </dd>
                  </div>
                </dl>
              </div>
            )}
          </div>
        )}

        {step === "limits" && (
          <div className="creator-step-panel">
            <h2 id="step-limits">Set capacity</h2>
            <p>You can change these later. Zero means no limit.</p>
            <div className="creator-field-grid">
              <Field
                error={result.errors.supplyCap}
                hint="Changeable. Zero means no limit."
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
                hint="Changeable. Twelve periods is about one year."
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
            <h2 id="step-risks">Review the permanent terms</h2>
            <ul className="risk-list">
              {result.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
              <li>
                A gift can create a membership and reward shares for someone who
                did not ask for it.
              </li>
              <li>
                A failed refund can hold a place until the membership expires.
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
                I understand the price, period, reward rate, referral rate,
                payment currency, and 1% platform fee are permanent.
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
                I understand gifts can hold capacity and may not be immediately
                refundable.
              </span>
            </label>
          </div>
        )}

        {step === "review" && (
          <div className="creator-step-panel">
            <h2 id="step-review">Review before publishing</h2>
            <div className="terms-review">
              <section>
                <h3>Permanent</h3>
                <dl>
                  <div>
                    <dt>Name / symbol</dt>
                    <dd>
                      {form.name || "Not set"} / {form.symbol || "Not set"}
                    </dd>
                  </div>
                  <div>
                    <dt>Price / period</dt>
                    <dd>
                      {form.displayedPrice || "Not set"}{" "}
                      {selectedPaymentToken?.symbol ?? "token"} /{" "}
                      {form.periodDays || "Not set"} days
                    </dd>
                  </div>
                  <div>
                    <dt>Payment token</dt>
                    <dd>
                      {selectedPaymentToken
                        ? `${selectedPaymentToken.name} (${selectedPaymentToken.symbol})`
                        : "Not set"}
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
                <h3>Changeable later</h3>
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
                    <dt>After launch</dt>
                    <dd>
                      Pause, description, website, grants, refunds, and
                      ownership
                    </dd>
                  </div>
                </dl>
              </section>
            </div>

            <section
              aria-labelledby="final-art-review-heading"
              className="final-art-review"
            >
              <div className="final-art-copy">
                <h3 id="final-art-review-heading">Final artwork</h3>
                <p>This is the artwork supporters will see.</p>
                <dl>
                  <div>
                    <dt>Artwork collection</dt>
                    <dd>
                      {selectedRenderer
                        ? selectedRenderer.name
                        : "Choose an artwork collection"}
                    </dd>
                  </div>
                  <div>
                    <dt>Style</dt>
                    <dd>{art.engine.toUpperCase()}</dd>
                  </div>
                  <div>
                    <dt>Image</dt>
                    <dd>
                      {media.mode === "none"
                        ? "Generated artwork"
                        : localImageSelected
                          ? "New image"
                          : "Saved image"}
                    </dd>
                  </div>
                </dl>
                <details className="technical-details">
                  <summary>Technical details</summary>
                  <dl>
                    <div>
                      <dt>Payment token</dt>
                      <dd>
                        <code>
                          {selectedPaymentToken?.address ?? "Not set"}
                        </code>
                      </dd>
                    </div>
                    <div>
                      <dt>Raw price per period</dt>
                      <dd>
                        <code>
                          {result.config?.pricePerPeriod.toString() ??
                            "Not set"}
                        </code>
                      </dd>
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
                      <dt>Membership identity</dt>
                      <dd>
                        <code>{tierIdentity.data ?? "Connect wallet"}</code>
                      </dd>
                    </div>
                    {currentConfirmedMedia ? (
                      <div>
                        <dt>Image storage</dt>
                        <dd>
                          <code>{currentConfirmedMedia.store}</code>
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                </details>
              </div>
              <div className="final-art-frame">
                {reviewToken.data ? (
                  // The renderer's exact data URI must bypass image optimization.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt={`${reviewToken.data.metadata.name} membership artwork`}
                    src={svgPreviewDataURI(reviewToken.data.svg)}
                  />
                ) : reviewToken.isFetching ? (
                  <p role="status">Preparing final artwork...</p>
                ) : reviewToken.error ? (
                  <p role="alert">
                    Could not load the final artwork. Return to Art Studio or
                    try again.
                  </p>
                ) : (
                  <p>Finish the Art Studio and connect your wallet.</p>
                )}
              </div>
            </section>

            <div className="wallet-review">
              <div>
                <p className="creator-steps-title">Wallet</p>
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
              <WalletReadiness paymentToken={selectedPaymentToken} />
            </div>

            <section
              aria-labelledby="publication-queue-heading"
              className="publication-queue"
            >
              <div>
                <p className="creator-steps-title">Transactions</p>
                <h3 id="publication-queue-heading">Publish queue</h3>
              </div>
              <ol>
                {localImageSelected ? (
                  <li data-status={imageQueueStatus}>
                    <span aria-hidden="true">1</span>
                    <div>
                      <strong>Store image</strong>
                      <small>Public and permanent</small>
                    </div>
                    <em>{imageQueueStatus}</em>
                  </li>
                ) : null}
                <li data-status={membershipQueueStatus}>
                  <span aria-hidden="true">
                    {localImageSelected ? "2" : "1"}
                  </span>
                  <div>
                    <strong>Create membership</strong>
                  </div>
                  <em>{membershipQueueStatus}</em>
                </li>
              </ol>
            </section>

            {mediaGasQuote.error && localImageNeedsStorage ? (
              <p className="inline-status" role="alert">
                Image storage could not be prepared. Try again.
              </p>
            ) : null}

            {currentPendingMediaVerification && (
              <section className="studio-commit-panel" role="status">
                <div>
                  <h2>Finish checking the image</h2>
                  <p>
                    The image was stored. This check will not create another
                    transaction.
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
                  Check again
                </button>
              </section>
            )}

            {!formValid && (
              <p className="inline-status" role="alert">
                Finish the highlighted fields before publishing.
              </p>
            )}
            {result.creativeError && (
              <p className="inline-status" role="alert">
                {result.creativeError}
              </p>
            )}
            {reviewToken.isFetching && (
              <p className="inline-status" role="status">
                Preparing final artwork.
              </p>
            )}
            {!acknowledged && (
              <p className="inline-status" role="status">
                Review both acknowledgements.
              </p>
            )}
            {!guard.enabled && (
              <p className="inline-status" role="status">
                Publishing unavailable: {guard.reason}
              </p>
            )}
            {currentPendingTierVerification && (
              <section className="studio-commit-panel" role="status">
                <div>
                  <h2>Finish checking the membership</h2>
                  <p>
                    The membership was published. This retries the final check
                    and will not publish again.
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
                  Check again
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
            {localImageSelected &&
            mediaTransaction.phase !== "idle" &&
            mediaTransaction.phase !== "confirmed" ? (
              <TransactionFlow
                onRetry={() => void deploy()}
                state={mediaTransaction}
              />
            ) : null}
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
