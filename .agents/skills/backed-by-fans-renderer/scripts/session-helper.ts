import {
  createHash,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

declare const Bun: {
  file(path: string): {
    readonly size: number;
    exists(): Promise<boolean>;
    text(): Promise<string>;
  };
  serve(options: {
    fetch(request: Request): Response | Promise<Response>;
    hostname: string;
    port: number;
  }): {
    readonly port: number;
    stop(closeActiveConnections?: boolean): void;
  };
};

export const LOOPBACK_HOST = "127.0.0.1";
export const HIGH_PORT_MIN = 49_152;
export const HIGH_PORT_MAX = 65_535;
export const MAX_BODY_BYTES = 1_000_000;
export const DEFAULT_TTL_MS = 15 * 60 * 1_000;
export const MAX_TTL_MS = 60 * 60 * 1_000;
export const DEFAULT_PAGE_URL = "http://localhost:3000/renderer";

const JSON_CONTENT_TYPE = "application/json; charset=utf-8";
const CORS_METHODS = "GET, PUT, POST, DELETE, OPTIONS";
const CORS_HEADERS = "Authorization, Content-Type";
const CHAIN_ID = 46_630;
const HEX_32_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const HEX_BYTES_PATTERN = /^0x(?:[0-9a-fA-F]{2})*$/;
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const BODY_METHODS = new Set(["POST", "PUT"]);
const ALLOWED_CORS_HEADERS = new Set(["authorization", "content-type"]);

type JsonObject = Record<string, unknown>;
type SessionStatus = "ready" | "active" | "expired" | "closed";

interface SessionState {
  status: SessionStatus;
  candidate: JsonObject | null;
  exampleRequests: JsonObject | null;
  exampleResults: JsonObject | null;
  approval: JsonObject | null;
  deploymentRequest: JsonObject | null;
  deploymentResult: JsonObject | null;
}

export interface StartRendererSessionHelperOptions {
  pageUrl?: string;
  ttlMs?: number;
  initialPackage?: unknown;
}

export interface RendererSessionHelper {
  readonly hostname: typeof LOOPBACK_HOST;
  readonly port: number;
  readonly origin: string;
  readonly capability: string;
  readonly sessionId: string;
  readonly expiresAt: string;
  readonly pageUrl: string;
  close(): void;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireObject(value: unknown, label: string): JsonObject {
  if (!isObject(value)) {
    throw new HttpError(400, `${label} must be a JSON object.`);
  }
  return value;
}

function requireExactKeys(
  value: JsonObject,
  required: readonly string[],
  optional: readonly string[] = [],
): void {
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new HttpError(400, `Unexpected field: ${key}.`);
    }
  }
  for (const key of required) {
    if (!(key in value)) {
      throw new HttpError(400, `Missing required field: ${key}.`);
    }
  }
}

function requireString(
  value: unknown,
  label: string,
  options: { maxLength?: number; pattern?: RegExp } = {},
): string {
  if (typeof value !== "string") {
    throw new HttpError(400, `${label} must be a string.`);
  }
  if (options.maxLength !== undefined && value.length > options.maxLength) {
    throw new HttpError(413, `${label} is too large.`);
  }
  if (options.pattern && !options.pattern.test(value)) {
    throw new HttpError(400, `${label} has an invalid format.`);
  }
  return value;
}

function requireInteger(
  value: unknown,
  label: string,
  options: { exact?: number; maximum?: number } = {},
): number {
  if (!Number.isInteger(value)) {
    throw new HttpError(400, `${label} must be an integer.`);
  }
  const integer = value as number;
  if (options.exact !== undefined && integer !== options.exact) {
    throw new HttpError(400, `${label} must equal ${options.exact}.`);
  }
  if (options.maximum !== undefined && integer > options.maximum) {
    throw new HttpError(400, `${label} exceeds ${options.maximum}.`);
  }
  return integer;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new HttpError(400, `${label} must be a boolean.`);
  }
  return value;
}

function requireEnum<T extends string>(
  value: unknown,
  label: string,
  allowed: readonly T[],
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new HttpError(400, `${label} has an invalid value.`);
  }
  return value as T;
}

