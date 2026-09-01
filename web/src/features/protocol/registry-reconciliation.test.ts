import {
  encodeAbiParameters,
  encodeEventTopics,
  getAddress,
  keccak256,
  zeroAddress,
  type Address,
  type Hex,
  type Log,
  type PublicClient,
} from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/protocol/protocol-read", () => ({
  readProtocolDependencies: vi.fn(),
}));

import { onchainMediaStoreFactoryAbi, membershipFactoryAbi } from "@/contracts";
import type {
  ProtocolDependencySnapshot,
  TierArtConfig,
  TierMediaConfig,
} from "@/contracts/types";
import { readProtocolDependencies } from "@/features/protocol/protocol-read";
import {
  creatorMediaPageSize,
  readCreatorMediaPage,
  readConfirmedOnchainMedia,
  reconcileCreatedTier,
  reconcileStoredMedia,
  type TierPublicationConfig,
} from "@/features/protocol/registry-reconciliation";
import type { SuccessfulWriteReceipt } from "@/features/protocol/write-reconciliation";

const creator = getAddress("0x1111111111111111111111111111111111111111");
const factory = getAddress("0x2222222222222222222222222222222222222222");
const tier = getAddress("0x3333333333333333333333333333333333333333");
const otherTier = getAddress("0x4444444444444444444444444444444444444444");
const paymentToken = getAddress("0x5555555555555555555555555555555555555555");
const renderer = getAddress("0x6666666666666666666666666666666666666666");
const previewHarness = getAddress("0x9999999999999999999999999999999999999999");
const mediaStoreFactory = getAddress(
  "0x7777777777777777777777777777777777777777",
);
const tierSalt = `0x${"01".repeat(32)}` as Hex;
const tierIdentity = `0x${"02".repeat(32)}` as Hex;
const rendererSchema = `0x${"03".repeat(32)}` as Hex;
const mediaStore = getAddress("0x8888888888888888888888888888888888888888");
const creatorMediaPayload = `0x${"09".repeat(10)}` as Hex;
const creatorMediaRuntime = `0x00${creatorMediaPayload.slice(2)}` as Hex;
const art: TierArtConfig = {
  engine: 0,
  collectionSeed: 77n,
  palette: 2,
  intensity: 80,
  density: 60,
  symmetry: 40,
  typographyScale: 70,
  typographyStyle: 1,
  textVisibility: 1,
  imageFit: 0,
  focalX: 50,
  focalY: 50,
  grain: 25,
  mediaMix: 0,
  primary: 65,
  secondary: 35,
  tertiary: 20,
};
const media: TierMediaConfig = {
  mime: 0,
  store: zeroAddress,
  length: 0,
  digest: `0x${"00".repeat(32)}`,
  runtimeCodehash: `0x${"00".repeat(32)}`,
};
const protocolDependencies: ProtocolDependencySnapshot = {
  chainId: 46630,
  factory,
  paymentToken,
  rendererSchema,
  renderer,
  rendererName: "Founding Six",
  rendererEngineCount: 1,
  rendererEngineNames: ["Founding Engine"],
  previewHarness,
  mediaStoreFactory,
  mediaStoreFactoryRuntimeCodehash: `0x${"05".repeat(32)}`,
};
const config: TierPublicationConfig = {
  creator,
  tierSalt,
  renderer,
  name: "Creator membership",
  symbol: "FANS",
  pricePerPeriod: 10_000_000n,
  periodDuration: 2_592_000n,
  rewardBps: 500,
  referralBps: 100,
  supplyCap: 100n,
  maxPrepaidPeriods: 12n,
  metadata: { description: "Backstage access", externalURI: "" },
  art,
  media,
};

function tierCreatedLog(
  emittedTier: Address,
  input: { tierIndex?: bigint; identity?: Hex } = {},
) {
  return {
    address: factory,
    blockNumber: 40n,
    data: encodeAbiParameters(
      [{ type: "uint256" }, { type: "string" }, { type: "string" }],
      [input.tierIndex ?? 0n, config.name, config.symbol],
    ),
    topics: encodeEventTopics({
      abi: membershipFactoryAbi,
      eventName: "TierCreated",
      args: {
        tier: emittedTier,
        creator,
        tierIdentity: input.identity ?? tierIdentity,
      },
    }),
  } as unknown as Log;
}

