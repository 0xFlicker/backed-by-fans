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
  getAddress,
  getCreate2Address,
  http,
  keccak256,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { robinhoodTestnet } from "viem/chains";
import {
  useAccount,
  useSendTransaction,
  useSwitchChain,
  useWaitForTransactionReceipt,
} from "wagmi";

import { WalletControl } from "@/components/WalletControl";
import {
  defaultJpegQuality,
  processImageSource,
} from "@/features/creator-studio/image-processing";
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
  canonicalRendererCreate2DeployerCodeHash,
  prepareUnsignedRendererDeployment,
  type UnsignedRendererDeployment,
} from "@/features/renderer-lab/deployment";
import {
  HelperConnectionError,
  parseRendererHelperFragment,
  RendererHelperClient,
  type RendererHelperConnection,
} from "@/features/renderer-lab/local-helper-client";
import {
  canonicalRendererCreate2Deployer,
  canonicalRendererPackageChainId,
  computeRendererArtifactFingerprint,
  maxRawRendererDeploymentBytes,
  maxRendererInitcodeBytes,
  maxRendererRuntimeBytes,
  parseRendererPackage,
  type ParsedRendererPackage,
} from "@/features/renderer-lab/package-import";
import { previewRendererRequest } from "@/features/renderer-lab/preview";
import { getDeployment, publicConfig } from "@/lib/config";

import styles from "./RendererLab.module.css";

type RendererHelperPort = Pick<
  RendererHelperClient,
  "connect" | "getCandidate" | "getExampleRequests" | "submitExampleResults"
>;

