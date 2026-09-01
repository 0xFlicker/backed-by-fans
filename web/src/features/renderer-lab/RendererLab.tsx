"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import {
  bytesToHex,
  createPublicClient,
  http,
  zeroAddress,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { robinhoodTestnet } from "viem/chains";
import {
  useAccount,
  useConfig,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { simulateContract } from "@wagmi/core";

import { WalletControl } from "@/components/WalletControl";
import {
  defaultJpegQuality,
  defaultOutputDimension,
  jpegQualityBounds,
  outputDimensions,
  processImageSource,
  type OutputDimension,
  type SupportedImageMIME,
} from "@/features/creator-studio/image-processing";
import {
  creatorMediaBlob,
  creatorMediaDataUrl,
  creatorMediaMime,
} from "@/features/creator-studio/media-preview";
import {
  approveRendererCandidate,
  isRendererReviewCurrent,
  rejectRendererCandidate,
  type RendererReviewDecision,
} from "@/features/renderer-lab/approval";
import {
  createRendererLabCandidateState,
  replaceRendererCandidate,
  replaceRendererPreviewRequests,
  replaceRendererPreviewResults,
  type RendererCandidateInput,
  type RendererLabCandidateState,
  type RendererPreviewRequest,
  type RendererPreviewResultInput,
} from "@/features/renderer-lab/candidate";
import {
  prepareRendererDeployment,
  rendererAddressFromDeploymentLogs,
  type PreparedRendererDeployment,
} from "@/features/renderer-lab/deployment";
import {
  HelperConnectionError,
  parseRendererHelperFragment,
  RendererHelperClient,
  type RendererHelperConnection,
} from "@/features/renderer-lab/local-helper-client";
import {
  canonicalRendererPackageChainId,
  computeRendererArtifactFingerprint,
  maxRendererInitcodeBytes,
  maxRendererRuntimeBytes,
  parseRendererPackage,
  type ParsedRendererPackage,
} from "@/features/renderer-lab/package-import";
import { onchainMediaStoreFactoryAbi, rendererRegistryAbi } from "@/contracts";
import type { ProtocolDependencySnapshot } from "@/contracts/types";
import { previewRendererRequest } from "@/features/renderer-lab/preview";
import { readProtocolDependencies } from "@/features/protocol/protocol-read";
import {
  creatorMediaPageSize,
  readCreatorMediaPage,
  reconcileStoredMedia,
  type CreatorMediaRecord,
} from "@/features/protocol/registry-reconciliation";
import { isSuccessfulWriteReceipt } from "@/features/protocol/write-reconciliation";
import { getDeployment, publicConfig } from "@/lib/config";

import styles from "./RendererLab.module.css";

type RendererHelperPort = Pick<
  RendererHelperClient,
  | "connect"
  | "getCandidate"
  | "getExampleRequests"
  | "getSourceImage"
  | "submitExampleResults"
>;

type CreatorMediaLoader = (
  client: PublicClient,
  creator: Address,
) => Promise<readonly CreatorMediaRecord[]>;

export type RendererLabProps = {
  client?: PublicClient;
  previewHarness?: Address;
  helperClientFactory?: (
    connection: RendererHelperConnection,
  ) => RendererHelperPort;
  creatorMediaLoader?: CreatorMediaLoader;
};

type ImportDetails = {
  rendererName: string;
  source: "file" | "helper";
  fileName?: string;
};

type HelperBinding = {
  client: RendererHelperPort;
  candidateFingerprint: string;
  requestSetFingerprint: string;
};

type PreviewPhase = "idle" | "running" | "complete";
type ImagePhase = "idle" | "processing" | "ready" | "error";

type RendererImageSource = {
  blob: Blob;
  mime: SupportedImageMIME;
  name: string;
};

type RendererImageSettings = {
  dimension: OutputDimension;
  focalX: number;
  focalY: number;
  jpegQuality: number;
  mime: SupportedImageMIME;
};

type PreparedImageDeployment = {
  creator: Address;
  dependencies: ProtocolDependencySnapshot;
  mime: 1 | 2;
  payload: Hex;
};

const defaultRendererImageSettings: RendererImageSettings = {
  dimension: defaultOutputDimension,
  focalX: 50,
  focalY: 50,
  jpegQuality: defaultJpegQuality,
  mime: "image/jpeg",
};

const canonicalPublicClient = createPublicClient({
  chain: robinhoodTestnet,
  transport: http(),
}) as PublicClient;
const configuredDeployment = getDeployment(
  publicConfig,
  canonicalRendererPackageChainId,
);
const configuredPreviewHarness =
  configuredDeployment.status === "ready"
    ? configuredDeployment.previewHarnessAddress
    : undefined;
const configuredRendererRegistry =
  configuredDeployment.status === "ready"
    ? configuredDeployment.rendererRegistryAddress
    : undefined;
const rendererDeploymentConfirmations = 3;

function defaultHelperClientFactory(connection: RendererHelperConnection) {
  return new RendererHelperClient(connection);
}

async function defaultCreatorMediaLoader(
  client: PublicClient,
  creator: Address,
) {
  const dependencies = await readProtocolDependencies(
    client,
    configuredDeployment,
  );
  if (dependencies.status !== "valid") {
    throw new Error(dependencies.label);
  }
  const page = await readCreatorMediaPage(client, {
    protocolDependencies: dependencies.data,
    creator,
    offset: 0n,
    limit: creatorMediaPageSize,
  });
  if (!page) throw new Error("Saved images could not be read from chain.");
  return page.records;
}

function byteLength(value: Hex): number {
  return (value.length - 2) / 2;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredRecord(value: unknown, label: string) {
  if (!isRecord(value)) throw new Error(`${label} is missing or invalid.`);
  return value;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is missing or invalid.`);
  }
  return value;
}

function requiredNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`${label} is missing or invalid.`);
  }
  return value;
}

function requiredHex(value: unknown, label: string): Hex {
  const hex = requiredString(value, label);
  if (!/^0x(?:[0-9a-fA-F]{2})*$/.test(hex)) {
    throw new Error(`${label} is missing or invalid.`);
  }
  return hex as Hex;
}

function candidateFromPackage(
  parsed: ParsedRendererPackage,
  candidateId: string,
): RendererCandidateInput {
  return {
    candidateId,
    chainId: parsed.deployment.chainId,
    artifactFingerprint: parsed.artifacts.artifactFingerprint,
    interfaceSchema: parsed.interfaceSchema,
    creationBytecode: parsed.artifacts.creationBytecode,
    runtimeBytecode: parsed.artifacts.runtimeBytecode,
    initCodeByteLength: parsed.deployment.initCodeByteLength,
  };
}

function requestsFromPackage(
  parsed: ParsedRendererPackage,
): RendererPreviewRequest[] {
  return parsed.examples.map((example) => ({
    requestId: example.requestId,
    mode: "undeployed-initcode",
    method: example.method,
    contextWithoutMedia: example.contextWithoutMedia,
    localImageSlot: example.localImageSlot,
  }));
}

function helperCandidateInput(value: unknown): {
  candidate: RendererCandidateInput;
  rendererName: string;
  artifactFingerprint: Hex;
} {
  const raw = requiredRecord(value, "Local helper candidate");
  const manifest = requiredRecord(raw.manifest, "Candidate manifest");
  const artifacts = requiredRecord(manifest.artifacts, "Candidate artifacts");
  const deployment = requiredRecord(
    manifest.deployment,
    "Candidate deployment",
  );
  const compiler = requiredRecord(manifest.compiler, "Compiler profile");
  const creationBytecode = requiredHex(
    raw.creationBytecode,
    "Creation bytecode",
  );
  const runtimeBytecode = requiredHex(raw.runtimeBytecode, "Runtime bytecode");
  const artifactFingerprint = requiredHex(
    raw.artifactFingerprint,
    "Artifact fingerprint",
  );
  const interfaceSchema = requiredHex(
    manifest.interfaceSchema,
    "Renderer interface schema",
  );
  const chainId = requiredNumber(deployment.chainId, "Canonical chain");
  const initCodeByteLength = requiredNumber(
    deployment.initCodeByteLength,
    "Initcode byte length",
  );
  const compilerProfile = {
    solidity: requiredString(compiler.solidity, "Solidity version"),
    evmVersion: requiredString(compiler.evmVersion, "EVM version"),
    optimizerEnabled: compiler.optimizerEnabled,
    optimizerRuns: requiredNumber(compiler.optimizerRuns, "Optimizer runs"),
  };

  if (
    compilerProfile.solidity !== "0.8.36" ||
    compilerProfile.evmVersion !== "cancun" ||
    compilerProfile.optimizerEnabled !== true
  ) {
    throw new Error(
      "The local helper candidate uses an unsupported compiler profile.",
    );
  }
  if (chainId !== canonicalRendererPackageChainId) {
    throw new Error(
      "The local helper candidate does not target the canonical chain.",
    );
  }
  if (
    byteLength(creationBytecode) > maxRendererInitcodeBytes ||
    byteLength(runtimeBytecode) > maxRendererRuntimeBytes
  ) {
    throw new Error(
      "The local helper candidate exceeds the renderer byte limits.",
    );
  }

  const recomputedArtifactFingerprint = computeRendererArtifactFingerprint({
    creationBytecode,
    runtimeBytecode,
    compiler: {
      solidity: compilerProfile.solidity,
      evmVersion: compilerProfile.evmVersion,
      optimizerEnabled: compilerProfile.optimizerEnabled,
      optimizerRuns: compilerProfile.optimizerRuns,
    },
    interfaceSchema,
  });
  const manifestFingerprint = requiredHex(
    artifacts.artifactFingerprint,
    "Manifest artifact fingerprint",
  );
  if (
    artifactFingerprint.toLowerCase() !==
      recomputedArtifactFingerprint.toLowerCase() ||
    manifestFingerprint.toLowerCase() !==
      recomputedArtifactFingerprint.toLowerCase() ||
    initCodeByteLength !== byteLength(creationBytecode)
  ) {
    throw new Error(
      "The local helper candidate failed browser-side integrity checks.",
    );
  }

  return {
    candidate: {
      candidateId: requiredString(raw.candidateId, "Candidate ID"),
      chainId,
      artifactFingerprint,
      interfaceSchema,
      creationBytecode,
      runtimeBytecode,
      initCodeByteLength,
    },
    rendererName: requiredString(manifest.rendererName, "Renderer name"),
    artifactFingerprint,
  };
}

function helperRequestInputs(value: unknown): {
  candidateFingerprint: string;
  requestSetFingerprint: string;
  requests: RendererPreviewRequest[];
} {
  const raw = requiredRecord(value, "Local helper request set");
  const candidateFingerprint = requiredString(
    raw.candidateFingerprint,
    "Helper candidate fingerprint",
  );
  const requestSetFingerprint = requiredString(
    raw.requestSetFingerprint,
    "Helper request fingerprint",
  );
  if (!Array.isArray(raw.requests) || raw.requests.length < 6) {
    throw new Error("The local helper must provide at least six examples.");
  }
  const requests = raw.requests.map((value, index): RendererPreviewRequest => {
    const request = requiredRecord(value, `Example ${index + 1}`);
    const mode = requiredString(request.mode, `Example ${index + 1} mode`);
    const method = requiredString(
      request.method,
      `Example ${index + 1} method`,
    );
    if (mode !== "deployed-address" && mode !== "undeployed-initcode") {
      throw new Error(`Example ${index + 1} has an invalid preview mode.`);
    }
    if (method !== "previewSVG" && method !== "previewTokenURI") {
      throw new Error(`Example ${index + 1} has an invalid preview method.`);
    }
    if (typeof request.localImageSlot !== "boolean") {
      throw new Error(`Example ${index + 1} has an invalid image slot.`);
    }
    return {
      requestId: requiredString(request.requestId, `Example ${index + 1} ID`),
      mode,
      method,
      contextWithoutMedia: requiredRecord(
        request.contextWithoutMedia,
        `Example ${index + 1} context`,
      ),
      localImageSlot: request.localImageSlot,
    };
  });
  return { candidateFingerprint, requestSetFingerprint, requests };
}

function stateWithCandidateAndRequests(
  candidate: RendererCandidateInput,
  requests: readonly RendererPreviewRequest[],
): RendererLabCandidateState {
  const candidateState = replaceRendererCandidate(
    createRendererLabCandidateState(),
    candidate,
  );
  return replaceRendererPreviewRequests(
    candidateState,
    candidateState.candidate!.candidateFingerprint,
    requests,
  );
}

function svgDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function shortHex(value: string) {
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

function byteEstimate(byteLength: number) {
  if (byteLength < 1_024) return `${byteLength.toLocaleString()} bytes`;
  return `${byteLength.toLocaleString()} bytes (${(byteLength / 1_024).toFixed(1)} KB)`;
}

function CopyableAddress({
  address,
  copied,
  label,
  onCopy,
}: {
  address: Address;
  copied: boolean;
  label: string;
  onCopy: (address: Address) => void;
}) {
  return (
    <button
      aria-label={`Copy ${label} ${address}`}
      className={styles.copyAddress}
      onClick={() => onCopy(address)}
      title={`Copy ${address}`}
      type="button"
    >
      <span className="font-mono">{address}</span>
      <strong>{copied ? "Copied" : "Copy"}</strong>
    </button>
  );
}

function requestLabel(request: RendererPreviewRequest, index: number) {
  const tokenId = request.contextWithoutMedia.tokenId;
  const state = request.contextWithoutMedia.state;
  const tokenLabel =
    typeof tokenId === "number" || typeof tokenId === "string"
      ? `Token ${tokenId}`
      : `Example ${index + 1}`;
  const stateLabel = typeof state === "string" ? `, ${state}` : "";
  return `${tokenLabel}${stateLabel}`;
}

function membershipNameFromRequests(
  requests: readonly RendererPreviewRequest[],
  rendererName: string,
) {
  for (const request of requests) {
    const token = request.contextWithoutMedia.token;
    if (isRecord(token) && typeof token.tierName === "string") {
      const membershipName = token.tierName.trim();
      if (membershipName) return membershipName;
    }
  }
  return `${rendererName.replace(/\s+renderer$/i, "").trim()} Membership`;
}

function requestsWithMembershipName(
  requests: readonly RendererPreviewRequest[],
  membershipName: string,
): RendererPreviewRequest[] {
  return requests.map((request) => ({
    ...request,
    contextWithoutMedia: {
      ...request.contextWithoutMedia,
      token: {
        ...(isRecord(request.contextWithoutMedia.token)
          ? request.contextWithoutMedia.token
          : {}),
        tierName: membershipName,
      },
    },
  }));
}

export function RendererLab({
  client = canonicalPublicClient,
  previewHarness = configuredPreviewHarness,
  helperClientFactory = defaultHelperClientFactory,
  creatorMediaLoader = defaultCreatorMediaLoader,
}: RendererLabProps) {
  const packageInputId = useId();
  const imageInputId = useId();
  const packageInputRef = useRef<HTMLInputElement>(null);
  const [candidateState, setCandidateState] = useState(
    createRendererLabCandidateState,
  );
  const [importDetails, setImportDetails] = useState<ImportDetails | null>(
    null,
  );
  const [helperBinding, setHelperBinding] = useState<HelperBinding | null>(
    null,
  );
  const [helperStatus, setHelperStatus] = useState<string | null>(null);
  const [imageSource, setImageSource] = useState<RendererImageSource | null>(
    null,
  );
  const [imageSettings, setImageSettings] = useState<RendererImageSettings>(
    defaultRendererImageSettings,
  );
  const [imagePhase, setImagePhase] = useState<ImagePhase>("idle");
  const [imageError, setImageError] = useState<string | null>(null);
  const [localImage, setLocalImage] = useState<{
    name: string;
    bytes: Hex;
    byteLength: number;
    dimension: OutputDimension;
    mime: 1 | 2;
    previewUrl: string;
  } | null>(null);
  const [savedMedia, setSavedMedia] = useState<{
    status: "idle" | "loading" | "ready" | "error";
    records: readonly CreatorMediaRecord[];
    message?: string;
  }>({ status: "idle", records: [] });
  const [previewPhase, setPreviewPhase] = useState<PreviewPhase>("idle");
  const [previewMembershipName, setPreviewMembershipName] = useState("");
  const [review, setReview] = useState<RendererReviewDecision | null>(null);
  const [preparedDeployment, setPreparedDeployment] =
    useState<PreparedRendererDeployment | null>(null);
  const [preparedImageDeployment, setPreparedImageDeployment] =
    useState<PreparedImageDeployment | null>(null);
  const [deployedAddress, setDeployedAddress] = useState<Address | null>(null);
  const [deployedImageAddress, setDeployedImageAddress] =
    useState<Address | null>(null);
  const [copiedAddress, setCopiedAddress] = useState<Address | null>(null);
  const [rendererDeploymentError, setRendererDeploymentError] = useState<
    string | null
  >(null);
  const [imageDeploymentError, setImageDeploymentError] = useState<
    string | null
  >(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const account = useAccount();
  const wagmiConfig = useConfig();
  const switchChain = useSwitchChain();
  const rendererWrite = useWriteContract();
  const imageWrite = useWriteContract();
  const deploymentReceipt = useWaitForTransactionReceipt({
    chainId: canonicalRendererPackageChainId,
    confirmations: rendererDeploymentConfirmations,
    hash: rendererWrite.data,
    query: { enabled: Boolean(rendererWrite.data) },
  });
  const imageDeploymentReceipt = useWaitForTransactionReceipt({
    chainId: canonicalRendererPackageChainId,
    confirmations: rendererDeploymentConfirmations,
    hash: imageWrite.data,
    query: { enabled: Boolean(imageWrite.data) },
  });
  const results = candidateState.resultSet?.results ?? [];
  const requests = candidateState.requestSet?.requests ?? [];
  const hasImageSlots = requests.some((request) => request.localImageSlot);

  const resetDecision = () => {
    setReview(null);
    setPreparedDeployment(null);
    setPreparedImageDeployment(null);
    setDeployedAddress(null);
    setDeployedImageAddress(null);
    setCopiedAddress(null);
    setRendererDeploymentError(null);
    setImageDeploymentError(null);
    rendererWrite.reset();
    imageWrite.reset();
  };

  const selectImageSource = (
    blob: Blob,
    name: string,
    mime: SupportedImageMIME,
  ) => {
    setImageSource({ blob, name, mime });
    setImageSettings(defaultRendererImageSettings);
    setLocalImage(null);
    setImagePhase("processing");
    setImageError(null);
    setCandidateState((current) =>
      current.candidate && current.requestSet
        ? stateWithCandidateAndRequests(
            current.candidate,
            current.requestSet.requests,
          )
        : current,
    );
    setPreviewPhase("idle");
    resetDecision();
  };

  const updateImageSettings = (update: Partial<RendererImageSettings>) => {
    setImageSettings((current) => ({ ...current, ...update }));
    setLocalImage(null);
    setImagePhase("processing");
    setImageError(null);
    setCandidateState((current) =>
      current.candidate && current.requestSet
        ? stateWithCandidateAndRequests(
            current.candidate,
            current.requestSet.requests,
          )
        : current,
    );
    setPreviewPhase("idle");
    resetDecision();
  };

  useEffect(() => {
    if (
      !deploymentReceipt.isSuccess ||
      !deploymentReceipt.data ||
      !preparedDeployment ||
      deployedAddress
    ) {
      return;
    }

    let cancelled = false;
    void Promise.resolve(
      rendererAddressFromDeploymentLogs({
        logs: deploymentReceipt.data.logs,
        registry: preparedDeployment.registry,
      }),
    )
      .then(async (renderer) => {
        if (!renderer) {
          throw new Error(
            "The deployment succeeded, but no renderer address was returned.",
          );
        }
        if (cancelled) return;
        setDeployedAddress(renderer);
        const bytecode = await client.getBytecode({ address: renderer });
        if (cancelled) return;
        if (!bytecode || bytecode === "0x") {
          setRendererDeploymentError(
            "The address was returned, but its code is not visible from the canonical RPC yet.",
          );
          return;
        }
        setMessage("Renderer deployed on Robinhood testnet.");
        setRendererDeploymentError(null);
      })
      .catch((caught) => {
        if (cancelled) return;
        setRendererDeploymentError(
          caught instanceof Error
            ? caught.message
            : "The renderer transaction succeeded, but its code could not be checked.",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [
    client,
    deployedAddress,
    deploymentReceipt.data,
    deploymentReceipt.isSuccess,
    preparedDeployment,
  ]);

  useEffect(() => {
    if (
      !imageDeploymentReceipt.isSuccess ||
      !imageDeploymentReceipt.data ||
      !preparedImageDeployment ||
      deployedImageAddress
    ) {
      return;
    }
    let cancelled = false;
    void Promise.resolve()
      .then(() => {
        if (!isSuccessfulWriteReceipt(imageDeploymentReceipt.data)) {
          throw new Error("The image deployment did not succeed.");
        }
        return reconcileStoredMedia(client, {
          protocolDependencies: preparedImageDeployment.dependencies,
          creator: preparedImageDeployment.creator,
          payload: preparedImageDeployment.payload,
          mime: preparedImageDeployment.mime,
          receipt: imageDeploymentReceipt.data,
        });
      })
      .then((stored) => {
        if (cancelled) return;
        if (!stored) {
          throw new Error(
            "The image transaction succeeded, but its address is not available yet.",
          );
        }
        setDeployedImageAddress(stored.store);
        setImageDeploymentError(null);
        setMessage("Image deployed on Robinhood testnet.");
      })
      .catch((caught) => {
        if (cancelled) return;
        setImageDeploymentError(
          caught instanceof Error
            ? caught.message
            : "The image transaction succeeded, but its address could not be read.",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [
    client,
    deployedImageAddress,
    imageDeploymentReceipt.data,
    imageDeploymentReceipt.isSuccess,
    preparedImageDeployment,
  ]);

  const loadCandidate = (
    candidate: RendererCandidateInput,
    requests: readonly RendererPreviewRequest[],
    details: ImportDetails,
  ) => {
    const nextState = stateWithCandidateAndRequests(candidate, requests);
    setCandidateState(nextState);
    setImportDetails(details);
    setPreviewMembershipName(
      membershipNameFromRequests(requests, details.rendererName),
    );
    setImageSource(null);
    setLocalImage(null);
    setImagePhase("idle");
    setImageError(null);
    setPreviewPhase("idle");
    resetDecision();
    setError(null);
    setMessage(`Ready to preview ${requests.length} examples.`);
    return nextState;
  };

  useEffect(() => {
    if (!hasImageSlots || !account.isConnected || !account.address) {
      return;
    }
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) setSavedMedia({ status: "loading", records: [] });
    });
    void creatorMediaLoader(client, account.address)
      .then((records) => {
        if (!cancelled) setSavedMedia({ status: "ready", records });
      })
      .catch((caught) => {
        if (cancelled) return;
        setSavedMedia({
          status: "error",
          records: [],
          message:
            caught instanceof Error
              ? caught.message
              : "Saved images could not be read from chain.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [
    account.address,
    account.isConnected,
    client,
    creatorMediaLoader,
    hasImageSlots,
  ]);

  useEffect(() => {
    if (!imageSource) return;
    let cancelled = false;
    let prepared: Awaited<ReturnType<typeof processImageSource>> | undefined;
    const timeout = window.setTimeout(() => {
      setImagePhase("processing");
      setImageError(null);
      void processImageSource(imageSource.blob, {
        dimension: imageSettings.dimension,
        focalX: imageSettings.focalX / 100,
        focalY: imageSettings.focalY / 100,
        output:
          imageSettings.mime === "image/jpeg"
            ? {
                mime: "image/jpeg",
                quality: imageSettings.jpegQuality,
                background: "#120b0a",
              }
            : { mime: "image/png", purpose: "flat-art" },
      })
        .then((candidate) => {
          prepared = candidate;
          if (cancelled) return;
          setLocalImage({
            name: imageSource.name,
            bytes: bytesToHex(candidate.rendererCallBytes),
            byteLength: candidate.byteLength,
            dimension: candidate.dimension,
            mime: candidate.mime === "image/png" ? 2 : 1,
            previewUrl: candidate.objectURL,
          });
          setImagePhase("ready");
          setMessage("Image ready. Preview the representative examples.");
        })
        .catch((caught) => {
          if (cancelled) return;
          setLocalImage(null);
          setImagePhase("error");
          setImageError(
            caught instanceof Error
              ? caught.message
              : "The browser could not prepare that image.",
          );
        });
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      prepared?.dispose();
    };
  }, [imageSettings, imageSource]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let connection: RendererHelperConnection | undefined;
      try {
        connection = parseRendererHelperFragment(
          window.location,
          window.history,
        );
      } catch (caught) {
        if (!cancelled) {
          setHelperStatus(
            caught instanceof Error
              ? caught.message
              : "The local helper link is invalid. Import the renderer file instead.",
          );
        }
        return;
      }
      if (!connection || cancelled) return;

      const helper = helperClientFactory(connection);
      setHelperStatus("Connecting to local helper…");
      try {
        const session = await helper.connect();
        const [rawCandidate, rawRequests] = await Promise.all([
          helper.getCandidate(),
          helper.getExampleRequests(),
        ]);
        const adaptedCandidate = helperCandidateInput(rawCandidate);
        const adaptedRequests = helperRequestInputs(rawRequests);
        if (
          adaptedRequests.candidateFingerprint.toLowerCase() !==
          adaptedCandidate.artifactFingerprint.toLowerCase()
        ) {
          throw new Error(
            "The local helper candidate and example set do not match.",
          );
        }
        if (cancelled) return;
        loadCandidate(adaptedCandidate.candidate, adaptedRequests.requests, {
          rendererName: adaptedCandidate.rendererName,
          source: "helper",
        });
        setHelperBinding({
          client: helper,
          candidateFingerprint: adaptedRequests.candidateFingerprint,
          requestSetFingerprint: adaptedRequests.requestSetFingerprint,
        });
        if (session.sourceImage) {
          try {
            const image = await helper.getSourceImage(session.sourceImage);
            if (cancelled) return;
            selectImageSource(
              image,
              image.name,
              image.type as SupportedImageMIME,
            );
            setHelperStatus("Connected to local helper with source image.");
          } catch (caught) {
            if (cancelled) return;
            setHelperStatus(
              caught instanceof Error
                ? `${caught.message} Choose the image manually below.`
                : "Connected to local helper. Choose the image manually below.",
            );
          }
        } else {
          setHelperStatus("Connected to local helper.");
        }
      } catch (caught) {
        if (cancelled) return;
        setHelperBinding(null);
        setHelperStatus(
          caught instanceof HelperConnectionError || caught instanceof Error
            ? caught.message
            : "The local helper is unavailable. Import the renderer file instead.",
        );
      }
    })();

    return () => {
      cancelled = true;
    };
    // This is a one-time fragment handoff. Rerunning it would consume a removed URL fragment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const importPackageFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed = parseRendererPackage(await file.text());
      loadCandidate(
        candidateFromPackage(parsed, `file:${file.name}`),
        requestsFromPackage(parsed),
        {
          rendererName: parsed.rendererName,
          source: "file",
          fileName: file.name,
        },
      );
      setHelperBinding(null);
      setHelperStatus(null);
    } catch (caught) {
      setCandidateState(createRendererLabCandidateState());
      setImportDetails(null);
      setHelperBinding(null);
      setPreviewPhase("idle");
      resetDecision();
      setMessage(null);
      setError(
        caught instanceof Error
          ? caught.message
          : "The renderer package could not be imported.",
      );
    }
  };

  const onPackageChange = (event: ChangeEvent<HTMLInputElement>) => {
    void importPackageFile(event.target.files?.[0]);
    event.target.value = "";
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    void importPackageFile(event.dataTransfer.files[0]);
  };

  const onDropZoneKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      packageInputRef.current?.click();
    }
  };

  const onLocalImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!new Set(["image/jpeg", "image/png"]).has(file.type)) {
      setImageError("Choose a JPEG or PNG.");
      setImagePhase("error");
      return;
    }
    selectImageSource(file, file.name, file.type as SupportedImageMIME);
  };

  const selectSavedImage = (record: CreatorMediaRecord, index: number) => {
    selectImageSource(
      creatorMediaBlob(record),
      `Saved image ${index + 1}`,
      creatorMediaMime(record),
    );
  };

  const updatePreviewMembershipName = (membershipName: string) => {
    setPreviewMembershipName(membershipName);
    setCandidateState((current) =>
      current.candidate && current.requestSet
        ? stateWithCandidateAndRequests(
            current.candidate,
            requestsWithMembershipName(
              current.requestSet.requests,
              membershipName,
            ),
          )
        : current,
    );
    setPreviewPhase("idle");
    resetDecision();
    setMessage(null);
    setError(null);
  };

  const runPreviews = async () => {
    const candidate = candidateState.candidate;
    const requestSet = candidateState.requestSet;
    if (!candidate || !requestSet) return;
    if (!previewMembershipName.trim()) {
      setError("Add a membership name for the preview.");
      return;
    }
    if (!previewHarness) {
      setError(
        "The canonical preview harness is not configured for this public build.",
      );
      return;
    }
    setPreviewPhase("running");
    resetDecision();
    setError(null);
    setMessage(`Making ${requestSet.requests.length} canonical RPC previews…`);

    const results = await Promise.all(
      requestSet.requests.map(
        async (request): Promise<RendererPreviewResultInput> => {
          try {
            const image = await previewRendererRequest({
              client,
              previewHarness,
              renderer: zeroAddress,
              creationBytecode: candidate.creationBytecode,
              request,
              nativeMedia:
                request.localImageSlot && localImage
                  ? { bytes: localImage.bytes, mime: localImage.mime }
                  : undefined,
            });
            return { requestId: request.requestId, status: "ready", image };
          } catch (caught) {
            return {
              requestId: request.requestId,
              status: "failed",
              error:
                caught instanceof Error
                  ? caught.message
                  : "The canonical RPC preview failed.",
            };
          }
        },
      ),
    );
    const nextState = replaceRendererPreviewResults(candidateState, {
      candidateFingerprint: candidate.candidateFingerprint,
      requestSetFingerprint: requestSet.requestSetFingerprint,
      results,
    });
    setCandidateState(nextState);
    setPreviewPhase("complete");
    const failedCount = results.filter(
      (result) => result.status === "failed",
    ).length;
    setMessage(
      failedCount === 0
        ? `All ${results.length} representative examples are ready.`
        : `${results.length - failedCount} of ${results.length} examples are ready. Review the failures below.`,
    );

    if (helperBinding && nextState.resultSet) {
      try {
        await helperBinding.client.submitExampleResults({
          candidateFingerprint: helperBinding.candidateFingerprint,
          requestSetFingerprint: helperBinding.requestSetFingerprint,
          results: nextState.resultSet.results,
        });
      } catch (caught) {
        setHelperStatus(
          caught instanceof Error
            ? caught.message
            : "The previews are ready here, but the local helper did not accept them.",
        );
      }
    }
  };

  const approve = () => {
    try {
      const nextReview = approveRendererCandidate(candidateState);
      setReview(nextReview);
      setMessage("Renderer approved.");
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The renderer could not be approved.",
      );
    }
  };

  const reject = () => {
    try {
      setReview(rejectRendererCandidate(candidateState));
      setMessage("Renderer rejected.");
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The renderer could not be rejected.",
      );
    }
  };

  const deployRenderer = async () => {
    setRendererDeploymentError(null);
    if (!account.isConnected || !account.address) return;
    if (!review) return;

    try {
      if (account.chainId !== canonicalRendererPackageChainId) {
        await switchChain.switchChainAsync({
          chainId: canonicalRendererPackageChainId,
        });
      }
      const prepared = prepareRendererDeployment({
        registry: configuredRendererRegistry,
        state: candidateState,
        approval: review,
      });
      const { request } = await simulateContract(wagmiConfig, {
        account: account.address,
        address: prepared.registry,
        abi: rendererRegistryAbi,
        chainId: canonicalRendererPackageChainId,
        functionName: "deployAndRegister",
        args: [prepared.initCode],
      });
      setPreparedDeployment(prepared);
      setMessage("The deployment simulation passed. Review it in your wallet.");
      await rendererWrite.writeContractAsync(request);
    } catch (caught) {
      setPreparedDeployment(null);
      setRendererDeploymentError(
        caught instanceof Error
          ? caught.message
          : "The renderer deployment could not be prepared.",
      );
    }
  };

  const deployImage = async () => {
    setImageDeploymentError(null);
    if (!account.isConnected || !account.address || !localImage) return;

    try {
      if (account.chainId !== canonicalRendererPackageChainId) {
        await switchChain.switchChainAsync({
          chainId: canonicalRendererPackageChainId,
        });
      }
      const dependencies = await readProtocolDependencies(
        client,
        configuredDeployment,
      );
      if (dependencies.status !== "valid") {
        throw new Error(dependencies.label);
      }
      const { request } = await simulateContract(wagmiConfig, {
        account: account.address,
        address: dependencies.data.mediaStoreFactory,
        abi: onchainMediaStoreFactoryAbi,
        chainId: canonicalRendererPackageChainId,
        functionName: "store",
        args: [localImage.bytes, localImage.mime],
      });
      setPreparedImageDeployment({
        creator: account.address,
        dependencies: dependencies.data,
        mime: localImage.mime,
        payload: localImage.bytes,
      });
      setMessage("The image simulation passed. Review it in your wallet.");
      await imageWrite.writeContractAsync(request);
    } catch (caught) {
      setPreparedImageDeployment(null);
      setImageDeploymentError(
        caught instanceof Error
          ? caught.message
          : "The image deployment could not be prepared.",
      );
    }
  };

  const copyAddress = async (address: Address) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedAddress(address);
    } catch {
      setError("The address could not be copied. Select it and copy manually.");
    }
  };

  const approved =
    review?.decision === "approved" &&
    isRendererReviewCurrent(review, candidateState);
  const readyToReview =
    previewPhase === "complete" && results.length === requests.length;

  return (
    <section className={styles.lab} data-renderer-lab>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Public creator tool</p>
          <h1 className="font-display">Renderer lab</h1>
        </div>
        <p>
          Bring in a renderer package, see how it treats real membership states,
          and decide if it feels right.
        </p>
      </header>

      <div className={styles.workspace}>
        <section
          className={styles.importPanel}
          aria-labelledby="renderer-import"
        >
          <div className={styles.sectionHeading}>
            <span>01</span>
            <div>
              <h2 id="renderer-import">Bring in a renderer</h2>
              <p>Use the file from your renderer agent or drop it here.</p>
            </div>
          </div>

          {helperStatus && (
            <p className={styles.helperStatus} role="status">
              <span aria-hidden="true" />
              {helperStatus}
            </p>
          )}

          <div
            aria-label="Renderer package drop zone"
            className={styles.dropZone}
            onDragOver={(event) => event.preventDefault()}
            onDrop={onDrop}
            onKeyDown={onDropZoneKeyDown}
            role="button"
            tabIndex={0}
          >
            <span className={styles.dropMark} aria-hidden="true">
              +
            </span>
            <strong>Drop a .renderer.json file</strong>
            <span>or choose one from this device</span>
            <label
              className={`button button-dark ${styles.fileButton}`}
              htmlFor={packageInputId}
            >
              Choose renderer package
            </label>
            <input
              accept=".json,.renderer.json,application/json"
              aria-label="Renderer package"
              className={styles.hiddenInput}
              id={packageInputId}
              onChange={onPackageChange}
              ref={packageInputRef}
              type="file"
            />
          </div>

          <p className={styles.privacyLine}>
            Browser memory only <span aria-hidden="true">·</span> No account
            required <span aria-hidden="true">·</span> No package upload
          </p>
        </section>

        <section
          className={styles.reviewPanel}
          aria-labelledby="renderer-review"
        >
          <div className={styles.sectionHeading}>
            <span>02</span>
            <div>
              <h2 id="renderer-review">Review the work</h2>
              <p>
                Six materially different membership examples, read from chain.
              </p>
            </div>
          </div>

          {!candidateState.candidate || !importDetails ? (
            <div className={styles.emptyState}>
              <span aria-hidden="true">06</span>
              <p>Your representative gallery will appear here.</p>
            </div>
          ) : (
            <>
              <div className={styles.candidateHeader}>
                <div>
                  <p className={styles.microLabel}>Loaded renderer</p>
                  <h3>{importDetails.rendererName}</h3>
                  <p>
                    {importDetails.source === "helper"
                      ? "From your local renderer helper"
                      : importDetails.fileName}
                  </p>
                </div>
                <span className={styles.validBadge}>Package loaded</span>
              </div>

              <label className={styles.membershipNameField}>
                <span>Preview membership name</span>
                <input
                  aria-label="Preview membership name"
                  aria-describedby="preview-membership-name-help"
                  onChange={(event) =>
                    updatePreviewMembershipName(event.target.value)
                  }
                  type="text"
                  value={previewMembershipName}
                />
                <small id="preview-membership-name-help">
                  Used in these previews. You’ll choose the final name when you
                  create the membership.
                </small>
              </label>

              {hasImageSlots && (
                <div className={styles.imageControl}>
                  <div className={styles.imageControlHeading}>
                    <strong>Try your own image</strong>
                  </div>

                  <div className={styles.imageWorkspace}>
                    <div className={styles.imageSourcePreview}>
                      {localImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          alt="Selected source"
                          src={localImage.previewUrl}
                        />
                      ) : (
                        <span aria-hidden="true">IMAGE</span>
                      )}
                    </div>

                    <div className={styles.imageSourceTools}>
                      <label
                        className="button button-outline"
                        htmlFor={imageInputId}
                      >
                        {imageSource ? "Change image" : "Choose JPEG or PNG"}
                      </label>
                      <input
                        accept="image/jpeg,image/png"
                        className={styles.hiddenInput}
                        id={imageInputId}
                        onChange={onLocalImageChange}
                        type="file"
                      />

                      {imageSource && (
                        <>
                          <p className={styles.localFile}>{imageSource.name}</p>
                          <div className={styles.imageSettings}>
                            <label>
                              <span>Image size</span>
                              <select
                                onChange={(event) =>
                                  updateImageSettings({
                                    dimension: Number(
                                      event.target.value,
                                    ) as OutputDimension,
                                  })
                                }
                                value={imageSettings.dimension}
                              >
                                {outputDimensions.map((dimension) => (
                                  <option key={dimension} value={dimension}>
                                    {dimension} × {dimension}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              <span>Output format</span>
                              <select
                                onChange={(event) =>
                                  updateImageSettings({
                                    mime: event.target
                                      .value as SupportedImageMIME,
                                  })
                                }
                                value={imageSettings.mime}
                              >
                                <option value="image/jpeg">JPEG</option>
                                <option value="image/png">PNG</option>
                              </select>
                            </label>
                            {imageSettings.mime === "image/jpeg" && (
                              <label className={styles.rangeSetting}>
                                <span>
                                  JPEG quality
                                  <output>
                                    {Math.round(
                                      imageSettings.jpegQuality * 100,
                                    )}
                                  </output>
                                </span>
                                <input
                                  max={jpegQualityBounds.max}
                                  min={jpegQualityBounds.min}
                                  onChange={(event) =>
                                    updateImageSettings({
                                      jpegQuality: Number(event.target.value),
                                    })
                                  }
                                  step={jpegQualityBounds.step}
                                  type="range"
                                  value={imageSettings.jpegQuality}
                                />
                              </label>
                            )}
                            <label className={styles.rangeSetting}>
                              <span>
                                Horizontal focus
                                <output>{imageSettings.focalX}</output>
                              </span>
                              <input
                                max="100"
                                min="0"
                                onChange={(event) =>
                                  updateImageSettings({
                                    focalX: Number(event.target.value),
                                  })
                                }
                                type="range"
                                value={imageSettings.focalX}
                              />
                            </label>
                            <label className={styles.rangeSetting}>
                              <span>
                                Vertical focus
                                <output>{imageSettings.focalY}</output>
                              </span>
                              <input
                                max="100"
                                min="0"
                                onChange={(event) =>
                                  updateImageSettings({
                                    focalY: Number(event.target.value),
                                  })
                                }
                                type="range"
                                value={imageSettings.focalY}
                              />
                            </label>
                          </div>
                        </>
                      )}

                      <p aria-live="polite" className={styles.imageStatus}>
                        {imagePhase === "processing"
                          ? "Preparing image…"
                          : localImage
                            ? `${localImage.dimension} × ${localImage.dimension} · ${Math.ceil(localImage.byteLength / 1024)} KB`
                            : ""}
                      </p>
                      {imageError && (
                        <p className={styles.imageError} role="alert">
                          {imageError}
                        </p>
                      )}
                    </div>
                  </div>

                  {account.isConnected && (
                    <div className={styles.savedImages}>
                      <div>
                        <strong>Your uploaded images</strong>
                        <span>Robinhood testnet</span>
                      </div>
                      {savedMedia.status === "loading" && (
                        <p role="status">Loading images…</p>
                      )}
                      {savedMedia.status === "error" && (
                        <p role="alert">{savedMedia.message}</p>
                      )}
                      {savedMedia.status === "ready" &&
                        savedMedia.records.length === 0 && (
                          <p>No uploaded images found.</p>
                        )}
                      {savedMedia.records.length > 0 && (
                        <ul>
                          {savedMedia.records.map((record, index) => (
                            <li key={record.store}>
                              <button
                                aria-label={`Use uploaded image ${index + 1}`}
                                onClick={() => selectSavedImage(record, index)}
                                type="button"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img alt="" src={creatorMediaDataUrl(record)} />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className={styles.previewAction}>
                <button
                  className="button button-dark"
                  disabled={previewPhase === "running"}
                  onClick={() => void runPreviews()}
                  type="button"
                >
                  {previewPhase === "running"
                    ? "Making previews…"
                    : `Preview ${requests.length} examples`}
                </button>
                <span>No wallet needed</span>
              </div>

              {results.length > 0 && (
                <div
                  className={styles.gallery}
                  aria-label="Representative renderer examples"
                >
                  {requests.map((request, index) => {
                    const result = results.find(
                      (result) => result.requestId === request.requestId,
                    );
                    const label = requestLabel(request, index);
                    return (
                      <article
                        className={styles.example}
                        key={request.requestId}
                      >
                        <div className={styles.exampleMedia}>
                          {result?.status === "ready" ? (
                            // SVG is shown as an inert image resource, never injected into the DOM.
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              alt={`Membership example ${index + 1}: ${label}`}
                              src={svgDataUrl(result.image)}
                            />
                          ) : (
                            <div
                              className={styles.failedPreview}
                              role="img"
                              aria-label={`${label} failed`}
                            >
                              <span aria-hidden="true">!</span>
                              <p>
                                {result?.status === "failed"
                                  ? result.error
                                  : "Not previewed"}
                              </p>
                            </div>
                          )}
                        </div>
                        <div className={styles.exampleCaption}>
                          <span>{String(index + 1).padStart(2, "0")}</span>
                          <strong>{label}</strong>
                          <small>
                            {request.localImageSlot
                              ? localImage
                                ? "With selected image"
                                : "Without a supplied image"
                              : "Generated-only input"}
                          </small>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}

              {readyToReview && (
                <div className={styles.decisionPanel}>
                  <div>
                    <p className={styles.microLabel}>Your decision</p>
                    <strong>
                      Would you use this artwork for your membership?
                    </strong>
                  </div>
                  <div className={styles.decisionActions}>
                    <button
                      className="button button-dark"
                      onClick={approve}
                      type="button"
                    >
                      Approve renderer
                    </button>
                    <button
                      className="button button-outline"
                      onClick={reject}
                      type="button"
                    >
                      Reject renderer
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {(message || error) && (
        <div className={styles.noticeStack}>
          {message && (
            <p className={styles.statusMessage} role="status">
              {message}
            </p>
          )}
          {error && (
            <p className={styles.errorMessage} role="alert">
              {error}
            </p>
          )}
        </div>
      )}

      {approved && candidateState.candidate && review && (
        <section
          aria-label="Deployment summary"
          className={styles.deploymentPanel}
        >
          <div className={styles.sectionHeading}>
            <span>03</span>
            <div>
              <p className={styles.approvedLabel}>Approved</p>
              <h2>Ready when you are</h2>
              <p>
                Connect your wallet, then deploy the renderer and optional image
                separately.
              </p>
            </div>
          </div>

          <dl className={styles.summaryGrid}>
            <div>
              <dt>Network</dt>
              <dd>Robinhood testnet</dd>
            </div>
            <div>
              <dt>Renderer size estimate</dt>
              <dd>
                {byteEstimate(candidateState.candidate.initCodeByteLength)}
              </dd>
            </div>
            <div>
              <dt>Image size estimate</dt>
              <dd>
                {localImage
                  ? byteEstimate(localImage.byteLength)
                  : "No image selected"}
              </dd>
            </div>
            <div className={styles.addressSummary}>
              <dt>Reusable renderer address</dt>
              <dd>
                {deployedAddress ? (
                  <CopyableAddress
                    address={deployedAddress}
                    copied={copiedAddress === deployedAddress}
                    label="renderer address"
                    onCopy={(address) => void copyAddress(address)}
                  />
                ) : (
                  "Returned after deployment"
                )}
              </dd>
            </div>
            {localImage && (
              <div className={styles.addressSummary}>
                <dt>Reusable image address</dt>
                <dd>
                  {deployedImageAddress ? (
                    <CopyableAddress
                      address={deployedImageAddress}
                      copied={copiedAddress === deployedImageAddress}
                      label="image address"
                      onCopy={(address) => void copyAddress(address)}
                    />
                  ) : (
                    "Returned after image deployment"
                  )}
                </dd>
              </div>
            )}
            <div>
              <dt>Wallet cost</dt>
              <dd>Estimated by your wallet before signing</dd>
            </div>
          </dl>

          <details className={styles.technicalDetails}>
            <summary>Technical details</summary>
            <dl>
              <div>
                <dt>Renderer registry</dt>
                <dd className="font-mono">
                  {configuredRendererRegistry ?? "Not deployed"}
                </dd>
              </div>
              <div>
                <dt>Candidate fingerprint</dt>
                <dd
                  className="font-mono"
                  title={candidateState.candidate.candidateFingerprint}
                >
                  {shortHex(candidateState.candidate.candidateFingerprint)}
                </dd>
              </div>
              <div>
                <dt>Approval fingerprint</dt>
                <dd className="font-mono" title={review.fingerprint}>
                  {shortHex(review.fingerprint)}
                </dd>
              </div>
            </dl>
          </details>

          <div className={styles.walletGate}>
            <div>
              <p className={styles.microLabel}>Creator wallet</p>
              <strong>
                {account.isConnected
                  ? "Wallet connected"
                  : "Connect a wallet to deploy"}
              </strong>
              <p>Choose the account and network here. Deployment is below.</p>
            </div>
            <WalletControl />
          </div>

          <div className={styles.deploymentActions}>
            <div className={styles.deploymentAction}>
              <div>
                <p className={styles.microLabel}>Renderer contract</p>
                <strong>
                  {byteEstimate(candidateState.candidate.initCodeByteLength)}
                </strong>
                {rendererWrite.data && deploymentReceipt.isLoading && (
                  <p role="status">Waiting for three confirmations.</p>
                )}
                {deployedAddress && (
                  <p role="status">Renderer address is ready above.</p>
                )}
                {(rendererDeploymentError ||
                  rendererWrite.error ||
                  deploymentReceipt.error) && (
                  <p className={styles.actionError} role="alert">
                    {rendererDeploymentError ??
                      rendererWrite.error?.message ??
                      deploymentReceipt.error?.message}
                  </p>
                )}
              </div>
              <button
                className="button button-dark"
                disabled={
                  !account.isConnected ||
                  Boolean(deployedAddress) ||
                  rendererWrite.isPending ||
                  deploymentReceipt.isLoading ||
                  (deploymentReceipt.isSuccess &&
                    !deployedAddress &&
                    !rendererDeploymentError)
                }
                onClick={() => void deployRenderer()}
                type="button"
              >
                {deployedAddress
                  ? "Renderer deployed"
                  : rendererWrite.isPending
                    ? "Waiting for wallet…"
                    : deploymentReceipt.isLoading
                      ? "Confirming renderer…"
                      : deploymentReceipt.isSuccess && !rendererDeploymentError
                        ? "Finding renderer address…"
                        : rendererWrite.error ||
                            deploymentReceipt.error ||
                            rendererDeploymentError
                          ? "Try renderer deployment again"
                          : "Deploy renderer"}
              </button>
            </div>

            {localImage && (
              <div className={styles.deploymentAction}>
                <div>
                  <p className={styles.microLabel}>Onchain image</p>
                  <strong>{byteEstimate(localImage.byteLength)}</strong>
                  {imageWrite.data && imageDeploymentReceipt.isLoading && (
                    <p role="status">Waiting for three confirmations.</p>
                  )}
                  {deployedImageAddress && (
                    <p role="status">Image address is ready above.</p>
                  )}
                  {(imageDeploymentError ||
                    imageWrite.error ||
                    imageDeploymentReceipt.error) && (
                    <p className={styles.actionError} role="alert">
                      {imageDeploymentError ??
                        imageWrite.error?.message ??
                        imageDeploymentReceipt.error?.message}
                    </p>
                  )}
                </div>
                <button
                  className="button button-outline"
                  disabled={
                    !account.isConnected ||
                    Boolean(deployedImageAddress) ||
                    imageWrite.isPending ||
                    imageDeploymentReceipt.isLoading ||
                    (imageDeploymentReceipt.isSuccess &&
                      !deployedImageAddress &&
                      !imageDeploymentError)
                  }
                  onClick={() => void deployImage()}
                  type="button"
                >
                  {deployedImageAddress
                    ? "Image deployed"
                    : imageWrite.isPending
                      ? "Waiting for wallet…"
                      : imageDeploymentReceipt.isLoading
                        ? "Confirming image…"
                        : imageDeploymentReceipt.isSuccess &&
                            !imageDeploymentError
                          ? "Finding image address…"
                          : imageWrite.error ||
                              imageDeploymentReceipt.error ||
                              imageDeploymentError
                            ? "Try image deployment again"
                            : "Deploy image"}
                </button>
              </div>
            )}
          </div>
        </section>
      )}
    </section>
  );
}
