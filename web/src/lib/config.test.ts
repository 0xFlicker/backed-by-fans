import { getAddress } from "viem";
import { describe, expect, it } from "vitest";
import { robinhood, robinhoodTestnet } from "viem/chains";

import {
  onchainMetadataRendererAddress,
  rendererPreviewHarnessAddress,
  rendererRegistryAddress,
} from "@/contracts";
import { localAnvil } from "@/lib/chains";
import { buildPublicConfig, getDeployment } from "@/lib/config";

const testnetFactory = "0x1111111111111111111111111111111111111111";
const mainnetFactory = "0x2222222222222222222222222222222222222222";
const anvilFactory = "0x3333333333333333333333333333333333333333";
const testnetRenderer = "0x6666666666666666666666666666666666666666";
const testnetPreviewHarness = "0x7777777777777777777777777777777777777777";
const anvilRenderer = "0x8888888888888888888888888888888888888888";
const anvilPreviewHarness = "0x9999999999999999999999999999999999999999";

describe("buildPublicConfig", () => {
  it("uses generated Robinhood testnet protocol infrastructure by default", () => {
    const config = buildPublicConfig({});

    expect(getDeployment(config, robinhoodTestnet.id)).toMatchObject({
      status: "ready",
      chainId: robinhoodTestnet.id,
      rendererAddress: getAddress(
        onchainMetadataRendererAddress[robinhoodTestnet.id],
      ),
      previewHarnessAddress: getAddress(
        rendererPreviewHarnessAddress[robinhoodTestnet.id],
      ),
      rendererRegistryAddress: getAddress(
        rendererRegistryAddress[robinhoodTestnet.id],
      ),
    });
  });

  it("does not require a deployment-wide payment token", () => {
    const config = buildPublicConfig(
      {},
      {
        [robinhoodTestnet.id]: testnetFactory,
        [robinhood.id]: mainnetFactory,
      },
      {
        [robinhoodTestnet.id]: testnetRenderer,
        [robinhood.id]: mainnetFactory,
      },
      {
        [robinhoodTestnet.id]: testnetPreviewHarness,
        [robinhood.id]: mainnetFactory,
      },
    );

    expect(getDeployment(config, robinhoodTestnet.id)).toMatchObject({
      status: "ready",
      chainId: robinhoodTestnet.id,
      factoryAddress: getAddress(testnetFactory),
      rendererAddress: getAddress(testnetRenderer),
      previewHarnessAddress: getAddress(testnetPreviewHarness),
    });
    expect(getDeployment(config, robinhood.id)).toMatchObject({
      status: "unavailable",
      chainId: robinhood.id,
    });
  });

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

  it("fails fast on invalid generated protocol addresses", () => {
    expect(() =>
      buildPublicConfig(
        {},
        { [robinhoodTestnet.id]: "not-an-address" },
        { [robinhoodTestnet.id]: testnetRenderer },
        { [robinhoodTestnet.id]: testnetPreviewHarness },
      ),
    ).toThrow("MembershipFactory address for chain 46630");

    expect(() =>
      buildPublicConfig(
        {},
        { [robinhoodTestnet.id]: testnetFactory },
        { [robinhoodTestnet.id]: "not-an-address" },
        { [robinhoodTestnet.id]: testnetPreviewHarness },
      ),
    ).toThrow("Canonical renderer address for chain 46630");
  });

  it("enables Anvil only when its complete ephemeral configuration exists", () => {
    expect(() =>
      buildPublicConfig({ anvilRpcUrl: "http://127.0.0.1:8545" }, {}),
    ).toThrow("Anvil configuration requires");

    const config = buildPublicConfig(
      {
        anvilRpcUrl: "http://127.0.0.1:8545",
        anvilFactoryAddress: anvilFactory,
        anvilRendererAddress: anvilRenderer,
        anvilPreviewHarnessAddress: anvilPreviewHarness,
      },
      {},
    );

    expect(getDeployment(config, localAnvil.id)).toEqual({
      status: "ready",
      chainId: localAnvil.id,
      factoryAddress: getAddress(anvilFactory),
      rendererAddress: getAddress(anvilRenderer),
      previewHarnessAddress: getAddress(anvilPreviewHarness),
    });
  });

  it("fails fast on incomplete Anvil renderer evidence", () => {
    expect(() =>
      buildPublicConfig(
        {
          anvilRpcUrl: "http://127.0.0.1:8545",
          anvilFactoryAddress: anvilFactory,
          anvilRendererAddress: anvilRenderer,
        },
        {},
      ),
    ).toThrow("Anvil renderer evidence requires");
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