function normalizedFieldName(key: string): string {
  return key.replaceAll(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function containsSourceImageField(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsSourceImageField);
  }
  if (!isObject(value)) {
    return false;
  }
  return Object.entries(value).some(([key, nested]) => {
    const normalized = normalizedFieldName(key);
    return (
      normalized.startsWith("sourceimage") ||
      normalized === "nativemedia" ||
      containsSourceImageField(nested)
    );
  });
}

function rejectSourceImageFields(value: unknown): void {
  if (containsSourceImageField(value)) {
    throw new HttpError(
      400,
      "Source image data is not accepted by the local helper.",
    );
  }
}

function validateCandidate(value: unknown): JsonObject {
  const candidate = requireObject(value, "Candidate");
  requireExactKeys(candidate, [
    "candidateId",
    "artifactFingerprint",
    "creationBytecode",
    "runtimeBytecode",
    "salt",
    "manifest",
  ]);
  requireString(candidate.candidateId, "candidateId");
  requireString(candidate.artifactFingerprint, "artifactFingerprint", {
    pattern: HEX_32_PATTERN,
  });
  requireString(candidate.creationBytecode, "creationBytecode", {
    pattern: HEX_BYTES_PATTERN,
  });
  requireString(candidate.runtimeBytecode, "runtimeBytecode", {
    pattern: HEX_BYTES_PATTERN,
  });
  requireString(candidate.salt, "salt", { pattern: HEX_32_PATTERN });
  requireObject(candidate.manifest, "manifest");
  return candidate;
}

function validateExampleRequestSet(value: unknown): JsonObject {
  const requestSet = requireObject(value, "Example request set");
  requireExactKeys(requestSet, [
    "candidateFingerprint",
    "requestSetFingerprint",
    "requests",
  ]);
  requireString(requestSet.candidateFingerprint, "candidateFingerprint");
  requireString(requestSet.requestSetFingerprint, "requestSetFingerprint");
  if (
    !Array.isArray(requestSet.requests) ||
    requestSet.requests.length < 6 ||
    requestSet.requests.length > 12
  ) {
    throw new HttpError(400, "requests must contain between 6 and 12 items.");
  }
  const requestIds = new Set<string>();
  for (const [index, rawRequest] of requestSet.requests.entries()) {
    const request = requireObject(rawRequest, `requests[${index}]`);
    requireExactKeys(request, [
      "requestId",
      "method",
      "mode",
      "contextWithoutMedia",
      "localImageSlot",
    ]);
    const requestId = requireString(
      request.requestId,
      `requests[${index}].requestId`,
    );
    if (requestIds.has(requestId)) {
      throw new HttpError(400, `Duplicate requestId: ${requestId}.`);
    }
    requestIds.add(requestId);
    requireEnum(request.method, `requests[${index}].method`, [
      "previewSVG",
      "previewTokenURI",
    ]);
    requireEnum(request.mode, `requests[${index}].mode`, [
      "deployed-address",
      "undeployed-initcode",
    ]);
    requireObject(
      request.contextWithoutMedia,
      `requests[${index}].contextWithoutMedia`,
    );
    requireBoolean(request.localImageSlot, `requests[${index}].localImageSlot`);
  }
  return requestSet;
}

function validateExampleResultSet(value: unknown): JsonObject {
  const resultSet = requireObject(value, "Example result set");
  requireExactKeys(resultSet, [
    "candidateFingerprint",
    "requestSetFingerprint",
    "results",
  ]);
  requireString(resultSet.candidateFingerprint, "candidateFingerprint");
  requireString(resultSet.requestSetFingerprint, "requestSetFingerprint");
  if (!Array.isArray(resultSet.results) || resultSet.results.length > 12) {
    throw new HttpError(400, "results must be an array of at most 12 items.");
  }
  const requestIds = new Set<string>();
  for (const [index, rawResult] of resultSet.results.entries()) {
    const result = requireObject(rawResult, `results[${index}]`);
    requireExactKeys(
      result,
      ["requestId", "status", "resultFingerprint"],
      ["image", "error"],
    );
    const requestId = requireString(
      result.requestId,
      `results[${index}].requestId`,
    );
    if (requestIds.has(requestId)) {
      throw new HttpError(400, `Duplicate result requestId: ${requestId}.`);
    }
    requestIds.add(requestId);
    const status = requireEnum(result.status, `results[${index}].status`, [
      "ready",
      "failed",
    ]);
    requireString(
      result.resultFingerprint,
      `results[${index}].resultFingerprint`,
    );
    if (result.image !== undefined) {
      requireString(result.image, `results[${index}].image`, {
        maxLength: 600_000,
      });
    }
    if (result.error !== undefined) {
      requireString(result.error, `results[${index}].error`, {
        maxLength: 2_048,
      });
    }
    if (status === "ready" && result.image === undefined) {
      throw new HttpError(
        400,
        `results[${index}].image is required when ready.`,
      );
    }
    if (status === "failed" && result.error === undefined) {
      throw new HttpError(
        400,
        `results[${index}].error is required when failed.`,
      );
    }
  }
  return resultSet;
}

