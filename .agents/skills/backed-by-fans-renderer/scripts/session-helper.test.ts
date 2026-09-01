import { afterEach, describe, expect, test } from "bun:test";

import {
  HIGH_PORT_MIN,
  MAX_BODY_BYTES,
  startRendererSessionHelper,
  type RendererSessionHelper,
} from "./session-helper";

const SITE_ORIGIN = "https://backed-by-fans.example";
const PAGE_URL = `${SITE_ORIGIN}/renderer`;
const fingerprint = `0x${"11".repeat(32)}`;
const requestSetFingerprint = `0x${"22".repeat(32)}`;
const initCodeHash = `0x${"33".repeat(32)}`;
const salt = `0x${"44".repeat(32)}`;
const predictedAddress = `0x${"55".repeat(20)}`;

const helpers = new Set<RendererSessionHelper>();

afterEach(() => {
  for (const helper of helpers) {
    helper.close();
  }
  helpers.clear();
});

async function startHelper(
  options: Parameters<typeof startRendererSessionHelper>[0] = {},
): Promise<RendererSessionHelper> {
  const helper = await startRendererSessionHelper({
    pageUrl: PAGE_URL,
    ...options,
  });
  helpers.add(helper);
  return helper;
}

function authorizedHeaders(helper: RendererSessionHelper): HeadersInit {
  return {
    authorization: `Bearer ${helper.capability}`,
    origin: SITE_ORIGIN,
  };
}

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    candidateId: "candidate-1",
    artifactFingerprint: fingerprint,
    creationBytecode: "0x6000",
    runtimeBytecode: "0x6001",
    salt,
    manifest: {
      deployment: {
        initCodeHash,
        predictedAddress,
      },
    },
    ...overrides,
  };
}

function exampleRequests() {
  return {
    candidateFingerprint: fingerprint,
    requestSetFingerprint,
    requests: Array.from({ length: 6 }, (_, index) => ({
      requestId: `request-${index + 1}`,
      method: index % 2 === 0 ? "previewSVG" : "previewTokenURI",
      mode: "undeployed-initcode",
      contextWithoutMedia: { tokenId: index + 1 },
      localImageSlot: index % 2 === 1,
    })),
  };
}

function exampleResults() {
  return {
    candidateFingerprint: fingerprint,
    requestSetFingerprint,
    results: Array.from({ length: 6 }, (_, index) => ({
      requestId: `request-${index + 1}`,
      status: "ready",
      image: `data:image/svg+xml,<svg data-index="${index}"/>`,
      resultFingerprint: `0x${(index + 1).toString(16).padStart(64, "0")}`,
    })),
  };
}