export type RendererLabProps = {
  client?: PublicClient;
  previewHarness?: Address;
  helperClientFactory?: (
    connection: RendererHelperConnection,
  ) => RendererHelperPort;
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

function defaultHelperClientFactory(connection: RendererHelperConnection) {
  return new RendererHelperClient(connection);
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

function requiredAddress(value: unknown, label: string): Address {
  try {
    return getAddress(requiredString(value, label));
  } catch {
    throw new Error(`${label} is missing or invalid.`);
  }
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
    create2Deployer: parsed.deployment.create2Deployer,
    salt: parsed.deployment.salt,
    initCodeHash: parsed.deployment.initCodeHash,
    predictedAddress: parsed.deployment.predictedAddress,
    rawByteLength: parsed.deployment.rawByteLength,
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
  const salt = requiredHex(raw.salt, "CREATE2 salt");
  const chainId = requiredNumber(deployment.chainId, "Canonical chain");
  const create2Deployer = requiredAddress(
    deployment.create2Deployer,
    "CREATE2 deployer",
  );
  const initCodeHash = requiredHex(deployment.initCodeHash, "Initcode hash");
  const predictedAddress = requiredAddress(
    deployment.predictedAddress,
    "Predicted address",
  );
  const rawByteLength = requiredNumber(
    deployment.rawByteLength,
    "Raw payload size",
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
  if (
    chainId !== canonicalRendererPackageChainId ||
    create2Deployer !== canonicalRendererCreate2Deployer
  ) {
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
  const recomputedInitCodeHash = keccak256(creationBytecode);
  const recomputedRawByteLength =
    byteLength(salt) + byteLength(creationBytecode);
  const recomputedAddress = getCreate2Address({
    from: create2Deployer,
    salt,
    bytecodeHash: recomputedInitCodeHash,
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
    initCodeHash.toLowerCase() !== recomputedInitCodeHash.toLowerCase() ||
    rawByteLength !== recomputedRawByteLength ||
    rawByteLength >= maxRawRendererDeploymentBytes ||
    predictedAddress.toLowerCase() !== recomputedAddress.toLowerCase()
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
      create2Deployer,
      salt,
      initCodeHash: recomputedInitCodeHash,
      predictedAddress: recomputedAddress,
      rawByteLength: recomputedRawByteLength,
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

export function RendererLab({
  client = canonicalPublicClient,
  previewHarness = configuredPreviewHarness,
  helperClientFactory = defaultHelperClientFactory,
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
  const [localImage, setLocalImage] = useState<{
    name: string;
    bytes: Hex;
  } | null>(null);
  const [previewPhase, setPreviewPhase] = useState<PreviewPhase>("idle");
  const [review, setReview] = useState<RendererReviewDecision | null>(null);
  const [deployRequested, setDeployRequested] = useState(false);
  const [preparedDeployment, setPreparedDeployment] =
    useState<UnsignedRendererDeployment | null>(null);
  const [deployedAddress, setDeployedAddress] = useState<Address | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const account = useAccount();
  const switchChain = useSwitchChain();
  const sendTransaction = useSendTransaction();
  const deploymentReceipt = useWaitForTransactionReceipt({
    chainId: canonicalRendererPackageChainId,
    hash: sendTransaction.data,
    query: { enabled: Boolean(sendTransaction.data) },
  });

  const resetDecision = () => {
    setReview(null);
    setDeployRequested(false);
    setPreparedDeployment(null);
    setDeployedAddress(null);
    sendTransaction.reset();
  };

  useEffect(() => {
    if (
      !deploymentReceipt.isSuccess ||
      !preparedDeployment ||
      deployedAddress
    ) {
      return;
    }

    let cancelled = false;
    void client
      .getBytecode({ address: preparedDeployment.predictedAddress })
      .then((code) => {
        if (cancelled) return;
        if (!code || code === "0x") {
          setError(
            "The wallet reported success, but the renderer code is not visible yet. Refresh the canonical chain before sharing this address.",
          );
          return;
        }
        setDeployedAddress(preparedDeployment.predictedAddress);
        setMessage("Renderer deployed on Robinhood testnet.");
        setError(null);
      })
      .catch((caught) => {
        if (cancelled) return;
        setError(
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
    deploymentReceipt.isSuccess,
    preparedDeployment,
  ]);

  const loadCandidate = (
    candidate: RendererCandidateInput,
    requests: readonly RendererPreviewRequest[],
    details: ImportDetails,
  ) => {
    const nextState = stateWithCandidateAndRequests(candidate, requests);
    setCandidateState(nextState);
    setImportDetails(details);
    setLocalImage(null);
    setPreviewPhase("idle");
    resetDecision();
    setError(null);
    setMessage(`Ready to preview ${requests.length} examples.`);
    return nextState;
  };

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
        await helper.connect();
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
        setHelperStatus("Connected to local helper.");
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

  const onLocalImageChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!new Set(["image/jpeg", "image/png"]).has(file.type)) {
      setError("Choose a JPEG or PNG for the browser-held preview image.");
      return;
    }
    try {
      const candidate = await processImageSource(file, {
        output:
          file.type === "image/jpeg"
            ? {
                mime: "image/jpeg",
                quality: defaultJpegQuality,
                background: "#120b0a",
              }
            : { mime: "image/png", purpose: "flat-art" },
      });
      const bytes = bytesToHex(candidate.rendererCallBytes);
      candidate.dispose();
      setLocalImage({ name: file.name, bytes });
      if (candidateState.candidate && candidateState.requestSet) {
        setCandidateState(
          stateWithCandidateAndRequests(
            candidateState.candidate,
            candidateState.requestSet.requests,
          ),
        );
      }
      setPreviewPhase("idle");
      resetDecision();
      setMessage("Image ready in this browser. Run the examples again.");
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The browser could not prepare that image.",
      );
    }
  };

  const runPreviews = async () => {
    const candidate = candidateState.candidate;
    const requestSet = candidateState.requestSet;
    if (!candidate || !requestSet) return;
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
              renderer: candidate.predictedAddress,
              creationBytecode: candidate.creationBytecode,
              request,
              nativeMedia: request.localImageSlot
                ? localImage?.bytes
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
      setDeployRequested(false);
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
      setDeployRequested(false);
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

  const deploy = async () => {
    setDeployRequested(true);
    setError(null);
    if (!account.isConnected || !account.address) return;
    if (!review) return;

    try {
      if (account.chainId !== canonicalRendererPackageChainId) {
        await switchChain.switchChainAsync({
          chainId: canonicalRendererPackageChainId,
        });
      }
      const prepared = await prepareUnsignedRendererDeployment({
        client,
        state: candidateState,
        approval: review,
        expectedDeployerCodeHash: canonicalRendererCreate2DeployerCodeHash,
      });
      const request = {
        account: account.address,
        chainId: canonicalRendererPackageChainId,
        data: prepared.calldata,
        to: prepared.deployer,
        value: 0n,
      } as const;

      await client.call(request);
      setPreparedDeployment(prepared);
      setMessage("The deployment simulation passed. Review it in your wallet.");
      await sendTransaction.sendTransactionAsync(request);
    } catch (caught) {
      setPreparedDeployment(null);
      setError(
        caught instanceof Error
          ? caught.message
          : "The renderer deployment could not be prepared.",
      );
    }
  };

  const approved =
    review?.decision === "approved" &&
    isRendererReviewCurrent(review, candidateState);
  const results = candidateState.resultSet?.results ?? [];
  const requests = candidateState.requestSet?.requests ?? [];
  const readyToReview =
    previewPhase === "complete" && results.length === requests.length;
  const hasImageSlots = requests.some((request) => request.localImageSlot);

  return (
    <section className={styles.lab} data-renderer-lab>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Public creator tool</p>
          <h1 className="font-display">Renderer lab</h1>
        </div>
        <p>
          Bring in a renderer package, see how it treats real membership states,
          and decide if it feels right. Nothing is uploaded or saved by Backed
          By Fans.
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
                <span className={styles.validBadge}>Package verified</span>
              </div>

              {hasImageSlots && (
                <div className={styles.imageControl}>
                  <div>
                    <strong>Try your own image</strong>
                    <p>
                      Optional. It stays in this browser and is used only in
                      read-only previews.
                    </p>
                  </div>
                  <label
                    className="button button-outline"
                    htmlFor={imageInputId}
                  >
                    {localImage ? "Change image" : "Choose JPEG or PNG"}
                  </label>
                  <input
                    accept="image/jpeg,image/png"
                    className={styles.hiddenInput}
                    id={imageInputId}
                    onChange={onLocalImageChange}
                    type="file"
                  />
                  {localImage && (
                    <span className={styles.localFile}>{localImage.name}</span>
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
                                ? "With your browser-held image"
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
                Review the destination below. A wallet is requested only after
                you choose Deploy renderer.
              </p>
            </div>
          </div>

          <dl className={styles.summaryGrid}>
            <div>
              <dt>Network</dt>
              <dd>Robinhood testnet</dd>
            </div>
            <div>
              <dt>Final payload</dt>
              <dd>
                {candidateState.candidate.rawByteLength.toLocaleString()} bytes
              </dd>
            </div>
            <div className={styles.addressSummary}>
              <dt>Reusable renderer address</dt>
              <dd className="font-mono">
                {candidateState.candidate.predictedAddress}
              </dd>
            </div>
            <div>
              <dt>Wallet cost</dt>
              <dd>Estimated by your wallet before signing</dd>
            </div>
          </dl>

          <details className={styles.technicalDetails}>
            <summary>Technical details</summary>
            <dl>
              <div>
                <dt>CREATE2 deployer</dt>
                <dd className="font-mono">
                  {candidateState.candidate.create2Deployer}
                </dd>
              </div>
              <div>
                <dt>Salt</dt>
                <dd className="font-mono">{candidateState.candidate.salt}</dd>
              </div>
              <div>
                <dt>Initcode hash</dt>
                <dd className="font-mono">
                  {candidateState.candidate.initCodeHash}
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

          {!deployRequested ? (
            <button
              className={`button button-dark ${styles.deployButton}`}
              onClick={() => void deploy()}
              type="button"
            >
              Deploy renderer
            </button>
          ) : (
            <div className={styles.walletGate}>
              <div>
                <p className={styles.microLabel}>Creator wallet</p>
                <strong>Connect only when you are ready to continue.</strong>
                <p>
                  Your wallet owns submission, confirmation, replacement, and
                  cancellation. Backed By Fans checks the renderer address only
                  after a successful wallet receipt.
                </p>
              </div>
              <WalletControl />
              {account.isConnected && !sendTransaction.data && (
                <button
                  className="button button-dark"
                  disabled={sendTransaction.isPending}
                  onClick={() => void deploy()}
                  type="button"
                >
                  {sendTransaction.isPending
                    ? "Waiting for wallet…"
                    : "Send renderer deployment"}
                </button>
              )}
              {sendTransaction.data && deploymentReceipt.isLoading && (
                <p role="status">
                  Deployment submitted. Waiting for your wallet receipt…
                </p>
              )}
              {deployedAddress && (
                <p className="font-mono" role="status">
                  Renderer deployed: {deployedAddress}
                </p>
              )}
              {(sendTransaction.error || deploymentReceipt.error) && (
                <p className={styles.errorMessage} role="alert">
                  {sendTransaction.error?.message ??
                    deploymentReceipt.error?.message}
                </p>
              )}
            </div>
          )}
        </section>
      )}
    </section>
  );
}
