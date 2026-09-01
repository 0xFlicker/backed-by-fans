import {
  getAddress,
  keccak256,
  parseEventLogs,
  sliceHex,
  size,
  zeroAddress,
  zeroHash,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";

import {
  membershipTierAbi,
  onchainMediaStoreFactoryAbi,
  membershipFactoryAbi,
} from "@/contracts";
import type {
  ProtocolDependencySnapshot,
  TierArtConfig,
  TierMediaConfig,
} from "@/contracts/types";
import { readProtocolDependencies } from "@/features/protocol/protocol-read";
import type { SuccessfulWriteReceipt } from "@/features/protocol/write-reconciliation";
import { isSameAddress } from "@/lib/address";

export type TierPublicationConfig = {
  creator: Address;
  tierSalt: Hex;
  renderer: Address;
  name: string;
  symbol: string;
  pricePerPeriod: bigint;
  periodDuration: bigint;
  rewardBps: number;
  referralBps: number;
  supplyCap: bigint;
  maxPrepaidPeriods: bigint;
  metadata: {
    description: string;
    externalURI: string;
  };
  art: TierArtConfig;
  media: TierMediaConfig;
};

export type ConfirmedOnchainMedia = TierMediaConfig & {
  mime: 1 | 2;
};

export type CreatorMediaRecord = {
  store: Address;
  creator: Address;
  mime: 1 | 2;
  length: number;
  digest: Hex;
  runtimeCodehash: Hex;
  payload: Hex;
};

export type CreatorMediaPage = {
  records: readonly CreatorMediaRecord[];
  total: bigint;
  offset: bigint;
  limit: number;
};

export const creatorMediaPageSize = 6;

const artFields = [
  "engine",
  "collectionSeed",
  "palette",
  "intensity",
  "density",
  "symmetry",
  "typographyScale",
  "typographyStyle",
  "textVisibility",
  "imageFit",
  "focalX",
  "focalY",
  "grain",
  "mediaMix",
  "primary",
  "secondary",
  "tertiary",
] as const satisfies readonly (keyof TierArtConfig)[];

const mediaFields = [
  "mime",
  "store",
  "length",
  "digest",
  "runtimeCodehash",
] as const satisfies readonly (keyof TierMediaConfig)[];

function sameRecord<T extends object>(
  left: T,
  right: T,
  fields: readonly (keyof T)[],
) {
  return fields.every((field) => {
    const leftValue = left[field];
    const rightValue = right[field];
    if (
      typeof leftValue === "string" &&
      typeof rightValue === "string" &&
      leftValue.startsWith("0x") &&
      rightValue.startsWith("0x")
    ) {
      return leftValue.toLowerCase() === rightValue.toLowerCase();
    }
    return leftValue === rightValue;
  });
}

function sameImmutableProtocolDependencies(
  left: ProtocolDependencySnapshot,
  right: ProtocolDependencySnapshot,
) {
  return (
    left.chainId === right.chainId &&
    isSameAddress(left.factory, right.factory) &&
    isSameAddress(left.paymentToken, right.paymentToken) &&
    left.rendererSchema === right.rendererSchema &&
    isSameAddress(left.renderer, right.renderer) &&
    isSameAddress(left.previewHarness, right.previewHarness) &&
    isSameAddress(left.mediaStoreFactory, right.mediaStoreFactory) &&
    left.mediaStoreFactoryRuntimeCodehash ===
      right.mediaStoreFactoryRuntimeCodehash
  );
}

/** Reads one bounded page from the connected creator's permanent registry. */
export async function readCreatorMediaPage(
  client: PublicClient,
  input: {
    protocolDependencies: ProtocolDependencySnapshot;
    creator: Address;
    offset: bigint;
    limit?: number;
  },
): Promise<CreatorMediaPage | undefined> {
  const limit = input.limit ?? creatorMediaPageSize;
  if (
    isSameAddress(input.creator, zeroAddress) ||
    input.offset < 0n ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100
  ) {
    return undefined;
  }

  const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
  const freshProtocol = await readProtocolDependencies(
    client,
    {
      status: "ready",
      chainId: input.protocolDependencies.chainId,
      factoryAddress: input.protocolDependencies.factory,
      usdgAddress: input.protocolDependencies.paymentToken,
      rendererAddress: input.protocolDependencies.renderer,
      previewHarnessAddress: input.protocolDependencies.previewHarness,
    },
    blockNumber,
  );
  if (
    freshProtocol.status !== "valid" ||
    !sameImmutableProtocolDependencies(
      input.protocolDependencies,
      freshProtocol.data,
    )
  ) {
    return undefined;
  }

  const [total, page] = await Promise.all([
    client.readContract({
      address: freshProtocol.data.mediaStoreFactory,
      abi: onchainMediaStoreFactoryAbi,
      functionName: "creatorMediaCount",
      args: [input.creator],
      blockNumber,
    }),
    client.readContract({
      address: freshProtocol.data.mediaStoreFactory,
      abi: onchainMediaStoreFactoryAbi,
      functionName: "creatorMedia",
      args: [input.creator, input.offset, BigInt(limit)],
      blockNumber,
    }),
  ]);

  const remaining = total > input.offset ? total - input.offset : 0n;
  const expectedLength = remaining > BigInt(limit) ? limit : Number(remaining);
  if (page.length !== expectedLength) return undefined;
  const records: Omit<CreatorMediaRecord, "payload">[] = [];
  for (const record of page) {
    if (
      !isSameAddress(record.creator, input.creator) ||
      isSameAddress(record.store, zeroAddress) ||
      (record.mime !== 1 && record.mime !== 2) ||
      record.length === 0
    ) {
      return undefined;
    }
    records.push({
      store: getAddress(record.store),
      creator: getAddress(record.creator),
      mime: record.mime,
      length: record.length,
      digest: record.digest,
      runtimeCodehash: record.runtimeCodehash,
    });
  }

  const recordsWithPayload = await Promise.all(
    records.map(async (record): Promise<CreatorMediaRecord | undefined> => {
      const code = await client.getBytecode({
        address: record.store,
        blockNumber,
      });
      if (
        !code ||
        !code.startsWith("0x00") ||
        size(code) !== record.length + 1 ||
        keccak256(code) !== record.runtimeCodehash
      ) {
        return undefined;
      }
      const payload = sliceHex(code, 1);
      if (keccak256(payload) !== record.digest) return undefined;
      return { ...record, payload };
    }),
  );
  if (recordsWithPayload.some((record) => !record)) return undefined;

  return {
    records: recordsWithPayload as CreatorMediaRecord[],
    total,
    offset: input.offset,
    limit,
  };
}

export async function reconcileStoredMedia(
  client: PublicClient,
  input: {
    protocolDependencies: ProtocolDependencySnapshot;
    creator: Address;
    payload: Hex;
    mime: 1 | 2;
    receipt: SuccessfulWriteReceipt;
  },
): Promise<ConfirmedOnchainMedia | undefined> {
  const length = size(input.payload);
  if (length === 0 || length > 0xffff_ffff) return undefined;
  const digest = keccak256(input.payload);
  const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
  if (blockNumber < input.receipt.blockNumber) return undefined;

  const freshProtocol = await readProtocolDependencies(
    client,
    {
      status: "ready",
      chainId: input.protocolDependencies.chainId,
      factoryAddress: input.protocolDependencies.factory,
      usdgAddress: input.protocolDependencies.paymentToken,
      rendererAddress: input.protocolDependencies.renderer,
      previewHarnessAddress: input.protocolDependencies.previewHarness,
    },
    blockNumber,
  );
  if (
    freshProtocol.status !== "valid" ||
    !sameImmutableProtocolDependencies(
      input.protocolDependencies,
      freshProtocol.data,
    )
  ) {
    return undefined;
  }

  const events = parseEventLogs({
    abi: onchainMediaStoreFactoryAbi,
    eventName: "MediaStored",
    logs: input.receipt.logs,
    strict: true,
  }).filter(
    (event) =>
      isSameAddress(event.address, freshProtocol.data.mediaStoreFactory) &&
      isSameAddress(event.args.creator, input.creator) &&
      event.args.digest === digest &&
      event.args.mime === input.mime &&
      event.args.length === length,
  );
  if (events.length > 1) return undefined;

  const [mappedStore, predictedStore] = await Promise.all([
    client.readContract({
      address: freshProtocol.data.mediaStoreFactory,
      abi: onchainMediaStoreFactoryAbi,
      functionName: "mediaStore",
      args: [input.creator, input.mime, length, digest],
      blockNumber,
    }),
    client.readContract({
      address: freshProtocol.data.mediaStoreFactory,
      abi: onchainMediaStoreFactoryAbi,
      functionName: "predictStore",
      args: [input.creator, input.payload, input.mime],
      blockNumber,
    }),
  ]);
  if (
    !isSameAddress(mappedStore, predictedStore) ||
    (events.length === 1 && !isSameAddress(events[0].args.store, mappedStore))
  ) {
    return undefined;
  }

  const [registered, record, code] = await Promise.all([
    client.readContract({
      address: freshProtocol.data.mediaStoreFactory,
      abi: onchainMediaStoreFactoryAbi,
      functionName: "isRegisteredMedia",
      args: [mappedStore],
      blockNumber,
    }),
    client.readContract({
      address: freshProtocol.data.mediaStoreFactory,
      abi: onchainMediaStoreFactoryAbi,
      functionName: "mediaRecord",
      args: [mappedStore],
      blockNumber,
    }),
    client.getBytecode({ address: mappedStore, blockNumber }),
  ]);
  if (
    !registered ||
    !isSameAddress(record.store, mappedStore) ||
    !isSameAddress(record.creator, input.creator) ||
    record.mime !== input.mime ||
    record.length !== length ||
    record.digest !== digest ||
    (events.length === 1 &&
      events[0].args.runtimeCodehash !== record.runtimeCodehash) ||
    !code ||
    code === "0x" ||
    (code.length - 2) / 2 !== length + 1 ||
    keccak256(code) !== record.runtimeCodehash
  ) {
    return undefined;
  }

  return {
    mime: input.mime,
    store: mappedStore,
    length,
    digest,
    runtimeCodehash: record.runtimeCodehash,
  };
}

export async function readConfirmedOnchainMedia(
  client: PublicClient,
  input: {
    protocolDependencies: ProtocolDependencySnapshot;
    creator: Address;
    store: Address;
  },
): Promise<ConfirmedOnchainMedia | undefined> {
  const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
  const freshProtocol = await readProtocolDependencies(
    client,
    {
      status: "ready",
      chainId: input.protocolDependencies.chainId,
      factoryAddress: input.protocolDependencies.factory,
      usdgAddress: input.protocolDependencies.paymentToken,
      rendererAddress: input.protocolDependencies.renderer,
      previewHarnessAddress: input.protocolDependencies.previewHarness,
    },
    blockNumber,
  );
  if (
    freshProtocol.status !== "valid" ||
    !sameImmutableProtocolDependencies(
      input.protocolDependencies,
      freshProtocol.data,
    )
  ) {
    return undefined;
  }

  const [registered, record, code] = await Promise.all([
    client.readContract({
      address: freshProtocol.data.mediaStoreFactory,
      abi: onchainMediaStoreFactoryAbi,
      functionName: "isRegisteredMedia",
      args: [input.store],
      blockNumber,
    }),
    client.readContract({
      address: freshProtocol.data.mediaStoreFactory,
      abi: onchainMediaStoreFactoryAbi,
      functionName: "mediaRecord",
      args: [input.store],
      blockNumber,
    }),
    client.getBytecode({ address: input.store, blockNumber }),
  ]);
  if (
    !registered ||
    !isSameAddress(record.store, input.store) ||
    !isSameAddress(record.creator, input.creator) ||
    (record.mime !== 1 && record.mime !== 2) ||
    record.length === 0 ||
    !code ||
    !code.startsWith("0x00") ||
    size(code) !== record.length + 1 ||
    keccak256(code) !== record.runtimeCodehash
  ) {
    return undefined;
  }

  const payload = sliceHex(code, 1);
  if (keccak256(payload) !== record.digest) return undefined;

  return {
    mime: record.mime,
    store: record.store,
    length: record.length,
    digest: record.digest,
    runtimeCodehash: record.runtimeCodehash,
  };
}

async function onchainMediaMatchesRegistry(
  client: PublicClient,
  protocol: ProtocolDependencySnapshot,
  config: TierPublicationConfig,
  blockNumber: bigint,
) {
  if (isSameAddress(config.media.store, zeroAddress)) {
    return (
      config.media.mime === 0 &&
      config.media.length === 0 &&
      config.media.digest === zeroHash &&
      config.media.runtimeCodehash === zeroHash
    );
  }
  if (
    (config.media.mime !== 1 && config.media.mime !== 2) ||
    !Number.isInteger(config.media.length) ||
    config.media.length < 1 ||
    config.media.digest === zeroHash ||
    config.media.runtimeCodehash === zeroHash
  ) {
    return false;
  }
  const [registered, record] = await Promise.all([
    client.readContract({
      address: protocol.mediaStoreFactory,
      abi: onchainMediaStoreFactoryAbi,
      functionName: "isRegisteredMedia",
      args: [config.media.store],
      blockNumber,
    }),
    client.readContract({
      address: protocol.mediaStoreFactory,
      abi: onchainMediaStoreFactoryAbi,
      functionName: "mediaRecord",
      args: [config.media.store],
      blockNumber,
    }),
  ]);
  return (
    registered &&
    isSameAddress(record.creator, config.creator) &&
    isSameAddress(record.store, config.media.store) &&
    record.mime === config.media.mime &&
    record.length === config.media.length &&
    record.digest === config.media.digest &&
    record.runtimeCodehash === config.media.runtimeCodehash
  );
}

async function matchesLaunchTerms(
  client: PublicClient,
  tier: Address,
  protocol: ProtocolDependencySnapshot,
  config: TierPublicationConfig,
  expectedIdentity: Hex,
  blockNumber: bigint,
) {
  const [
    owner,
    factory,
    paymentToken,
    renderer,
    tierIdentity,
    name,
    symbol,
    price,
    duration,
    rewardBps,
    referralBps,
    supplyCap,
    maxPrepaidPeriods,
    description,
    externalURI,
    art,
    media,
  ] = await Promise.all([
    client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "owner",
      blockNumber,
    }),
    client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "factory",
      blockNumber,
    }),
    client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "paymentToken",
      blockNumber,
    }),
    client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "renderer",
      blockNumber,
    }),
    client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "tierIdentity",
      blockNumber,
    }),
    client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "name",
      blockNumber,
    }),
    client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "symbol",
      blockNumber,
    }),
    client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "pricePerPeriod",
      blockNumber,
    }),
    client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "periodDuration",
      blockNumber,
    }),
    client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "rewardBps",
      blockNumber,
    }),
    client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "referralBps",
      blockNumber,
    }),
    client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "supplyCap",
      blockNumber,
    }),
    client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "maxPrepaidPeriods",
      blockNumber,
    }),
    client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "description",
      blockNumber,
    }),
    client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "externalURI",
      blockNumber,
    }),
    client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "artConfig",
      blockNumber,
    }),
    client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "mediaConfig",
      blockNumber,
    }),
  ]);

  return (
    isSameAddress(owner, config.creator) &&
    isSameAddress(factory, protocol.factory) &&
    isSameAddress(paymentToken, protocol.paymentToken) &&
    isSameAddress(renderer, config.renderer) &&
    tierIdentity === expectedIdentity &&
    name === config.name &&
    symbol === config.symbol &&
    price === config.pricePerPeriod &&
    duration === config.periodDuration &&
    rewardBps === config.rewardBps &&
    referralBps === config.referralBps &&
    supplyCap === config.supplyCap &&
    maxPrepaidPeriods === config.maxPrepaidPeriods &&
    description === config.metadata.description &&
    externalURI === config.metadata.externalURI &&
    sameRecord(art, config.art, artFields) &&
    sameRecord(media, config.media, mediaFields) &&
    (await onchainMediaMatchesRegistry(client, protocol, config, blockNumber))
  );
}

