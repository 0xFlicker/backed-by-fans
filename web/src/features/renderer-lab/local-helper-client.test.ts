import { describe, expect, it, vi } from "vitest";

import {
  HelperConnectionError,
  parseRendererHelperFragment,
  RendererHelperClient,
} from "@/features/renderer-lab/local-helper-client";

const capability = "c".repeat(43);
const sessionId = "session-123";

function fragment(helper = "http://127.0.0.1:54321") {
  return `#${new URLSearchParams({ helper, capability, sessionId })}`;
}

describe("local renderer helper client", () => {
  it("reads the exact loopback fragment into memory and immediately removes it from the URL", () => {
    const replaceState = vi.fn();

    expect(
      parseRendererHelperFragment(
        {
          hash: fragment(),
          pathname: "/renderer",
          search: "?mode=preview",
        },
        { replaceState },
      ),
    ).toEqual({
      origin: "http://127.0.0.1:54321",
      capability,
      sessionId,
    });
    expect(replaceState).toHaveBeenCalledWith(
      null,
      "",
      "/renderer?mode=preview",
    );
  });

  it.each([
    "https://127.0.0.1:54321",
    "http://localhost:54321",
    "http://192.168.1.2:54321",
    "http://127.0.0.1:80",
    "http://127.0.0.1:54321/path",
    "http://127.0.0.1:54321?target=https://example.com",
  ])("rejects a non-exact helper destination: %s", (helper) => {
    const replaceState = vi.fn();

    expect(() =>
      parseRendererHelperFragment(
        { hash: fragment(helper), pathname: "/renderer", search: "" },
        { replaceState },
      ),
    ).toThrow(/loopback helper/i);
    expect(replaceState).toHaveBeenCalledWith(null, "", "/renderer");
  });

  it("loads session and candidate with the fragment-held bearer capability", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            sessionId,
            chainId: 46_630,
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
            status: "active",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ candidateId: "candidate-1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    const client = new RendererHelperClient(
      { origin: "http://127.0.0.1:54321", capability, sessionId },
      fetcher,
    );

    await expect(client.connect()).resolves.toMatchObject({
      sessionId,
      chainId: 46_630,
    });
    await expect(client.getCandidate()).resolves.toEqual({
      candidateId: "candidate-1",
    });
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      "http://127.0.0.1:54321/v1/session",
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: `Bearer ${capability}`,
        }),
      }),
    );
  });

  it("turns CORS, local-network denial, and expiry into an explicit file-import fallback", async () => {
    const denied = new RendererHelperClient(
      { origin: "http://127.0.0.1:54321", capability, sessionId },
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    await expect(denied.connect()).rejects.toMatchObject({
      fallback: "file-import",
    });

    const expired = new RendererHelperClient(
      { origin: "http://127.0.0.1:54321", capability, sessionId },
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ error: "expired" }), { status: 410 }),
        ),
    );
    await expect(expired.connect()).rejects.toBeInstanceOf(
      HelperConnectionError,
    );
    await expect(expired.connect()).rejects.toMatchObject({
      fallback: "file-import",
    });
  });

  it("reports rendered outputs without adding source-image bytes", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ accepted: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new RendererHelperClient(
      { origin: "http://127.0.0.1:54321", capability, sessionId },
      fetcher,
    );
    const results = {
      candidateFingerprint: `0x${"11".repeat(32)}`,
      requestSetFingerprint: `0x${"22".repeat(32)}`,
      results: [
        {
          requestId: "one",
          status: "ready",
          image: "data:image/svg+xml,<svg/>",
          resultFingerprint: `0x${"33".repeat(32)}`,
        },
      ],
    };

    await client.submitExampleResults(results);

    const body = JSON.parse(fetcher.mock.calls[0][1].body as string);
    expect(body).toEqual(results);
    expect(JSON.stringify(body)).not.toMatch(/sourceImage|nativeMedia/i);
  });
});