function validateApproval(value: unknown): JsonObject {
  const approval = requireObject(value, "Approval");
  requireExactKeys(approval, [
    "chainId",
    "candidateFingerprint",
    "requestSetFingerprint",
    "resultFingerprints",
  ]);
  requireInteger(approval.chainId, "chainId", { exact: CHAIN_ID });
  requireString(approval.candidateFingerprint, "candidateFingerprint");
  requireString(approval.requestSetFingerprint, "requestSetFingerprint");
  if (
    !Array.isArray(approval.resultFingerprints) ||
    approval.resultFingerprints.length < 6 ||
    approval.resultFingerprints.some((item) => typeof item !== "string")
  ) {
    throw new HttpError(
      400,
      "resultFingerprints must contain at least 6 strings.",
    );
  }
  return approval;
}

function validateDeploymentRequest(value: unknown): JsonObject {
  const deployment = requireObject(value, "Deployment request");
  requireExactKeys(deployment, [
    "chainId",
    "deployer",
    "salt",
    "initcode",
    "calldata",
    "rawByteLength",
    "predictedAddress",
    "approvalFingerprint",
  ]);
  requireInteger(deployment.chainId, "chainId", { exact: CHAIN_ID });
  requireString(deployment.deployer, "deployer", { pattern: ADDRESS_PATTERN });
  requireString(deployment.salt, "salt", { pattern: HEX_32_PATTERN });
  requireString(deployment.initcode, "initcode", {
    pattern: HEX_BYTES_PATTERN,
  });
  requireString(deployment.calldata, "calldata", {
    pattern: HEX_BYTES_PATTERN,
  });
  requireInteger(deployment.rawByteLength, "rawByteLength", {
    maximum: 94_999,
  });
  requireString(deployment.predictedAddress, "predictedAddress", {
    pattern: ADDRESS_PATTERN,
  });
  requireString(deployment.approvalFingerprint, "approvalFingerprint");
  return deployment;
}

function validateDeploymentResult(value: unknown): JsonObject {
  const result = requireObject(value, "Deployment result");
  requireExactKeys(
    result,
    ["status", "predictedAddress"],
    ["transactionHash", "message"],
  );
  requireEnum(result.status, "status", ["confirmed", "failed"]);
  requireString(result.predictedAddress, "predictedAddress", {
    pattern: ADDRESS_PATTERN,
  });
  if (result.transactionHash !== undefined) {
    requireString(result.transactionHash, "transactionHash");
  }
  if (result.message !== undefined) {
    requireString(result.message, "message");
  }
  return result;
}

function secureCapabilityMatches(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return (
    actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes)
  );
}

function corsHeaders(allowedOrigin: string): HeadersInit {
  return {
    "access-control-allow-origin": allowedOrigin,
    "cache-control": "no-store",
    vary: "Origin",
  };
}

function jsonResponse(
  body: unknown,
  status: number,
  allowedOrigin?: string,
): Response {
  const serialized = JSON.stringify(body);
  if (Buffer.byteLength(serialized) > MAX_BODY_BYTES) {
    return jsonResponse(
      { error: "Response body is too large." },
      413,
      allowedOrigin,
    );
  }
  return new Response(serialized, {
    status,
    headers: {
      ...(allowedOrigin ? corsHeaders(allowedOrigin) : {}),
      "content-type": JSON_CONTENT_TYPE,
    },
  });
}

function emptyResponse(status: number, allowedOrigin: string): Response {
  return new Response(null, {
    status,
    headers: corsHeaders(allowedOrigin),
  });
}

