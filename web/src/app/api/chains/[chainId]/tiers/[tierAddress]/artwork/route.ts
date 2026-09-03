import { getAddress } from "viem";

import { getDeployment, publicConfig } from "@/lib/config";
import { parseSupportedChainId } from "@/lib/chains";
import { validateTierRouteParam } from "@/lib/direct-read";
import { readServerCatalogArtwork } from "@/lib/server-catalog-artwork";
import { getServerPublicClient } from "@/lib/server-rpc";

export const runtime = "nodejs";

const browserCache = "public, max-age=60, stale-while-revalidate=60";
const edgeCache =
  "public, max-age=300, stale-while-revalidate=3600, stale-if-error=86400";

export async function GET(
  request: Request,
  context: {
    params: Promise<{ chainId: string; tierAddress: string }>;
  },
) {
  const { chainId: rawChainId, tierAddress } = await context.params;
  const chainId = parseSupportedChainId(rawChainId);
  const tier = validateTierRouteParam(tierAddress);
  if (!chainId || !tier) {
    return Response.json(
      { error: "Unsupported membership artwork route." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  const deployment = getDeployment(publicConfig, chainId);
  if (deployment.status !== "ready") {
    return Response.json(
      { error: deployment.detail },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const artwork = await readServerCatalogArtwork(
      getServerPublicClient(chainId),
      deployment,
      getAddress(tier),
    );
    const url = new URL(request.url);
    const requestedRevision = url.searchParams.get("v");
    if (requestedRevision !== artwork.revision) {
      url.searchParams.set("v", artwork.revision);
      return Response.redirect(url, 307);
    }
    if (request.headers.get("if-none-match") === artwork.etag) {
      return new Response(null, {
        status: 304,
        headers: {
          "Cache-Control": browserCache,
          "Vercel-CDN-Cache-Control": edgeCache,
          ETag: artwork.etag,
        },
      });
    }

    return new Response(artwork.svg, {
      headers: {
        "Cache-Control": browserCache,
        "Content-Type": "image/svg+xml; charset=utf-8",
        ETag: artwork.etag,
        "Vercel-CDN-Cache-Control": edgeCache,
        "X-Backed-By-Fans-Block": artwork.capturedBlock.toString(),
      },
    });
  } catch (error) {
    console.error("Failed to render catalog artwork.", {
      chainId,
      tier,
      error,
    });
    return Response.json(
      { error: "The collection artwork is temporarily unavailable." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
