import { keccak256, stringToHex, type Address, type Hex } from "viem";

export type RendererCandidateInput = {
  candidateId: string;
  chainId: number;
  artifactFingerprint: Hex;
  interfaceSchema: Hex;
  creationBytecode: Hex;
  runtimeBytecode: Hex;
  create2Deployer: Address;
  salt: Hex;
  initCodeHash: Hex;
  predictedAddress: Address;
  rawByteLength: number;
};

export type RendererCandidate = RendererCandidateInput & {
  candidateFingerprint: Hex;
};

export type RendererPreviewRequest = {
  requestId: string;
  mode: "deployed-address" | "undeployed-initcode";
  method: "previewSVG" | "previewTokenURI";
  contextWithoutMedia: Record<string, unknown>;
  localImageSlot: boolean;
};

export type RendererPreviewRequestSet = {
  candidateFingerprint: Hex;
  requestSetFingerprint: Hex;
  requests: readonly RendererPreviewRequest[];
};

export type RendererPreviewResultInput =
  | {
      requestId: string;
      status: "ready";
      image: string;
    }
  | {
      requestId: string;
      status: "failed";
      error: string;
    };

export type RendererPreviewResult = RendererPreviewResultInput & {
  resultFingerprint: Hex;
};

export type RendererPreviewResultSet = {
  candidateFingerprint: Hex;
  requestSetFingerprint: Hex;
  resultSetFingerprint: Hex;
  results: readonly RendererPreviewResult[];
};

export type RendererCandidateMutation = {
  revision: number;
  kind: "candidate" | "requests" | "results";
  fingerprint: Hex;
};

export type RendererLabCandidateState = {
  candidate: RendererCandidate | null;
  requestSet: RendererPreviewRequestSet | null;
  resultSet: RendererPreviewResultSet | null;
  mutation: RendererCandidateMutation | null;
};

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Renderer fingerprints require finite numbers.");
    }
    return JSON.stringify(value);
  }
  if (typeof value === "bigint") {
    return `{"$bigint":${JSON.stringify(value.toString())}}`;
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .sort()
      .map((key) => {
        const entry = record[key];
        if (entry === undefined) {
          throw new TypeError(
            "Renderer fingerprints do not accept undefined values.",
          );
        }
        return `${JSON.stringify(key)}:${canonicalJson(entry)}`;
      });
    return `{${entries.join(",")}}`;
  }
  throw new TypeError(`Renderer fingerprints do not accept ${typeof value}.`);
}

function fingerprint(value: unknown): Hex {
  return keccak256(stringToHex(canonicalJson(value)));
}

function cloneMemoryValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => cloneMemoryValue(item)) as T;
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        cloneMemoryValue(entry),
      ]),
    ) as T;
  }
  return value;
}

function nextMutation(
  state: RendererLabCandidateState,
  kind: RendererCandidateMutation["kind"],
  mutationFingerprint: Hex,
): RendererCandidateMutation {
  return {
    revision: (state.mutation?.revision ?? 0) + 1,
    kind,
    fingerprint: mutationFingerprint,
  };
}

function assertCurrentCandidate(
  state: RendererLabCandidateState,
  candidateFingerprint: Hex,
): RendererCandidate {
  if (!state.candidate) {
    throw new Error("Load a renderer candidate before representative data.");
  }
  if (state.candidate.candidateFingerprint !== candidateFingerprint) {
    throw new Error(
      "Representative data does not match the current candidate.",
    );
  }
  return state.candidate;
}

function assertUniqueRequestIds(
  requests: readonly Pick<RendererPreviewRequest, "requestId">[],
): void {
  const ids = new Set<string>();
  for (const request of requests) {
    if (!request.requestId.trim()) {
      throw new Error("Representative request IDs cannot be empty.");
    }
    if (ids.has(request.requestId)) {
      throw new Error(`Duplicate representative request ${request.requestId}.`);
    }
    ids.add(request.requestId);
  }
}

export function fingerprintRendererCandidate(
  candidate: RendererCandidateInput,
): Hex {
  return fingerprint({
    chainId: candidate.chainId,
    artifactFingerprint: candidate.artifactFingerprint.toLowerCase(),
    interfaceSchema: candidate.interfaceSchema.toLowerCase(),
    creationBytecode: candidate.creationBytecode.toLowerCase(),
    runtimeBytecode: candidate.runtimeBytecode.toLowerCase(),
    create2Deployer: candidate.create2Deployer.toLowerCase(),
    salt: candidate.salt.toLowerCase(),
    initCodeHash: candidate.initCodeHash.toLowerCase(),
    predictedAddress: candidate.predictedAddress.toLowerCase(),
    rawByteLength: candidate.rawByteLength,
  });
}