async function readBoundedJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "Content-Type must be application/json.");
  }

  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (!Number.isFinite(parsedLength) || parsedLength < 0) {
      throw new HttpError(400, "Content-Length is invalid.");
    }
    if (parsedLength > MAX_BODY_BYTES) {
      throw new HttpError(413, "Request body is too large.");
    }
  }

  if (!request.body) {
    throw new HttpError(400, "A JSON request body is required.");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new HttpError(413, "Request body is too large.");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new HttpError(400, "Request body must be valid UTF-8 JSON.");
  }
}

function getCandidateSummary(candidate: JsonObject): JsonObject {
  const manifest = requireObject(candidate.manifest, "manifest");
  const deployment = isObject(manifest.deployment)
    ? manifest.deployment
    : manifest;
  const initCodeHash =
    typeof deployment.initCodeHash === "string"
      ? deployment.initCodeHash
      : candidate.artifactFingerprint;
  const predictedAddress =
    typeof deployment.predictedAddress === "string"
      ? deployment.predictedAddress
      : "";
  return {
    candidateId: candidate.candidateId,
    artifactFingerprint: candidate.artifactFingerprint,
    initCodeHash,
    predictedAddress,
  };
}

function clearApprovalAndDeployment(state: SessionState): void {
  state.approval = null;
  state.deploymentRequest = null;
  state.deploymentResult = null;
}

function clearState(state: SessionState): void {
  state.candidate = null;
  state.exampleRequests = null;
  state.exampleResults = null;
  state.approval = null;
  state.deploymentRequest = null;
  state.deploymentResult = null;
}

function sameStringArray(left: unknown[], right: unknown[]): boolean {
  return (
    left.length === right.length && left.every((value, i) => value === right[i])
  );
}

function assertCurrentResults(
  state: SessionState,
  resultSet: JsonObject,
): void {
  if (!state.candidate || !state.exampleRequests) {
    throw new HttpError(409, "Candidate or request set is stale.");
  }
  if (
    resultSet.candidateFingerprint !== state.candidate.artifactFingerprint ||
    resultSet.requestSetFingerprint !==
      state.exampleRequests.requestSetFingerprint
  ) {
    throw new HttpError(409, "Candidate or request set is stale.");
  }
  const requestIds = new Set(
    (state.exampleRequests.requests as JsonObject[]).map(
      (request) => request.requestId,
    ),
  );
  if (
    (resultSet.results as JsonObject[]).some(
      (result) => !requestIds.has(result.requestId),
    )
  ) {
    throw new HttpError(409, "Result does not match the current request set.");
  }
}

function assertCurrentApproval(
  state: SessionState,
  approval: JsonObject,
): void {
  if (!state.candidate || !state.exampleRequests || !state.exampleResults) {
    throw new HttpError(409, "Candidate, request set, or results are stale.");
  }
  const readyResults = (state.exampleResults.results as JsonObject[]).filter(
    (result) => result.status === "ready",
  );
  const expectedFingerprints = readyResults.map(
    (result) => result.resultFingerprint,
  );
  if (
    approval.candidateFingerprint !== state.candidate.artifactFingerprint ||
    approval.requestSetFingerprint !==
      state.exampleRequests.requestSetFingerprint ||
    readyResults.length !==
      (state.exampleRequests.requests as JsonObject[]).length ||
    !sameStringArray(
      approval.resultFingerprints as unknown[],
      expectedFingerprints,
    )
  ) {
    throw new HttpError(409, "Candidate, request set, or results are stale.");
  }
}

function isAllowedPreflight(request: Request): boolean {
  const method = request.headers.get("access-control-request-method");
  if (!method || !["GET", "PUT", "POST", "DELETE"].includes(method)) {
    return false;
  }
  const requestedHeaders = (
    request.headers.get("access-control-request-headers") ?? ""
  )
    .split(",")
    .map((header) => header.trim().toLowerCase())
    .filter(Boolean);
  return requestedHeaders.every((header) => ALLOWED_CORS_HEADERS.has(header));
}

function preflightResponse(request: Request, allowedOrigin: string): Response {
  if (!isAllowedPreflight(request)) {
    return jsonResponse({ error: "CORS preflight denied." }, 403);
  }
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(allowedOrigin),
      "access-control-allow-headers": CORS_HEADERS,
      "access-control-allow-methods": CORS_METHODS,
      ...(request.headers.get("access-control-request-private-network") ===
      "true"
        ? { "access-control-allow-private-network": "true" }
        : {}),
      "access-control-max-age": "600",
    },
  });
}

