import { beforeEach, describe, expect, it, vi } from "vitest";

const tier = "0x4444444444444444444444444444444444444444";
const artwork = vi.hoisted(() => vi.fn());

vi.mock("@/lib/chains", () => ({
  parseSupportedChainId: () => 46_630,
}));
vi.mock("@/lib/config", () => ({
  getDeployment: () => ({
    status: "ready",
    chainId: 46_630,
    factoryAddress: "0x1111111111111111111111111111111111111111",
    rendererAddress: "0x2222222222222222222222222222222222222222",
    previewHarnessAddress: "0x3333333333333333333333333333333333333333",
  }),
  publicConfig: {},
}));
vi.mock("@/lib/direct-read", () => ({
  validateTierRouteParam: () => tier,
}));
vi.mock("@/lib/server-catalog-artwork", () => ({
  readServerCatalogArtwork: artwork,
}));
vi.mock("@/lib/server-rpc", () => ({
  getServerPublicClient: () => ({}),
}));

import { GET } from "@/app/api/chains/[chainId]/tiers/[tierAddress]/artwork/route";

const context = {
  params: Promise.resolve({ chainId: "46630", tierAddress: tier }),
};

describe("membership artwork route", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("serves rendered artwork with long-lived stale-if-error caching", async () => {
    const revision = `0x${"77".repeat(32)}`;
    artwork.mockResolvedValue({
      svg: '<svg xmlns="http://www.w3.org/2000/svg"/>',
      etag: '"artwork"',
      revision,
      capturedBlock: 123n,
    });

    const response = await GET(
      new Request(`https://example.com/artwork?v=${revision}`),
      context,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "image/svg+xml; charset=utf-8",
    );
    expect(response.headers.get("x-backed-by-fans-artwork")).toBe("rendered");
    expect(response.headers.get("vercel-cdn-cache-control")).toContain(
      "stale-if-error=86400",
    );
  });

  it("serves a briefly cached SVG fallback when rendering fails", async () => {
    artwork.mockRejectedValue(new Error("RPC unavailable"));

    const response = await GET(
      new Request("https://example.com/artwork?v=0xabc"),
      context,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "image/svg+xml; charset=utf-8",
    );
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=0, must-revalidate",
    );
    expect(response.headers.get("vercel-cdn-cache-control")).toBe(
      "public, max-age=15",
    );
    expect(response.headers.get("x-backed-by-fans-artwork")).toBe("fallback");
    await expect(response.text()).resolves.toContain("Artwork is");
  });
});
