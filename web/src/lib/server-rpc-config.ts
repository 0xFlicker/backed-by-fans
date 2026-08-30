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
    return requiredHttpUrl(environment.anvilRpcUrl, "Anvil RPC URL");
  }
  throw new Error(`No server RPC is supported for chain ${chainId}.`);
}
