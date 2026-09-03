import { describe, expect, it } from "vitest";
import { getAddress } from "viem";

import { renderCatalogArtworkFallback } from "@/lib/catalog-artwork-fallback";

describe("catalog artwork fallback", () => {
  it("renders a square branded SVG for the requested membership", () => {
    const svg = renderCatalogArtworkFallback(
      getAddress("0x4444444444444444444444444444444444444444"),
    );

    expect(svg).toContain('viewBox="0 0 1200 1200"');
    expect(svg).toContain("BACKED BY FANS");
    expect(svg).toContain("Artwork is");
    expect(svg).toContain("0x4444...4444");
  });
});
