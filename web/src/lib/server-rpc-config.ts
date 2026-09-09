import { robinhood, robinhoodTestnet } from "viem/chains";

import { localAnvil, type SupportedChainId } from "@/lib/chains";

export type ServerRpcEnvironment = {
  mainnetRpcUrl?: string;
  testnetRpcUrl?: string;
  anvilRpcUrl?: string;
};

function requiredHttpUrl(value: string | undefined, label: string) {
  const candidate = value?.trim();
  if (!candidate) throw new Error(`${label} is not configured.`);

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error(`${label} is not a valid URL.`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${label} must use HTTP or HTTPS.`);
  }
  return url.toString().replace(/\/$/, "");
}

export function resolveServerRpcUrl(
  environment: ServerRpcEnvironment,
  chainId: SupportedChainId,
) {
  if (chainId === robinhoodTestnet.id) {
    return requiredHttpUrl(
      environment.testnetRpcUrl,
      "ROBINHOOD_TESTNET_RPC_URL",
    );
  }
  if (chainId === robinhood.id) {
    return requiredHttpUrl(
      environment.mainnetRpcUrl,
      "ROBINHOOD_MAINNET_RPC_URL",
    );
  }
  if (chainId === localAnvil.id) {
    const endpoint = requiredHttpUrl(environment.anvilRpcUrl, "Anvil RPC URL");
    const url = new URL(endpoint);
    if (
      url.protocol !== "http:" ||
      !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
      !url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      throw new Error(
        "Anvil RPC must be an uncredentialed loopback HTTP endpoint.",
      );
    return endpoint;
  }
  throw new Error(`No server RPC is supported for chain ${chainId}.`);
}
