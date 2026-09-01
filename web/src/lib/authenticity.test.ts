import { getAddress, keccak256, type Hex, type PublicClient } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/protocol/protocol-read", () => ({
  readProtocolDependencies: vi.fn(),
}));

import type {
  ProtocolDependencySnapshot,
  TierArtConfig,
  TierMediaConfig,
} from "@/contracts/types";
import { readProtocolDependencies } from "@/features/protocol/protocol-read";
import {
  getWriteGuard,
  verifyTierAuthenticity,
  type AuthenticityResult,
} from "@/lib/authenticity";
import type { ReadyDeployment } from "@/lib/config";

const factory = getAddress("0x1111111111111111111111111111111111111111");
const tier = getAddress("0x2222222222222222222222222222222222222222");
const token = getAddress("0x3333333333333333333333333333333333333333");
const renderer = getAddress("0x4444444444444444444444444444444444444444");
const mediaStoreFactory = getAddress(
  "0x5555555555555555555555555555555555555555",
);
const canonicalRenderer = getAddress(
  "0x6666666666666666666666666666666666666666",
);
const previewHarness = getAddress("0x7777777777777777777777777777777777777777");
const tierIdentity = `0x${"ab".repeat(32)}` as Hex;
const runtimeCode = "0x6000";
const art: TierArtConfig = {
  engine: 0,
  collectionSeed: 1n,
  palette: 0,
  intensity: 50,
  density: 50,
  symmetry: 50,
  typographyScale: 50,
  typographyStyle: 0,
  textVisibility: 1,
  imageFit: 0,
  focalX: 50,
  focalY: 50,
  grain: 50,
  mediaMix: 50,
  primary: 50,
  secondary: 50,
  tertiary: 50,
};
const media: TierMediaConfig = {
  mime: 0,
  store: "0x0000000000000000000000000000000000000000",
  length: 0,
  digest: `0x${"00".repeat(32)}`,
  runtimeCodehash: `0x${"00".repeat(32)}`,
};
const protocolDependencies: ProtocolDependencySnapshot = {
  chainId: 46630,
  factory,
  paymentToken: token,
  rendererSchema: `0x${"03".repeat(32)}`,
  renderer: canonicalRenderer,
  rendererName: "Founding Six",
  rendererEngineCount: 1,
  rendererEngineNames: ["Founding Engine"],
  previewHarness,
  mediaStoreFactory,
  mediaStoreFactoryRuntimeCodehash: `0x${"02".repeat(32)}`,
};
const deployment: ReadyDeployment = {
  status: "ready",
  chainId: 46630,
  factoryAddress: factory,
  usdgAddress: token,
  rendererAddress: canonicalRenderer,
  previewHarnessAddress: previewHarness,
};

function authenticityClient(
  registered: boolean,
  overrides: Record<string, unknown> = {},
  rendererCode: Hex | undefined = runtimeCode,
) {
  return {
    getBytecode: vi.fn(({ address }: { address: string }) =>
      Promise.resolve(address === renderer ? rendererCode : runtimeCode),
    ),
    readContract: vi.fn(({ functionName }: { functionName: string }) => {
      const values: Record<string, unknown> = {
        isRegisteredTier: registered,
        factory,
        paymentToken: token,
        renderer,
        rendererSchema: protocolDependencies.rendererSchema,
        tierIdentity,
        tierForIdentity: tier,
        artConfig: art,
        mediaConfig: media,
        supportsInterface: true,
        ...overrides,
      };
      return Promise.resolve(values[functionName]);
    }),
  } as unknown as PublicClient;
}

function verifiedResult(
  overrides: Partial<ProtocolDependencySnapshot> = {},
): AuthenticityResult {
  return {
    status: "verified",
    capturedBlock: 9n,
    tier,
    tierIdentity,
    renderer,
    art,
    media,
    protocolDependencies: { ...protocolDependencies, ...overrides },
  };
}

