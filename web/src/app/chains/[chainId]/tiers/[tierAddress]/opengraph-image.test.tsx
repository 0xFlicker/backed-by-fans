// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const tier = "0x4444444444444444444444444444444444444444";
const readArtwork = vi.hoisted(() => vi.fn());

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
vi.mock("@/lib/server-catalog-artwork", () => ({
  readServerCatalogArtwork: readArtwork,
}));
vi.mock("@/lib/server-rpc", () => ({
  getServerPublicClient: () => ({}),
}));

import OpenGraphImage from "@/app/chains/[chainId]/tiers/[tierAddress]/opengraph-image";

describe("membership Open Graph image", () => {
  beforeEach(() => {
    readArtwork.mockResolvedValue({
      svg: '<svg xmlns="http://www.w3.org/2000/svg" width="510" height="510"><rect width="510" height="510" fill="#ff4f00"/></svg>',
      name: "Genesis Fans",
      symbol: "FANS",
      description: "Membership for the earliest supporters.",
    });
  });

  it("renders the membership artwork and details as a PNG social card", async () => {
    const response = await OpenGraphImage({
      params: Promise.resolve({ chainId: "46630", tierAddress: tier }),
    });
    const body = await response.arrayBuffer();

    expect(response.headers.get("content-type")).toBe("image/png");
    expect(body.byteLength).toBeGreaterThan(1_000);
    expect(readArtwork).toHaveBeenCalledOnce();
  });
});