function tierRendererConfiguredLog(
  input: {
    emittedTier?: Address;
    implementation?: Address;
  } = {},
) {
  return {
    address: factory,
    blockNumber: 40n,
    data: "0x",
    topics: encodeEventTopics({
      abi: membershipFactoryAbi,
      eventName: "TierRendererConfigured",
      args: {
        tier: input.emittedTier ?? tier,
        renderer: input.implementation ?? renderer,
      },
    }),
  } as unknown as Log;
}

function receipt(logs: Log[]) {
  return {
    status: "success",
    blockNumber: 40n,
    logs,
  } as unknown as SuccessfulWriteReceipt;
}

function publicationReceipt(
  createdLog: Log,
  rendererLog: Log = tierRendererConfiguredLog(),
) {
  return receipt([createdLog, rendererLog]);
}

function mediaStoredLog(payload: Hex, runtimeCodehash?: Hex) {
  const runtimeCode = `0x00${payload.slice(2)}` as Hex;
  return {
    address: mediaStoreFactory,
    blockNumber: 40n,
    data: encodeAbiParameters(
      [{ type: "uint8" }, { type: "uint32" }, { type: "bytes32" }],
      [1, (payload.length - 2) / 2, runtimeCodehash ?? keccak256(runtimeCode)],
    ),
    topics: encodeEventTopics({
      abi: onchainMediaStoreFactoryAbi,
      eventName: "MediaStored",
      args: { creator, store: mediaStore, digest: keccak256(payload) },
    }),
  } as Log;
}

function mediaReconciliationClient(
  payload: Hex,
  input: { predictedStore?: Address } = {},
) {
  const runtimeCode = `0x00${payload.slice(2)}` as Hex;
  return {
    getBlockNumber: vi.fn(async () => 50n),
    getBytecode: vi.fn(async () => runtimeCode),
    readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
      const values: Record<string, unknown> = {
        mediaStore,
        predictStore: input.predictedStore ?? mediaStore,
        isRegisteredMedia: true,
        mediaRecord: {
          store: mediaStore,
          creator,
          mime: 1,
          length: (payload.length - 2) / 2,
          digest: keccak256(payload),
          runtimeCodehash: keccak256(runtimeCode),
        },
      };
      return values[functionName];
    }),
  } as unknown as PublicClient;
}

function creatorMediaClient(
  input: { recordCreator?: Address; runtimeCode?: Hex } = {},
) {
  return {
    getBlockNumber: vi.fn(async () => 50n),
    getBytecode: vi.fn(async () => input.runtimeCode ?? creatorMediaRuntime),
    readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
      if (functionName === "creatorMediaCount") return 7n;
      if (functionName === "creatorMedia") {
        return [
          {
            store: mediaStore,
            creator: input.recordCreator ?? creator,
            mime: 1,
            length: 10,
            digest: keccak256(creatorMediaPayload),
            runtimeCodehash: keccak256(creatorMediaRuntime),
          },
        ];
      }
      throw new Error(`Unexpected read ${functionName}`);
    }),
  } as unknown as PublicClient;
}

function reconciliationClient(
  input: {
    registeredTier?: Address;
    returnedArt?: TierArtConfig;
    publishedConfig?: TierPublicationConfig;
    mediaCreator?: Address;
  } = {},
) {
  const publishedConfig = input.publishedConfig ?? config;
  return {
    getBlockNumber: vi.fn(async () => 50n),
    readContract: vi.fn(
      async ({
        address,
        functionName,
      }: {
        address: Address;
        functionName: string;
      }) => {
        if (address === factory) {
          const factoryValues: Record<string, unknown> = {
            predictTierIdentity: tierIdentity,
            tiers: [input.registeredTier ?? tier],
            isRegisteredTier: true,
            isTierSaltUsed: true,
            tierForIdentity: input.registeredTier ?? tier,
          };
          return factoryValues[functionName];
        }
        if (address === mediaStoreFactory) {
          const registryValues: Record<string, unknown> = {
            isRegisteredMedia: true,
            mediaRecord: {
              store: publishedConfig.media.store,
              creator: input.mediaCreator ?? publishedConfig.creator,
              mime: publishedConfig.media.mime,
              length: publishedConfig.media.length,
              digest: publishedConfig.media.digest,
              runtimeCodehash: publishedConfig.media.runtimeCodehash,
            },
          };
          return registryValues[functionName];
        }
        const fields: Record<string, unknown> = {
          owner: creator,
          factory,
          paymentToken,
          renderer,
          tierIdentity,
          name: publishedConfig.name,
          symbol: publishedConfig.symbol,
          pricePerPeriod: publishedConfig.pricePerPeriod,
          periodDuration: publishedConfig.periodDuration,
          rewardBps: publishedConfig.rewardBps,
          referralBps: publishedConfig.referralBps,
          supplyCap: publishedConfig.supplyCap,
          maxPrepaidPeriods: publishedConfig.maxPrepaidPeriods,
          description: publishedConfig.metadata.description,
          externalURI: publishedConfig.metadata.externalURI,
          artConfig: input.returnedArt ?? art,
          mediaConfig: publishedConfig.media,
        };
        return fields[functionName];
      },
    ),
  } as unknown as PublicClient;
}