function sha256Json(value: unknown): string {
  return `0x${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function stateFromPackage(packageValue: unknown): {
  candidate: JsonObject;
  requests: JsonObject;
} {
  rejectSourceImageFields(packageValue);
  let serializedPackage: string;
  try {
    serializedPackage = JSON.stringify(packageValue);
  } catch {
    throw new HttpError(400, "Renderer package must be JSON serializable.");
  }
  if (Buffer.byteLength(serializedPackage) > MAX_BODY_BYTES) {
    throw new HttpError(413, "Renderer package is too large.");
  }
  const rendererPackage = requireObject(packageValue, "Renderer package");
  const artifacts = requireObject(rendererPackage.artifacts, "artifacts");
  const deployment = requireObject(rendererPackage.deployment, "deployment");
  if (!Array.isArray(rendererPackage.examples)) {
    throw new HttpError(400, "examples must be an array.");
  }
  const packageWithoutExamples = Object.fromEntries(
    Object.entries(rendererPackage).filter(([key]) => key !== "examples"),
  );
  const candidateManifest = {
    ...packageWithoutExamples,
    artifacts: Object.fromEntries(
      Object.entries(artifacts).filter(
        ([key]) => key !== "creationBytecode" && key !== "runtimeBytecode",
      ),
    ),
  };
  const candidate = validateCandidate({
    candidateId: randomUUID(),
    artifactFingerprint: artifacts.artifactFingerprint,
    creationBytecode: artifacts.creationBytecode,
    runtimeBytecode: artifacts.runtimeBytecode,
    salt: deployment.salt,
    manifest: candidateManifest,
  });
  const requestSetFingerprint = sha256Json(rendererPackage.examples);
  const requests = validateExampleRequestSet({
    candidateFingerprint: artifacts.artifactFingerprint,
    requestSetFingerprint,
    requests: rendererPackage.examples.map((rawExample, index) => {
      const example = requireObject(rawExample, `examples[${index}]`);
      return {
        requestId: example.requestId,
        method: example.method,
        mode: "undeployed-initcode",
        contextWithoutMedia: example.contextWithoutMedia,
        localImageSlot: example.localImageSlot,
      };
    }),
  });
  return { candidate, requests };
}

function buildPageUrl(
  pageUrl: string,
  helperOrigin: string,
  capability: string,
  sessionId: string,
  expiresAt: string,
): string {
  const url = new URL(pageUrl);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new Error(
      "Renderer page URL must be an HTTP(S) URL without credentials.",
    );
  }
  url.hash = new URLSearchParams({
    helper: helperOrigin,
    capability,
    sessionId,
    expiresAt,
  }).toString();
  return url.toString();
}

function startLoopbackServer(
  fetchHandler: (request: Request) => Response | Promise<Response>,
): ReturnType<typeof Bun.serve> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const port = randomInt(HIGH_PORT_MIN, HIGH_PORT_MAX + 1);
    try {
      return Bun.serve({
        hostname: LOOPBACK_HOST,
        port,
        fetch: fetchHandler,
      });
    } catch (error) {
      lastError = error;
      const code = isObject(error) ? error.code : undefined;
      if (code !== "EADDRINUSE") throw error;
    }
  }
  throw new Error("Could not reserve a random loopback port.", {
    cause: lastError,
  });
}

export async function startRendererSessionHelper(
  options: StartRendererSessionHelperOptions = {},
): Promise<RendererSessionHelper> {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0 || ttlMs > MAX_TTL_MS) {
    throw new Error(`ttlMs must be between 1 and ${MAX_TTL_MS}.`);
  }

  const pageTarget = new URL(options.pageUrl ?? DEFAULT_PAGE_URL);
  if (
    !["http:", "https:"].includes(pageTarget.protocol) ||
    pageTarget.username ||
    pageTarget.password
  ) {
    throw new Error(
      "Renderer page URL must be an HTTP(S) URL without credentials.",
    );
  }
  const allowedOrigin = pageTarget.origin;
  const capability = randomBytes(32).toString("base64url");
  const sessionId = randomUUID();
  const expiresAtMs = Date.now() + ttlMs;
  const expiresAt = new Date(expiresAtMs).toISOString();
  const state: SessionState = {
    status: "ready",
    candidate: null,
    exampleRequests: null,
    exampleResults: null,
    approval: null,
    deploymentRequest: null,
    deploymentResult: null,
  };

  if (options.initialPackage !== undefined) {
    const initial = stateFromPackage(options.initialPackage);
    state.candidate = initial.candidate;
    state.exampleRequests = initial.requests;
  }

  let closed = false;
  const expire = () => {
    if (closed || state.status === "expired") return;
    clearState(state);
    state.status = "expired";
  };

  const server = startLoopbackServer(async (request) => {
    const requestOrigin = request.headers.get("origin");
    if (requestOrigin !== allowedOrigin) {
      return jsonResponse({ error: "Web origin is not allowed." }, 403);
    }
    if (request.method === "OPTIONS") {
      return preflightResponse(request, allowedOrigin);
    }

    if (Date.now() >= expiresAtMs) expire();
    if (state.status === "expired") {
      return jsonResponse(
        { error: "Renderer session expired." },
        410,
        allowedOrigin,
      );
    }

    const authorization = request.headers.get("authorization") ?? "";
    const bearerPrefix = "Bearer ";
    const suppliedCapability = authorization.startsWith(bearerPrefix)
      ? authorization.slice(bearerPrefix.length)
      : "";
    if (!secureCapabilityMatches(suppliedCapability, capability)) {
      return jsonResponse(
        { error: "Renderer capability is missing or invalid." },
        401,
        allowedOrigin,
      );
    }

    state.status = "active";
    const pathname = new URL(request.url).pathname;

    try {
      if (request.method === "GET" && pathname === "/v1/session") {
        return jsonResponse(
          { sessionId, chainId: CHAIN_ID, expiresAt, status: state.status },
          200,
          allowedOrigin,
        );
      }

      if (request.method === "GET" && pathname === "/v1/candidate") {
        return state.candidate
          ? jsonResponse(state.candidate, 200, allowedOrigin)
          : jsonResponse(
              { error: "No renderer candidate is loaded." },
              404,
              allowedOrigin,
            );
      }

      if (request.method === "PUT" && pathname === "/v1/candidate") {
        const body = await readBoundedJson(request);
        rejectSourceImageFields(body);
        const candidate = validateCandidate(body);
        state.candidate = candidate;
        state.exampleRequests = null;
        state.exampleResults = null;
        clearApprovalAndDeployment(state);
        return jsonResponse(getCandidateSummary(candidate), 200, allowedOrigin);
      }

      if (request.method === "GET" && pathname === "/v1/example-requests") {
        return state.exampleRequests
          ? jsonResponse(state.exampleRequests, 200, allowedOrigin)
          : jsonResponse(
              { error: "No example request set is loaded." },
              404,
              allowedOrigin,
            );
      }

      if (request.method === "POST" && pathname === "/v1/example-requests") {
        const body = await readBoundedJson(request);
        rejectSourceImageFields(body);
        const requestSet = validateExampleRequestSet(body);
        if (
          !state.candidate ||
          requestSet.candidateFingerprint !==
            state.candidate.artifactFingerprint
        ) {
          throw new HttpError(409, "Candidate is stale.");
        }
        state.exampleRequests = requestSet;
        state.exampleResults = null;
        clearApprovalAndDeployment(state);
        return jsonResponse(requestSet, 201, allowedOrigin);
      }

      if (request.method === "POST" && pathname === "/v1/example-results") {
        const body = await readBoundedJson(request);
        rejectSourceImageFields(body);
        const resultSet = validateExampleResultSet(body);
        assertCurrentResults(state, resultSet);
        state.exampleResults = resultSet;
        clearApprovalAndDeployment(state);
        return jsonResponse(resultSet, 200, allowedOrigin);
      }

      if (request.method === "PUT" && pathname === "/v1/approval") {
        const body = await readBoundedJson(request);
        rejectSourceImageFields(body);
        const approval = validateApproval(body);
        assertCurrentApproval(state, approval);
        state.approval = approval;
        state.deploymentRequest = null;
        state.deploymentResult = null;
        return jsonResponse(approval, 200, allowedOrigin);
      }

      if (request.method === "DELETE" && pathname === "/v1/approval") {
        clearApprovalAndDeployment(state);
        return emptyResponse(204, allowedOrigin);
      }

      if (request.method === "GET" && pathname === "/v1/deployment-request") {
        return state.deploymentRequest
          ? jsonResponse(state.deploymentRequest, 200, allowedOrigin)
          : jsonResponse(
              { error: "No deployment request is prepared." },
              404,
              allowedOrigin,
            );
      }

      if (request.method === "PUT" && pathname === "/v1/deployment-request") {
        const body = await readBoundedJson(request);
        rejectSourceImageFields(body);
        const deployment = validateDeploymentRequest(body);
        if (
          !state.approval ||
          !state.candidate ||
          deployment.salt !== state.candidate.salt
        ) {
          throw new HttpError(409, "Approval or candidate is stale.");
        }
        state.deploymentRequest = deployment;
        state.deploymentResult = null;
        return jsonResponse(deployment, 200, allowedOrigin);
      }

      if (request.method === "POST" && pathname === "/v1/deployment-result") {
        const body = await readBoundedJson(request);
        rejectSourceImageFields(body);
        const result = validateDeploymentResult(body);
        if (
          !state.deploymentRequest ||
          result.predictedAddress !== state.deploymentRequest.predictedAddress
        ) {
          throw new HttpError(409, "Deployment request is stale.");
        }
        state.deploymentResult = result;
        return jsonResponse(result, 200, allowedOrigin);
      }

      if (BODY_METHODS.has(request.method)) {
        const contentLength = Number(
          request.headers.get("content-length") ?? 0,
        );
        if (contentLength > MAX_BODY_BYTES) {
          throw new HttpError(413, "Request body is too large.");
        }
      }
      return jsonResponse({ error: "Route not found." }, 404, allowedOrigin);
    } catch (error) {
      if (error instanceof HttpError) {
        return jsonResponse(
          { error: error.message },
          error.status,
          allowedOrigin,
        );
      }
      console.error("Renderer helper request failed:", error);
      return jsonResponse(
        { error: "Renderer helper request failed." },
        500,
        allowedOrigin,
      );
    }
  });

  const origin = `http://${LOOPBACK_HOST}:${server.port}`;
  const publicPageUrl = buildPageUrl(
    pageTarget.toString(),
    origin,
    capability,
    sessionId,
    expiresAt,
  );
  const expiryTimer = setTimeout(expire, ttlMs);
  expiryTimer.unref?.();

  return {
    hostname: LOOPBACK_HOST,
    port: server.port,
    origin,
    capability,
    sessionId,
    expiresAt,
    pageUrl: publicPageUrl,
    close() {
      if (closed) return;
      closed = true;
      clearTimeout(expiryTimer);
      clearState(state);
      state.status = "closed";
      server.stop(true);
    },
  };
}

