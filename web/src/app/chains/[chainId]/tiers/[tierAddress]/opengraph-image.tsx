import { ImageResponse } from "next/og";
import { getAddress } from "viem";

import { BackingStackMark } from "@/components/BackingStackMark";
import { parseSupportedChainId } from "@/lib/chains";
import { getDeployment, publicConfig } from "@/lib/config";
import { validateTierRouteParam } from "@/lib/direct-read";
import { readServerCatalogArtwork } from "@/lib/server-catalog-artwork";
import { getServerPublicClient } from "@/lib/server-rpc";

export const alt = "Backed By Fans membership";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 300;
export const runtime = "nodejs";

type OpenGraphImageProps = {
  params: Promise<{ chainId: string; tierAddress: string }>;
};

function fitName(name: string) {
  if (name.length > 32) return 44;
  if (name.length > 22) return 52;
  return 64;
}

function fitDescription(description: string) {
  const compact = description.replace(/\s+/g, " ").trim();
  if (compact.length <= 180) return compact;
  return `${compact.slice(0, 177).trimEnd()}…`;
}

export default async function OpenGraphImage({ params }: OpenGraphImageProps) {
  const { chainId: rawChainId, tierAddress } = await params;
  const chainId = parseSupportedChainId(rawChainId);
  const tier = validateTierRouteParam(tierAddress);

  let artwork:
    | {
        svg: string;
        name: string;
        symbol: string;
        description: string;
      }
    | undefined;

  if (chainId && tier) {
    const deployment = getDeployment(publicConfig, chainId);
    if (deployment.status === "ready") {
      try {
        artwork = await readServerCatalogArtwork(
          getServerPublicClient(chainId),
          deployment,
          getAddress(tier),
        );
      } catch (error) {
        console.error("Failed to render membership social card.", {
          chainId,
          tier,
          error,
        });
      }
    }
  }

  const name = artwork?.name || "Creator membership";
  const symbol = artwork?.symbol || "MEMBERSHIP";
  const description = fitDescription(
    artwork?.description ||
      "Support independent work with a creator-owned onchain membership.",
  );
  const artworkUrl = artwork
    ? `data:image/svg+xml;base64,${Buffer.from(artwork.svg).toString("base64")}`
    : undefined;

  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: "#f7f2e8",
        color: "#11131a",
        display: "flex",
        height: "100%",
        justifyContent: "space-between",
        padding: "60px",
        width: "100%",
      }}
    >
      <div
        style={{
          alignItems: "center",
          background: "#11131a",
          borderRadius: "26px",
          display: "flex",
          height: "510px",
          justifyContent: "center",
          overflow: "hidden",
          width: "510px",
        }}
      >
        {artworkUrl ? (
          <img
            alt=""
            height="510"
            src={artworkUrl}
            style={{ height: "510px", objectFit: "cover", width: "510px" }}
            width="510"
          />
        ) : (
          <BackingStackMark
            style={{ color: "#f7f2e8", height: "270px", width: "270px" }}
            title="Backing Stack"
          />
        )}
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "510px",
          justifyContent: "space-between",
          width: "520px",
        }}
      >
        <div style={{ alignItems: "center", display: "flex" }}>
          <BackingStackMark
            style={{ height: "44px", marginRight: "16px", width: "44px" }}
            title="Backing Stack"
          />
          <span style={{ fontSize: 25, fontWeight: 600 }}>Backed By Fans</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <span
            style={{
              alignSelf: "flex-start",
              border: "2px solid #11131a",
              borderRadius: "999px",
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: "0.08em",
              padding: "8px 15px",
            }}
          >
            {symbol}
          </span>
          <span
            style={{
              fontSize: fitName(name),
              fontWeight: 650,
              letterSpacing: "-0.04em",
              lineHeight: 1,
              marginTop: "24px",
            }}
          >
            {name}
          </span>
          <span
            style={{
              fontSize: 25,
              lineHeight: 1.35,
              marginTop: "24px",
              opacity: 0.72,
            }}
          >
            {description}
          </span>
        </div>

        <span
          style={{
            fontSize: 19,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          Creator-owned membership
        </span>
      </div>
    </div>,
    size,
  );
}