describe("tier authenticity and write guard", () => {
  beforeEach(() => {
    vi.mocked(readProtocolDependencies).mockResolvedValue({
      status: "valid",
      capturedBlock: 90n,
      data: protocolDependencies,
    });
  });

  it("prevents an unregistered contract from reaching approval", async () => {
    const result = await verifyTierAuthenticity(authenticityClient(false), {
      deployment,
      tier,
    });

    expect(result).toMatchObject({
      status: "interface-mismatch",
      failedChecks: expect.arrayContaining(["factory registration"]),
    });
    expect(
      getWriteGuard({
        deployment,
        walletChainId: 46630,
        expectedChainId: 46630,
        authenticity: result,
      }),
    ).toMatchObject({ enabled: false });
  });

  it("enables a write for a compatible direct renderer after all tier bindings verify", async () => {
    const client = authenticityClient(true);
    const result = await verifyTierAuthenticity(client, {
      deployment,
      tier,
    });

    expect(result).toMatchObject({
      status: "verified",
      capturedBlock: 90n,
      tierIdentity,
      renderer,
      protocolDependencies: { mediaStoreFactory },
    });
    expect(client.getBytecode).toHaveBeenCalledWith({
      address: renderer,
      blockNumber: 90n,
    });
    expect(client.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: renderer,
        functionName: "rendererSchema",
        blockNumber: 90n,
      }),
    );
    expect(client.readContract).not.toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "rendererVersion" }),
    );
    expect(client.readContract).not.toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "rendererRuntimeCodehash" }),
    );
    expect(
      getWriteGuard({
        deployment,
        walletChainId: 46630,
        expectedChainId: 46630,
        authenticity: result,
      }),
    ).toEqual({
      enabled: true,
      factory,
      tier,
      paymentToken: token,
      capturedBlock: 90n,
    });
  });

  it("rejects a direct renderer address without code", async () => {
    const result = await verifyTierAuthenticity(
      authenticityClient(true, {}, "0x"),
      { deployment, tier },
    );

    expect(result).toMatchObject({
      status: "interface-mismatch",
      failedChecks: expect.arrayContaining(["tier renderer code"]),
    });
  });

  it("rejects a direct renderer with the wrong interface schema", async () => {
    const client = authenticityClient(true, {
      rendererSchema: `0x${"ff".repeat(32)}`,
    });

    await expect(
      verifyTierAuthenticity(client, { deployment, tier }),
    ).resolves.toMatchObject({
      status: "interface-mismatch",
      failedChecks: expect.arrayContaining(["tier renderer schema"]),
    });
  });

  it("keeps verified contracts disabled on the wrong wallet chain", () => {
    expect(
      getWriteGuard({
        deployment,
        walletChainId: 1,
        expectedChainId: 46630,
        authenticity: verifiedResult(),
      }),
    ).toMatchObject({
      enabled: false,
      reason: expect.stringContaining("Switch"),
    });
  });

  it("keeps a verified stale deployment identity disabled", () => {
    expect(
      getWriteGuard({
        deployment,
        walletChainId: 46630,
        expectedChainId: 46630,
        authenticity: verifiedResult({
          factory: getAddress("0x9999999999999999999999999999999999999999"),
        }),
      }),
    ).toMatchObject({
      enabled: false,
      reason: expect.stringContaining("do not match"),
    });
  });

  it("classifies a missing new tier function as an interface mismatch", async () => {
    const client = authenticityClient(true);
    vi.mocked(client.readContract).mockImplementation(
      ({ functionName }: { functionName: string }) => {
        if (functionName === "artConfig") {
          return Promise.reject(
            new Error("function selector was not recognized"),
          );
        }
        const values: Record<string, unknown> = {
          isRegisteredTier: true,
          factory,
          paymentToken: token,
          renderer,
          rendererSchema: protocolDependencies.rendererSchema,
          tierIdentity,
          tierForIdentity: tier,
          mediaConfig: media,
          supportsInterface: true,
        };
        return Promise.resolve(values[functionName]);
      },
    );

    await expect(
      verifyTierAuthenticity(client, { deployment, tier }),
    ).resolves.toMatchObject({
      status: "interface-mismatch",
      failedChecks: expect.arrayContaining(["tier art config"]),
    });
  });

  it("verifies a native media record and its immutable code-store runtime", async () => {
    const store = getAddress("0x8888888888888888888888888888888888888888");
    const storeCode = "0x00ffd8ff" as const;
    const onchainMedia: TierMediaConfig = {
      mime: 1,
      store,
      length: 3,
      digest: keccak256("0xffd8ff"),
      runtimeCodehash: keccak256(storeCode),
    };
    const client = authenticityClient(true);
    vi.mocked(client.getBytecode).mockImplementation(({ address }) =>
      Promise.resolve(address === store ? storeCode : runtimeCode),
    );
    vi.mocked(client.readContract).mockImplementation(
      ({ functionName }: { functionName: string }) => {
        const values: Record<string, unknown> = {
          isRegisteredTier: true,
          factory,
          paymentToken: token,
          renderer,
          rendererSchema: protocolDependencies.rendererSchema,
          tierIdentity,
          tierForIdentity: tier,
          artConfig: art,
          mediaConfig: onchainMedia,
          supportsInterface: true,
          isRegisteredMedia: true,
          mediaRecord: {
            store,
            creator: getAddress("0x9999999999999999999999999999999999999999"),
            mime: onchainMedia.mime,
            length: onchainMedia.length,
            digest: onchainMedia.digest,
            runtimeCodehash: onchainMedia.runtimeCodehash,
          },
        };
        return Promise.resolve(values[functionName]);
      },
    );

    await expect(
      verifyTierAuthenticity(client, { deployment, tier }),
    ).resolves.toMatchObject({ status: "verified", media: onchainMedia });
  });
});
