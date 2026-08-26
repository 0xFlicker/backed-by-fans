import { describe, expect, it } from "vitest";
import { getAddress } from "viem";
import { robinhood, robinhoodTestnet } from "viem/chains";

import { buildPublicConfig, officialMainnetUsdg } from "@/lib/config";

const factory = "0x1111111111111111111111111111111111111111";
const testnetUsdg = "0x2222222222222222222222222222222222222222";

describe("buildPublicConfig", () => {
  it("keeps an absent factory distinct from zero onchain state", () => {
    const config = buildPublicConfig({});

    expect(config.chainId).toBe(robinhoodTestnet.id);
    expect(config.deployment).toMatchObject({
      status: "unavailable",
      reason: "factory-not-deployed",
    });
  });

  it("fails closed when testnet has no confirmed USDG", () => {
    const config = buildPublicConfig({
      chainId: String(robinhoodTestnet.id),
      factoryAddress: factory,
    });

    expect(config.deployment).toMatchObject({
      status: "unavailable",
      reason: "payment-token-unconfirmed",
    });
  });

  it("accepts an explicitly configured testnet deployment", () => {
    const config = buildPublicConfig({
      chainId: String(robinhoodTestnet.id),
      factoryAddress: factory,
      usdgAddress: testnetUsdg,
      walletConnectProjectId: " project-id ",
    });

    expect(config.deployment).toEqual({
      status: "ready",
      factoryAddress: getAddress(factory),
      usdgAddress: getAddress(testnetUsdg),
    });
    expect(config.walletConnectProjectId).toBe("project-id");
  });

  it("pins mainnet to the officially published USDG proxy", () => {
    const config = buildPublicConfig({
      chainId: String(robinhood.id),
      factoryAddress: factory,
    });

    expect(config.deployment).toEqual({
      status: "ready",
      factoryAddress: getAddress(factory),
      usdgAddress: officialMainnetUsdg,
    });
  });

  it("rejects a different mainnet payment token and unsupported chain", () => {
    expect(
      buildPublicConfig({
        chainId: String(robinhood.id),
        factoryAddress: factory,
        usdgAddress: testnetUsdg,
      }).deployment,
    ).toMatchObject({ status: "unavailable", reason: "invalid-public-config" });

    expect(
      buildPublicConfig({ chainId: "1", factoryAddress: factory }).deployment,
    ).toMatchObject({ status: "unavailable", reason: "invalid-public-config" });
  });

  it("falls back from malformed public URLs without throwing", () => {
    const config = buildPublicConfig({
      mainnetRpcUrl: "file:///private/key",
      siteUrl: "not a URL",
    });

    expect(config.mainnetRpcUrl).toBe(robinhood.rpcUrls.default.http[0]);
    expect(config.siteUrl).toBe("http://localhost:3000");
  });
});
