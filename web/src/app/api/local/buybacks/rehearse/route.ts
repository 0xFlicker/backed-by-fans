import { getDeployment, publicConfig } from "@/lib/config";
import {
  parseRehearsalInput,
  rehearseBuybacks,
} from "../../../../../../scripts/buyback-rehearsal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function POST(request: Request) {
  const url = new URL(request.url);
  // Local operator configuration gate. Rehearsal itself uses stateless RPC simulation.
  if (
    process.env.VERCEL ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
  )
    return Response.json(
      { error: "Rehearsal runs only on the local development server." },
      { status: 403 },
    );
  // Next may normalize request.url to localhost even when the browser used
  // 127.0.0.1. Match the actual Host header, while requiring a loopback origin.
  const origin = request.headers.get("origin") ?? "";
  const originUrl = URL.canParse(origin) ? new URL(origin) : undefined;
  if (
    !originUrl ||
    !["127.0.0.1", "localhost", "[::1]"].includes(originUrl.hostname) ||
    origin !== `${url.protocol}//${request.headers.get("host")}` ||
    request.headers.get("content-type")?.split(";")[0] !== "application/json"
  )
    return Response.json(
      { error: "Use the local buyback settings page." },
      { status: 403 },
    );
  const rpc = publicConfig.anvilRpcUrl;
  const deployment = getDeployment(publicConfig, 31337);
  if (!rpc || deployment.status !== "ready")
    return Response.json(
      { error: "Start the local protocol fork first." },
      { status: 503 },
    );
  const rpcUrl = new URL(rpc);
  if (
    rpcUrl.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(rpcUrl.hostname)
  )
    return Response.json(
      { error: "Rehearsal requires the configured local Anvil RPC." },
      { status: 403 },
    );
  const signal = AbortSignal.any([
    request.signal,
    AbortSignal.timeout(120_000),
  ]);
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error("Settings are required");
    const cancelBody = () => {
      void reader.cancel(signal.reason);
    };
    signal.addEventListener("abort", cancelBody, { once: true });
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        signal.throwIfAborted();
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 32768) {
          await reader.cancel();
          throw new Error("Settings exceed the request size limit");
        }
        chunks.push(value);
      }
    } finally {
      signal.removeEventListener("abort", cancelBody);
    }
    signal.throwIfAborted();
    const input = parseRehearsalInput(
      JSON.parse(Buffer.concat(chunks).toString("utf8")),
    );
    if (input.factory.toLowerCase() !== deployment.factoryAddress.toLowerCase())
      throw new Error(
        "The configured factory changed. Refresh the settings page.",
      );
    return Response.json(await rehearseBuybacks(rpc, input, signal), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Rehearsal failed";
    if (/missing bytecode for code hash|BlockOutOfRangeError/i.test(message))
      return Response.json(
        {
          error:
            "This fork snapshot is no longer readable. Rehearse again to use a fresh block.",
        },
        { status: 400 },
      );
    return Response.json(
      {
        error: message
          .replace(/https?:\/\/[^\s]+/g, "[RPC endpoint]")
          .slice(0, 1500),
      },
      { status: 400 },
    );
  }
}