describe("created-tier reconciliation", () => {
  beforeEach(() => {
    vi.mocked(readProtocolDependencies).mockResolvedValue({
      status: "valid",
      capturedBlock: 50n,
      data: protocolDependencies,
    });
  });

  it("verifies the exact identity, direct renderer, and immutable launch config", async () => {
    await expect(
      reconcileCreatedTier(reconciliationClient(), {
        protocolDependencies,
        config,
        receipt: publicationReceipt(tierCreatedLog(tier)),
      }),
    ).resolves.toBe(tier);
  });

  it("uses the receipt index when another creator took the prior slot", async () => {
    await expect(
      reconcileCreatedTier(reconciliationClient(), {
        protocolDependencies,
        config,
        receipt: publicationReceipt(tierCreatedLog(tier, { tierIndex: 1n })),
      }),
    ).resolves.toBe(tier);
  });

  it("does not substitute another registered tier", async () => {
    await expect(
      reconcileCreatedTier(
        reconciliationClient({ registeredTier: otherTier }),
        {
          protocolDependencies,
          config,
          receipt: publicationReceipt(tierCreatedLog(tier)),
        },
      ),
    ).resolves.toBeUndefined();
  });

  it("requires the receipt identity to match the creator salt", async () => {
    await expect(
      reconcileCreatedTier(reconciliationClient(), {
        protocolDependencies,
        config,
        receipt: publicationReceipt(
          tierCreatedLog(tier, { identity: `0x${"ff".repeat(32)}` }),
        ),
      }),
    ).resolves.toBeUndefined();
  });

  it("rejects a tier whose immutable art differs from the signed config", async () => {
    await expect(
      reconcileCreatedTier(
        reconciliationClient({ returnedArt: { ...art, palette: 3 } }),
        {
          protocolDependencies,
          config,
          receipt: publicationReceipt(tierCreatedLog(tier)),
        },
      ),
    ).resolves.toBeUndefined();
  });

  it("requires the renderer event to match the requested direct address", async () => {
    await expect(
      reconcileCreatedTier(reconciliationClient(), {
        protocolDependencies,
        config,
        receipt: publicationReceipt(
          tierCreatedLog(tier),
          tierRendererConfiguredLog({
            implementation: otherTier,
          }),
        ),
      }),
    ).resolves.toBeUndefined();

    await expect(
      reconcileCreatedTier(reconciliationClient(), {
        protocolDependencies,
        config,
        receipt: receipt([tierCreatedLog(tier)]),
      }),
    ).resolves.toBeUndefined();
  });

  it("requires onchain media to remain attributed to the publishing creator", async () => {
    const onchainConfig: TierPublicationConfig = {
      ...config,
      media: {
        mime: 2,
        store: getAddress("0x8888888888888888888888888888888888888888"),
        length: 120,
        digest: `0x${"05".repeat(32)}`,
        runtimeCodehash: `0x${"06".repeat(32)}`,
      },
    };

    await expect(
      reconcileCreatedTier(
        reconciliationClient({
          publishedConfig: onchainConfig,
          mediaCreator: otherTier,
        }),
        {
          protocolDependencies,
          config: onchainConfig,
          receipt: publicationReceipt(tierCreatedLog(tier)),
        },
      ),
    ).resolves.toBeUndefined();
  });

  it("rejects a partially populated generated-media configuration", async () => {
    const malformedConfig: TierPublicationConfig = {
      ...config,
      media: { ...media, length: 1 },
    };

    await expect(
      reconcileCreatedTier(
        reconciliationClient({ publishedConfig: malformedConfig }),
        {
          protocolDependencies,
          config: malformedConfig,
          receipt: publicationReceipt(tierCreatedLog(tier)),
        },
      ),
    ).resolves.toBeUndefined();
  });
});

