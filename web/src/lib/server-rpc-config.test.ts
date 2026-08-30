import { describe, expect, it } from "vitest";
import { robinhood, robinhoodTestnet } from "viem/chains";

import { localAnvil } from "@/lib/chains";
import { resolveServerRpcUrl } from "@/lib/server-rpc-config";

describe("server RPC configuration", () => {
  it("resolves each chain from its server-only environment value", () => {
    const environment = {
      mainnetRpcUrl: "https://mainnet.example/rpc/",
      testnetRpcUrl: "https://testnet.example/rpc/",
      anvilRpcUrl: "http://127.0.0.1:8545/",
    };

    expect(resolveServerRpcUrl(environment, robinhood.id)).toBe(
      "https://mainnet.example/rpc",
    );
    expect(resolveServerRpcUrl(environment, robinhoodTestnet.id)).toBe(
      "https://testnet.example/rpc",
    );
    expect(resolveServerRpcUrl(environment, localAnvil.id)).toBe(
      "http://127.0.0.1:8545",
    );
  });

  it("fails closed when a private public-chain RPC is absent or malformed", () => {
    expect(() => resolveServerRpcUrl({}, robinhoodTestnet.id)).toThrow(
      "ROBINHOOD_TESTNET_RPC_URL is not configured",
    );
    expect(() =>
      resolveServerRpcUrl(
        { mainnetRpcUrl: "file:///private/rpc" },
        robinhood.id,
      ),
    ).toThrow("must use HTTP or HTTPS");
  });
});