interface CliOptions {
  packagePath?: string;
  pageUrl: string;
  ttlMs: number;
}

function parseCliOptions(arguments_: string[]): CliOptions {
  const options: CliOptions = {
    pageUrl: DEFAULT_PAGE_URL,
    ttlMs: DEFAULT_TTL_MS,
  };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    const value = arguments_[index + 1];
    if (argument === "--package" && value) {
      options.packagePath = value;
      index += 1;
    } else if (argument === "--page-url" && value) {
      options.pageUrl = value;
      index += 1;
    } else if (argument === "--ttl-seconds" && value) {
      const seconds = Number(value);
      if (!Number.isSafeInteger(seconds) || seconds <= 0) {
        throw new Error("--ttl-seconds must be a positive integer.");
      }
      options.ttlMs = seconds * 1_000;
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${argument}`);
    }
  }
  return options;
}

async function readInitialPackage(path: string): Promise<unknown> {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new Error(`Renderer package does not exist: ${path}`);
  }
  if (file.size > MAX_BODY_BYTES) {
    throw new Error(`Renderer package exceeds ${MAX_BODY_BYTES} bytes.`);
  }
  try {
    return JSON.parse(await file.text());
  } catch {
    throw new Error(`Renderer package is not valid JSON: ${path}`);
  }
}

async function main(): Promise<void> {
  const cli = parseCliOptions(process.argv.slice(2));
  const initialPackage = cli.packagePath
    ? await readInitialPackage(cli.packagePath)
    : undefined;
  const helper = await startRendererSessionHelper({
    pageUrl: cli.pageUrl,
    ttlMs: cli.ttlMs,
    initialPackage,
  });

  console.log(helper.pageUrl);
  console.log(`Local renderer helper expires at ${helper.expiresAt}.`);

  const close = () => {
    helper.close();
    process.exit(0);
  };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