describe("stored-media reconciliation", () => {
  const payload = "0xffd8ffe000104a464946" as const;

  beforeEach(() => {
    vi.mocked(readProtocolDependencies).mockResolvedValue({
      status: "valid",
      capturedBlock: 50n,
      data: protocolDependencies,
    });
  });

  it("confirms the causal event, content-addressed registry, and runtime bytes", async () => {
    await expect(
      reconcileStoredMedia(mediaReconciliationClient(payload), {
        protocolDependencies,
        creator,
        payload,
        mime: 1,
        receipt: receipt([mediaStoredLog(payload)]),
      }),
    ).resolves.toMatchObject({
      mime: 1,
      store: mediaStore,
      length: 10,
      digest: keccak256(payload),
    });
  });

  it("reconciles an idempotent duplicate store even when no new event is emitted", async () => {
    await expect(
      reconcileStoredMedia(mediaReconciliationClient(payload), {
        protocolDependencies,
        creator,
        payload,
        mime: 1,
        receipt: receipt([]),
      }),
    ).resolves.toMatchObject({ store: mediaStore });
  });

  it("rejects a registry pointer that differs from deterministic prediction", async () => {
    await expect(
      reconcileStoredMedia(
        mediaReconciliationClient(payload, { predictedStore: otherTier }),
        {
          protocolDependencies,
          creator,
          payload,
          mime: 1,
          receipt: receipt([mediaStoredLog(payload)]),
        },
      ),
    ).resolves.toBeUndefined();
  });

  it("rejects a causal event whose runtime identity differs from the registry", async () => {
    await expect(
      reconcileStoredMedia(mediaReconciliationClient(payload), {
        protocolDependencies,
        creator,
        payload,
        mime: 1,
        receipt: receipt([mediaStoredLog(payload, `0x${"ff".repeat(32)}`)]),
      }),
    ).resolves.toBeUndefined();
  });

  it("recovers a confirmed onchain pointer from current registry and runtime proof", async () => {
    await expect(
      readConfirmedOnchainMedia(mediaReconciliationClient(payload), {
        protocolDependencies,
        creator,
        store: mediaStore,
      }),
    ).resolves.toMatchObject({
      mime: 1,
      store: mediaStore,
      length: 10,
      digest: keccak256(payload),
    });
  });

  it("rejects a recovered pointer whose runtime bytes no longer match", async () => {
    const client = mediaReconciliationClient(payload);
    vi.mocked(client.getBytecode).mockResolvedValue("0x00ff");

    await expect(
      readConfirmedOnchainMedia(client, {
        protocolDependencies,
        creator,
        store: mediaStore,
      }),
    ).resolves.toBeUndefined();
  });
});

describe("creator media discovery", () => {
  beforeEach(() => {
    vi.mocked(readProtocolDependencies).mockResolvedValue({
      status: "valid",
      capturedBlock: 50n,
      data: protocolDependencies,
    });
  });

  it("reads one bounded creator page against the revalidated registry snapshot", async () => {
    const client = creatorMediaClient();

    await expect(
      readCreatorMediaPage(client, {
        protocolDependencies,
        creator,
        offset: 6n,
      }),
    ).resolves.toEqual({
      records: [
        {
          store: mediaStore,
          creator,
          mime: 1,
          length: 10,
          digest: keccak256(creatorMediaPayload),
          runtimeCodehash: keccak256(creatorMediaRuntime),
          payload: creatorMediaPayload,
        },
      ],
      total: 7n,
      offset: 6n,
      limit: creatorMediaPageSize,
    });
    expect(client.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "creatorMedia",
        args: [creator, 6n, BigInt(creatorMediaPageSize)],
        blockNumber: 50n,
      }),
    );
    expect(client.getBytecode).toHaveBeenCalledWith({
      address: mediaStore,
      blockNumber: 50n,
    });
  });

  it("rejects a saved image whose stored payload no longer matches its record", async () => {
    await expect(
      readCreatorMediaPage(creatorMediaClient({ runtimeCode: "0x00ff" }), {
        protocolDependencies,
        creator,
        offset: 6n,
      }),
    ).resolves.toBeUndefined();
  });

  it("rejects a page containing media attributed to another creator", async () => {
    await expect(
      readCreatorMediaPage(creatorMediaClient({ recordCreator: otherTier }), {
        protocolDependencies,
        creator,
        offset: 0n,
      }),
    ).resolves.toBeUndefined();
  });

  it("rejects an unbounded client page request before touching the RPC", async () => {
    const client = creatorMediaClient();
    await expect(
      readCreatorMediaPage(client, {
        protocolDependencies,
        creator,
        offset: 0n,
        limit: 101,
      }),
    ).resolves.toBeUndefined();
    expect(client.getBlockNumber).not.toHaveBeenCalled();
  });
});
