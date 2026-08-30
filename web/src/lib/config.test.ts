import { describe, expect, it } from "vitest";
import { getAddress } from "viem";
import { robinhood, robinhoodTestnet } from "viem/chains";

import { localAnvil } from "@/lib/chains";
import {
  buildPublicConfig,
  getDeployment,
  officialMainnetUsdg,
} from "@/lib/config";

const testnetFactory = "0x1111111111111111111111111111111111111111";
const mainnetFactory = "0x2222222222222222222222222222222222222222";
const anvilFactory = "0x3333333333333333333333333333333333333333";
const anvilUsdg = "0x4444444444444444444444444444444444444444";
const testnetUsdg = "0x5555555555555555555555555555555555555555";

describe("buildPublicConfig", () => {
  it("keeps both public networks available while reporting absent deployments", () => {
    const config = buildPublicConfig({}, {});

    expect(config.defaultChainId).toBe(robinhoodTestnet.id);
    expect(getDeployment(config, robinhoodTestnet.id)).toMatchObject({
      status: "unavailable",
      reason: "factory-not-deployed",
      chainId: robinhoodTestnet.id,
    });
    expect(getDeployment(config, robinhood.id)).toMatchObject({
      status: "unavailable",
      reason: "factory-not-deployed",
      chainId: robinhood.id,
    });
  });

  it("binds generated addresses to each chain's canonical USDG", () => {
    const config = buildPublicConfig(
      {},
      {
        [robinhoodTestnet.id]: testnetFactory,
        [robinhood.id]: mainnetFactory,
      },
      {
        [robinhoodTestnet.id]: testnetUsdg,
        [robinhood.id]: officialMainnetUsdg,
      },
    );

    expect(config.defaultChainId).toBe(robinhood.id);
    expect(getDeployment(config, robinhoodTestnet.id)).toEqual({
      status: "ready",
      chainId: robinhoodTestnet.id,
      factoryAddress: getAddress(testnetFactory),
      usdgAddress: getAddress(testnetUsdg),
    });
    expect(getDeployment(config, robinhood.id)).toEqual({
      status: "ready",
      chainId: robinhood.id,
      factoryAddress: getAddress(mainnetFactory),
      usdgAddress: officialMainnetUsdg,
    });
  });

  it("defaults to testnet until a generated mainnet deployment exists", () => {
    const config = buildPublicConfig(
      {},
      { [robinhoodTestnet.id]: testnetFactory },
      { [robinhoodTestnet.id]: testnetUsdg },
    );

    expect(config.defaultChainId).toBe(robinhoodTestnet.id);
  });

  it("supports a mainnet-only generated deployment", () => {
    const config = buildPublicConfig(
      {},
      { [robinhood.id]: mainnetFactory },
      { [robinhood.id]: officialMainnetUsdg },
    );

    expect(config.defaultChainId).toBe(robinhood.id);
    expect(getDeployment(config, robinhood.id)).toMatchObject({
      status: "ready",
      chainId: robinhood.id,
    });
    expect(getDeployment(config, robinhoodTestnet.id)).toMatchObject({
      status: "unavailable",
      chainId: robinhoodTestnet.id,
    });
  });

  it("fails fast on an invalid generated address", () => {
    expect(() =>
      buildPublicConfig(
        {},
        { [robinhoodTestnet.id]: "not-an-address" },
        { [robinhoodTestnet.id]: testnetUsdg },
      ),
    ).toThrow("MembershipFactory address for chain 46630");
  });

  it("enables Anvil only when its complete ephemeral configuration exists", () => {
    expect(() =>
      buildPublicConfig({ anvilRpcUrl: "http://127.0.0.1:8545" }, {}),
    ).toThrow("Anvil configuration requires");

    const config = buildPublicConfig(
      {
        anvilRpcUrl: "http://127.0.0.1:8545",
        anvilFactoryAddress: anvilFactory,
        anvilUsdgAddress: anvilUsdg,
      },
      {},
    );

    expect(getDeployment(config, localAnvil.id)).toEqual({
      status: "ready",
      chainId: localAnvil.id,
      factoryAddress: getAddress(anvilFactory),
      usdgAddress: getAddress(anvilUsdg),
    });
  });

  it("rejects unsupported networks without changing the default", () => {
    const config = buildPublicConfig({}, {});

    expect(getDeployment(config, 1)).toMatchObject({
      status: "unavailable",
      reason: "unsupported-chain",
      chainId: robinhoodTestnet.id,
    });
  });

  it("falls back from a malformed public site URL without throwing", () => {
    const config = buildPublicConfig({ siteUrl: "not a URL" }, {});

    expect(config.siteUrl).toBe("http://localhost:3000");
  });
});