export async function reconcileCreatedTier(
  client: PublicClient,
  input: {
    protocolDependencies: ProtocolDependencySnapshot;
    config: TierPublicationConfig;
    receipt: SuccessfulWriteReceipt;
  },
): Promise<Address | undefined> {
  const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
  if (blockNumber < input.receipt.blockNumber) return undefined;

  const freshProtocol = await readProtocolDependencies(
    client,
    {
      status: "ready",
      chainId: input.protocolDependencies.chainId,
      factoryAddress: input.protocolDependencies.factory,
      usdgAddress: input.protocolDependencies.paymentToken,
      rendererAddress: input.protocolDependencies.renderer,
      previewHarnessAddress: input.protocolDependencies.previewHarness,
    },
    blockNumber,
  );
  if (
    freshProtocol.status !== "valid" ||
    !sameImmutableProtocolDependencies(
      input.protocolDependencies,
      freshProtocol.data,
    )
  ) {
    return undefined;
  }

  const expectedIdentity = await client.readContract({
    address: freshProtocol.data.factory,
    abi: membershipFactoryAbi,
    functionName: "predictTierIdentity",
    args: [input.config.creator, input.config.tierSalt],
    blockNumber,
  });
  const events = parseEventLogs({
    abi: membershipFactoryAbi,
    eventName: "TierCreated",
    logs: input.receipt.logs,
    strict: true,
  }).filter(
    (event) =>
      isSameAddress(event.address, freshProtocol.data.factory) &&
      isSameAddress(event.args.creator, input.config.creator) &&
      event.args.tierIdentity === expectedIdentity &&
      event.args.name === input.config.name &&
      event.args.symbol === input.config.symbol,
  );
  if (events.length !== 1) return undefined;

  const tier = getAddress(events[0].args.tier);
  const rendererEvents = parseEventLogs({
    abi: membershipFactoryAbi,
    eventName: "TierRendererConfigured",
    logs: input.receipt.logs,
    strict: true,
  }).filter(
    (event) =>
      isSameAddress(event.address, freshProtocol.data.factory) &&
      isSameAddress(event.args.tier, tier) &&
      isSameAddress(event.args.renderer, input.config.renderer),
  );
  if (rendererEvents.length !== 1) return undefined;

  const [registeredPage, registered, saltUsed, identityTier] =
    await Promise.all([
      client.readContract({
        address: freshProtocol.data.factory,
        abi: membershipFactoryAbi,
        functionName: "tiers",
        args: [events[0].args.tierIndex, 1n],
        blockNumber,
      }),
      client.readContract({
        address: freshProtocol.data.factory,
        abi: membershipFactoryAbi,
        functionName: "isRegisteredTier",
        args: [tier],
        blockNumber,
      }),
      client.readContract({
        address: freshProtocol.data.factory,
        abi: membershipFactoryAbi,
        functionName: "isTierSaltUsed",
        args: [input.config.creator, input.config.tierSalt],
        blockNumber,
      }),
      client.readContract({
        address: freshProtocol.data.factory,
        abi: membershipFactoryAbi,
        functionName: "tierForIdentity",
        args: [expectedIdentity],
        blockNumber,
      }),
    ]);
  if (
    registeredPage.length !== 1 ||
    !isSameAddress(registeredPage[0], tier) ||
    !registered ||
    !saltUsed ||
    !isSameAddress(identityTier, tier)
  ) {
    return undefined;
  }

  return (await matchesLaunchTerms(
    client,
    tier,
    freshProtocol.data,
    input.config,
    expectedIdentity,
    blockNumber,
  ))
    ? tier
    : undefined;
}