async function jsonRequest(
  helper: RendererSessionHelper,
  path: string,
  method: "POST" | "PUT",
  body: unknown,
) {
  return fetch(`${helper.origin}${path}`, {
    method,
    headers: {
      ...authorizedHeaders(helper),
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("renderer session helper", () => {
  test("binds only to loopback on random high ports and creates fragment-only capabilities", async () => {
    const first = await startHelper();
    const second = await startHelper();

    expect(first.hostname).toBe("127.0.0.1");
    expect(first.port).toBeGreaterThanOrEqual(HIGH_PORT_MIN);
    expect(first.port).toBeLessThanOrEqual(65_535);
    expect(second.port).not.toBe(first.port);
    expect(first.capability).not.toBe(second.capability);
    expect(first.capability.length).toBeGreaterThanOrEqual(43);

    const pageUrl = new URL(first.pageUrl);
    const fragment = new URLSearchParams(pageUrl.hash.slice(1));

    expect(pageUrl.origin).toBe(SITE_ORIGIN);
    expect(pageUrl.pathname).toBe("/renderer");
    expect(fragment.get("helper")).toBe(first.origin);
    expect(fragment.get("capability")).toBe(first.capability);
    expect(fragment.get("sessionId")).toBe(first.sessionId);
    expect(first.pageUrl.split("#", 1)[0]).not.toContain(first.capability);
  });

  test("answers explicit preflight and permits only the exact configured web origin", async () => {
    const helper = await startHelper();
    const allowed = await fetch(`${helper.origin}/v1/session`, {
      method: "OPTIONS",
      headers: {
        origin: SITE_ORIGIN,
        "access-control-request-method": "GET",
        "access-control-request-headers": "authorization",
        "access-control-request-private-network": "true",
      },
    });

    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("access-control-allow-origin")).toBe(
      SITE_ORIGIN,
    );
    expect(allowed.headers.get("access-control-allow-origin")).not.toBe("*");
    expect(allowed.headers.get("vary")).toContain("Origin");
    expect(allowed.headers.get("access-control-allow-private-network")).toBe(
      "true",
    );

    const denied = await fetch(`${helper.origin}/v1/session`, {
      method: "OPTIONS",
      headers: {
        origin: "https://attacker.example",
        "access-control-request-method": "GET",
      },
    });

    expect(denied.status).toBe(403);
    expect(denied.headers.has("access-control-allow-origin")).toBe(false);
  });

  test("enforces the bearer capability and destroys access when it expires", async () => {
    const helper = await startHelper({ ttlMs: 30 });

    const missing = await fetch(`${helper.origin}/v1/session`, {
      headers: { origin: SITE_ORIGIN },
    });
    expect(missing.status).toBe(401);

    const wrong = await fetch(`${helper.origin}/v1/session`, {
      headers: {
        authorization: "Bearer not-the-capability",
        origin: SITE_ORIGIN,
      },
    });
    expect(wrong.status).toBe(401);

    const accepted = await fetch(`${helper.origin}/v1/session`, {
      headers: authorizedHeaders(helper),
    });
    expect(accepted.status).toBe(200);

    await Bun.sleep(45);

    const expired = await fetch(`${helper.origin}/v1/session`, {
      headers: authorizedHeaders(helper),
    });
    expect(expired.status).toBe(410);
    expect(await expired.json()).toEqual({
      error: "Renderer session expired.",
    });
  });

  test("rejects request bodies above the bounded process-memory envelope", async () => {
    const helper = await startHelper();
    const oversized = candidate({
      manifest: { padding: "x".repeat(MAX_BODY_BYTES) },
    });

    const response = await jsonRequest(
      helper,
      "/v1/candidate",
      "PUT",
      oversized,
    );

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      error: "Request body is too large.",
    });
  });

  test("stores only bounded session state and invalidates prepared deployment on mutation", async () => {
    const helper = await startHelper();
    const requests = exampleRequests();
    const results = exampleResults();

    const putCandidate = await jsonRequest(
      helper,
      "/v1/candidate",
      "PUT",
      candidate(),
    );
    expect(putCandidate.status).toBe(200);
    expect(await putCandidate.json()).toEqual({
      candidateId: "candidate-1",
      artifactFingerprint: fingerprint,
      initCodeHash,
      predictedAddress,
    });

    const putRequests = await jsonRequest(
      helper,
      "/v1/example-requests",
      "POST",
      requests,
    );
    expect(putRequests.status).toBe(201);

    const putResults = await jsonRequest(
      helper,
      "/v1/example-results",
      "POST",
      results,
    );
    expect(putResults.status).toBe(200);

    const approval = {
      chainId: 46_630,
      candidateFingerprint: fingerprint,
      requestSetFingerprint,
      resultFingerprints: results.results.map(
        (result) => result.resultFingerprint,
      ),
    };
    expect(
      (await jsonRequest(helper, "/v1/approval", "PUT", approval)).status,
    ).toBe(200);

    const deployment = {
      chainId: 46_630,
      deployer: `0x${"66".repeat(20)}`,
      salt,
      initcode: "0x6000",
      calldata: `0x${"44".repeat(32)}6000`,
      rawByteLength: 34,
      predictedAddress,
      approvalFingerprint: `0x${"77".repeat(32)}`,
    };
    expect(
      (await jsonRequest(helper, "/v1/deployment-request", "PUT", deployment))
        .status,
    ).toBe(200);

    const getDeployment = await fetch(
      `${helper.origin}/v1/deployment-request`,
      { headers: authorizedHeaders(helper) },
    );
    expect(await getDeployment.json()).toEqual(deployment);

    await jsonRequest(helper, "/v1/candidate", "PUT", {
      ...candidate(),
      candidateId: "candidate-2",
    });

    const invalidated = await fetch(`${helper.origin}/v1/deployment-request`, {
      headers: authorizedHeaders(helper),
    });
    expect(invalidated.status).toBe(404);
  });

  test("loads a package without duplicating artifact bytes or example requests in the candidate response", async () => {
    const examples = exampleRequests().requests;
    const helper = await startHelper({
      initialPackage: {
        formatVersion: 1,
        rendererName: "Test renderer",
        artifacts: {
          sourceRoot: "/local/source",
          abi: "[]",
          artifactFingerprint: fingerprint,
          creationBytecode: "0x6000",
          runtimeBytecode: "0x6001",
        },
        deployment: { salt, initCodeHash, predictedAddress },
        examples: examples.map(
          ({ requestId, method, contextWithoutMedia, localImageSlot }) => ({
            requestId,
            method,
            contextWithoutMedia,
            localImageSlot,
          }),
        ),
      },
    });

    const candidateResponse = await fetch(`${helper.origin}/v1/candidate`, {
      headers: authorizedHeaders(helper),
    });
    const loadedCandidate = (await candidateResponse.json()) as {
      manifest: {
        artifacts: Record<string, unknown>;
        examples?: unknown;
      };
    };

    expect(candidateResponse.status).toBe(200);
    expect(loadedCandidate.manifest.examples).toBeUndefined();
    expect(loadedCandidate.manifest.artifacts.creationBytecode).toBeUndefined();
    expect(loadedCandidate.manifest.artifacts.runtimeBytecode).toBeUndefined();

    const requestsResponse = await fetch(
      `${helper.origin}/v1/example-requests`,
      { headers: authorizedHeaders(helper) },
    );
    expect(requestsResponse.status).toBe(200);
    expect((await requestsResponse.json()).requests).toHaveLength(6);
  });

  test("accepts renderer outputs but rejects source-image fields at any depth", async () => {
    const helper = await startHelper();
    const withSourceImage = candidate({
      manifest: {
        sourceImageUrl: "data:image/png;base64,creator-source",
        deployment: { initCodeHash, predictedAddress },
      },
    });

    const rejectedCandidate = await jsonRequest(
      helper,
      "/v1/candidate",
      "PUT",
      withSourceImage,
    );
    expect(rejectedCandidate.status).toBe(400);
    expect(await rejectedCandidate.json()).toEqual({
      error: "Source image data is not accepted by the local helper.",
    });

    expect(
      (await jsonRequest(helper, "/v1/candidate", "PUT", candidate())).status,
    ).toBe(200);
    expect(
      (
        await jsonRequest(
          helper,
          "/v1/example-requests",
          "POST",
          exampleRequests(),
        )
      ).status,
    ).toBe(201);

    const renderedResults = exampleResults();
    expect(
      (
        await jsonRequest(
          helper,
          "/v1/example-results",
          "POST",
          renderedResults,
        )
      ).status,
    ).toBe(200);

    const rejectedSource = await jsonRequest(
      helper,
      "/v1/example-results",
      "POST",
      {
        ...renderedResults,
        sourceImageBytes: "creator-source",
      },
    );
    expect(rejectedSource.status).toBe(400);
    expect(await rejectedSource.json()).toEqual({
      error: "Source image data is not accepted by the local helper.",
    });
  });
});
