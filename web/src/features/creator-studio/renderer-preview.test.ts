import { describe, expect, it } from "vitest";

import {
  decodeRendererDataURI,
  decodeRendererSurface,
  decodeRendererTokenURI,
} from "@/features/creator-studio/renderer-preview";

function dataURI(mime: string, value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${mime};base64,${btoa(binary)}`;
}

describe("contract renderer preview decoding", () => {
  it("decodes the complete nested token URI without changing surface bytes", () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><text>Encore ✦</text></svg>';
    const metadata = {
      name: "Backstage #7",
      description: "Permanent membership art",
      image: dataURI("image/svg+xml", svg),
      external_url: "https://backedbyfans.example",
      attributes: [{ trait_type: "State", value: "ACTIVE" }],
    };

    const decoded = decodeRendererTokenURI(
      dataURI("application/json", JSON.stringify(metadata)),
    );
    expect(decoded.metadata).toEqual(metadata);
    expect(decoded.svg).toBe(svg);
    expect(new TextDecoder().decode(decoded.svgBytes)).toBe(svg);
  });

  it("accepts a raw previewSVG contract response", () => {
    expect(decodeRendererSurface("<svg></svg>", "svg").text).toBe(
      "<svg></svg>",
    );
  });

  it.each([
    ["data:image/svg+xml,%3Csvg%3E", /Base64 encoding/i],
    ["data:image/svg+xml;base64,%%%", /malformed Base64/i],
    ["data:text/html;base64,PHN2Zz48L3N2Zz4=", /media type/i],
  ])("fails clearly for invalid data URI %s", (value, message) => {
    expect(() => decodeRendererDataURI(value, "image/svg+xml")).toThrow(
      message,
    );
  });

  it("rejects invalid UTF-8 and incomplete nested metadata", () => {
    expect(() =>
      decodeRendererDataURI("data:text/html;base64,/w==", "text/html"),
    ).toThrow(/invalid UTF-8/i);
    expect(() =>
      decodeRendererTokenURI(
        dataURI("application/json", JSON.stringify({ name: "missing" })),
      ),
    ).toThrow(/incomplete token metadata/i);
  });

  it("rejects a non-document nested surface", () => {
    const metadata = {
      name: "Tier #1",
      description: "",
      image: dataURI("image/svg+xml", "not svg"),
      external_url: "",
      attributes: [],
    };
    expect(() =>
      decodeRendererTokenURI(
        dataURI("application/json", JSON.stringify(metadata)),
      ),
    ).toThrow(/does not contain an SVG/i);
  });
});