export function fingerprintRendererPreviewRequestSet(
  candidateFingerprint: Hex,
  requests: readonly RendererPreviewRequest[],
): Hex {
  assertUniqueRequestIds(requests);
  return fingerprint({
    candidateFingerprint: candidateFingerprint.toLowerCase(),
    requests,
  });
}

export function fingerprintRendererPreviewResult(
  candidateFingerprint: Hex,
  requestSetFingerprint: Hex,
  result: RendererPreviewResultInput,
): Hex {
  return fingerprint({
    candidateFingerprint: candidateFingerprint.toLowerCase(),
    requestSetFingerprint: requestSetFingerprint.toLowerCase(),
    result,
  });
}

export function createRendererLabCandidateState(): RendererLabCandidateState {
  return {
    candidate: null,
    requestSet: null,
    resultSet: null,
    mutation: null,
  };
}

export function replaceRendererCandidate(
  state: RendererLabCandidateState,
  candidateInput: RendererCandidateInput,
): RendererLabCandidateState {
  const candidate = cloneMemoryValue({
    ...candidateInput,
    candidateFingerprint: fingerprintRendererCandidate(candidateInput),
  });

  if (
    state.candidate?.candidateFingerprint === candidate.candidateFingerprint
  ) {
    return { ...state, candidate };
  }

  return {
    candidate,
    requestSet: null,
    resultSet: null,
    mutation: nextMutation(state, "candidate", candidate.candidateFingerprint),
  };
}

export function replaceRendererPreviewRequests(
  state: RendererLabCandidateState,
  candidateFingerprint: Hex,
  requestInputs: readonly RendererPreviewRequest[],
): RendererLabCandidateState {
  assertCurrentCandidate(state, candidateFingerprint);
  if (requestInputs.length === 0) {
    throw new Error("At least one representative request is required.");
  }
  const requests = cloneMemoryValue(requestInputs);
  const requestSetFingerprint = fingerprintRendererPreviewRequestSet(
    candidateFingerprint,
    requests,
  );
  const requestSet: RendererPreviewRequestSet = {
    candidateFingerprint,
    requestSetFingerprint,
    requests,
  };

  if (state.requestSet?.requestSetFingerprint === requestSetFingerprint) {
    return { ...state, requestSet };
  }

  return {
    ...state,
    requestSet,
    resultSet: null,
    mutation: nextMutation(state, "requests", requestSetFingerprint),
  };
}

export function replaceRendererPreviewResults(
  state: RendererLabCandidateState,
  input: {
    candidateFingerprint: Hex;
    requestSetFingerprint: Hex;
    results: readonly RendererPreviewResultInput[];
  },
): RendererLabCandidateState {
  assertCurrentCandidate(state, input.candidateFingerprint);
  if (
    !state.requestSet ||
    state.requestSet.requestSetFingerprint !== input.requestSetFingerprint
  ) {
    throw new Error(
      "Representative results do not match the current request set.",
    );
  }

  assertUniqueRequestIds(input.results);
  const resultsById = new Map(
    input.results.map((result) => [result.requestId, result]),
  );
  const currentRequestIds = new Set(
    state.requestSet.requests.map((request) => request.requestId),
  );
  for (const result of input.results) {
    if (!currentRequestIds.has(result.requestId)) {
      throw new Error(`Unexpected representative result ${result.requestId}.`);
    }
    if (result.status === "ready" && !result.image.trim()) {
      throw new Error(
        `Representative result ${result.requestId} has no image.`,
      );
    }
    if (result.status === "failed" && !result.error.trim()) {
      throw new Error(
        `Representative result ${result.requestId} has no error.`,
      );
    }
  }

  const results = state.requestSet.requests.flatMap((request) => {
    const result = resultsById.get(request.requestId);
    if (!result) return [];
    const copied = cloneMemoryValue(result);
    return [
      {
        ...copied,
        resultFingerprint: fingerprintRendererPreviewResult(
          input.candidateFingerprint,
          input.requestSetFingerprint,
          copied,
        ),
      },
    ];
  });
  const resultSetFingerprint = fingerprint({
    candidateFingerprint: input.candidateFingerprint.toLowerCase(),
    requestSetFingerprint: input.requestSetFingerprint.toLowerCase(),
    resultFingerprints: results.map((result) => result.resultFingerprint),
  });
  const resultSet: RendererPreviewResultSet = {
    candidateFingerprint: input.candidateFingerprint,
    requestSetFingerprint: input.requestSetFingerprint,
    resultSetFingerprint,
    results,
  };

  if (state.resultSet?.resultSetFingerprint === resultSetFingerprint) {
    return { ...state, resultSet };
  }

  return {
    ...state,
    resultSet,
    mutation: nextMutation(state, "results", resultSetFingerprint),
  };
}
