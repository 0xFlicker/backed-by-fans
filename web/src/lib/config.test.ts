import { describe, expect, it } from "vitest";
import { getAddress } from "viem";
import { robinhood, robinhoodTestnet } from "viem/chains";

import {
  buildPublicConfig,
  officialMainnetUsdg,
  officialTestnetUsdg,
} from "@/lib/config";

const factory = "0x1111111111111111111111111111111111111111";
const testnetUsdg = "0x2222222222222222222222222222222222222222";
const usdgImplementation = "0x3333333333333333333333333333333333333333";
const codeHash = `0x${"ab".repeat(32)}`;
const commitments = {
  factoryRuntimeCodeHash: codeHash,
  rendererRuntimeCodeHash: codeHash,
  deployerRuntimeCodeHash: codeHash,
  usdgRuntimeCodeHash: codeHash,
  usdgImplementationAddress: usdgImplementation,
  usdgImplementationRuntimeCodeHash: codeHash,
};

describe("buildPublicConfig", () => {
  it("keeps an absent factory distinct from zero onchain state", () => {
    const config = buildPublicConfig({});

    expect(config.chainId).toBe(robinhoodTestnet.id);
    expect(config.deployment).toMatchObject({
      status: "unavailable",
      reason: "factory-not-deployed",
    });
  });

  it("pins testnet to the officially published USDG proxy", () => {
    const config = buildPublicConfig({
      chainId: String(robinhoodTestnet.id),
      factoryAddress: factory,
      ...commitments,
    });

    expect(config.deployment).toEqual({
      status: "ready",
      chainId: robinhoodTestnet.id,
      factoryAddress: getAddress(factory),
      usdgAddress: officialTestnetUsdg,
      ...commitments,
    });
  });

  it("does not let an arbitrary testnet token enable deployment", () => {
    const config = buildPublicConfig({
      chainId: String(robinhoodTestnet.id),
      factoryAddress: factory,
      usdgAddress: testnetUsdg,
      ...commitments,
      walletConnectProjectId: " project-id ",
    });

    expect(config.deployment).toMatchObject({
      status: "unavailable",
      reason: "invalid-public-config",
    });
    expect(config.walletConnectProjectId).toBe("project-id");
  });

  it("accepts the explicitly supplied official testnet proxy", () => {
    const config = buildPublicConfig({
      factoryAddress: factory,
      usdgAddress: officialTestnetUsdg,
      ...commitments,
    });

    expect(config.deployment).toMatchObject({
      status: "ready",
      usdgAddress: officialTestnetUsdg,
    });
  });

  it("rejects a malformed configured payment token", () => {
    const config = buildPublicConfig({
      factoryAddress: factory,
      usdgAddress: "not-an-address",
      ...commitments,
    });

    expect(config.deployment).toMatchObject({
      status: "unavailable",
      reason: "invalid-public-config",
    });
  });

  it("pins mainnet to the officially published USDG proxy", () => {
    const config = buildPublicConfig({
      chainId: String(robinhood.id),
      factoryAddress: factory,
      ...commitments,
    });

    expect(config.deployment).toEqual({
      status: "ready",
      chainId: robinhood.id,
      factoryAddress: getAddress(factory),
      usdgAddress: officialMainnetUsdg,
      ...commitments,
    });
  });

  it("requires every signed runtime-code commitment", () => {
    const config = buildPublicConfig({
      chainId: String(robinhood.id),
      factoryAddress: factory,
    });

    expect(config.deployment).toMatchObject({
      status: "unavailable",
      reason: "deployment-commitments-missing",
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
