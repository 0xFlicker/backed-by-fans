import { isAddress, isHash, type Address, type Hash } from "viem";

import type { TierConfig } from "@/features/creator/config";

export const pendingWriteStorageKey = "backed-by-fans.pending-write.v1";

export type WriteIntent =
  | {
      kind: "create-tier";
      factory: Address;
      fromIndex: bigint;
      config: TierConfig;
    }
  | {
      kind: "protocol-fee-recipient";
      factory: Address;
      previous: Address;
      expected: Address;
      fromBlock: bigint;
    }
  | {
      kind: "protocol-withdrawal";
      factory: Address;
      paymentToken: Address;
      recipient: Address;
      amount: bigint;
      fromBlock: bigint;
    }
  | {
      kind: "protocol-pending-owner";
      factory: Address;
      previous: Address;
      expected: Address;
      fromBlock: bigint;
    }
  | {
      kind: "protocol-accept-owner";
      factory: Address;
      previousOwner: Address;
      expected: Address;
      fromBlock: bigint;
    }
  | {
      kind: "tier-paused";
      tier: Address;
      previous: boolean;
      expected: boolean;
      fromBlock: bigint;
    }
  | {
      kind: "tier-supply-cap";
      tier: Address;
      previous: bigint;
      expected: bigint;
      fromBlock: bigint;
    }
  | {
      kind: "tier-prepayment";
      tier: Address;
      previous: bigint;
      expected: bigint;
      fromBlock: bigint;
    }
  | {
      kind: "tier-metadata";
      tier: Address;
      description: string;
      imageURI: string;
      externalURI: string;
      previousDescription: string;
      previousImageURI: string;
      previousExternalURI: string;
      fromBlock: bigint;
    }
  | {
      kind: "tier-grant";
      tier: Address;
      recipient: Address;
      tokenId: bigint;
      baselineTimestamp: bigint;
      baselinePaidSeconds: bigint;
      baselineGrantSeconds: bigint;
      grantedSeconds: bigint;
      fromBlock: bigint;
    }
  | {
      kind: "tier-revoke-grant";
      tier: Address;
      tokenId: bigint;
      previousGrantSeconds: bigint;
      fromBlock: bigint;
    }
  | {
      kind: "tier-refund";
      tier: Address;
      tokenId: bigint;
      recipient: Address;
      tierOwner: Address;
      fromBlock: bigint;
    }
  | {
      kind: "tier-withdrawal";
      tier: Address;
      owner: Address;
      amount: bigint;
      fromBlock: bigint;
    }
  | {
      kind: "tier-pending-owner";
      tier: Address;
      previous: Address;
      expected: Address;
      fromBlock: bigint;
    }
  | {
      kind: "tier-accept-owner";
      tier: Address;
      previousOwner: Address;
      expected: Address;
      fromBlock: bigint;
    }
  | {
      kind: "membership-payment";
      tier: Address;
      payer: Address;
      recipient: Address;
      gross: bigint;
      periods: bigint;
      fromBlock: bigint;
      minimumExpiration: bigint;
      minimumShares: bigint;
      referralStatus: 0 | 1 | 2;
    }
  | {
      kind: "membership-gift";
      tier: Address;
      payer: Address;
      recipient: Address;
      gross: bigint;
      periods: bigint;
      fromBlock: bigint;
      minimumExpiration: bigint;
    }
  | {
      kind: "reward-claim";
      tier: Address;
      tokenId: bigint;
      owner: Address;
      amount: bigint;
      fromBlock: bigint;
    }
  | {
      kind: "referral-claim";
      tier: Address;
      referrer: Address;
      amount: bigint;
      fromBlock: bigint;
    }
  | {
      kind: "synchronize";
      tier: Address;
      tokenId: bigint;
      previousOccupied: boolean;
      previousActive: boolean;
      fromBlock: bigint;
    };

export type PendingWrite = {
  version: 1;
  id: string;
  contextKey: string;
  label: string;
  armedAt: number;
  intent: WriteIntent;
  hash?: Hash;
  replacementHash?: Hash;
  replacementReason?: "repriced" | "replaced" | "cancelled";
};

export type DurableRecoveryResolution =
  | { status: "reconciled"; result?: unknown }
  | { status: "uncertain"; error?: string }
  | { status: "reverted" | "cancelled"; error: string };

export class PendingWriteStorageError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PendingWriteStorageError";
  }
}

const bigintTag = "$backedByFansBigInt";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasAddress(value: Record<string, unknown>, key: string) {
  return typeof value[key] === "string" && isAddress(value[key]);
}

function hasBigint(value: Record<string, unknown>, key: string) {
  return typeof value[key] === "bigint" && value[key] >= 0n;
}

function hasPositiveBigint(value: Record<string, unknown>, key: string) {
  return typeof value[key] === "bigint" && value[key] > 0n;
}

function hasString(value: Record<string, unknown>, key: string) {
  return typeof value[key] === "string";
}

function validTierConfig(value: unknown): value is TierConfig {
  if (!isRecord(value) || !isRecord(value.metadata)) return false;
  return (
    hasAddress(value, "creator") &&
    hasString(value, "name") &&
    hasString(value, "symbol") &&
    hasBigint(value, "pricePerPeriod") &&
    hasBigint(value, "periodDuration") &&
    typeof value.rewardBps === "number" &&
    typeof value.referralBps === "number" &&
    hasBigint(value, "supplyCap") &&
    hasBigint(value, "maxPrepaidPeriods") &&
    hasString(value.metadata, "description") &&
    hasString(value.metadata, "imageURI") &&
    hasString(value.metadata, "externalURI")
  );
}

function validWriteIntent(value: unknown): value is WriteIntent {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  const tier = () => hasAddress(value, "tier");
  const factory = () => hasAddress(value, "factory");
  switch (value.kind) {
    case "create-tier":
      return (
        factory() &&
        hasBigint(value, "fromIndex") &&
        validTierConfig(value.config)
      );
    case "protocol-fee-recipient":
    case "protocol-pending-owner":
      return (
        factory() &&
        hasAddress(value, "previous") &&
        hasAddress(value, "expected") &&
        hasBigint(value, "fromBlock")
      );
    case "protocol-accept-owner":
      return (
        factory() &&
        hasAddress(value, "previousOwner") &&
        hasAddress(value, "expected") &&
        hasBigint(value, "fromBlock")
      );
    case "protocol-withdrawal":
      return (
        factory() &&
        hasAddress(value, "paymentToken") &&
        hasAddress(value, "recipient") &&
        hasBigint(value, "amount") &&
        hasBigint(value, "fromBlock")
      );
    case "tier-paused":
      return (
        tier() &&
        typeof value.previous === "boolean" &&
        typeof value.expected === "boolean" &&
        hasBigint(value, "fromBlock")
      );
    case "tier-supply-cap":
    case "tier-prepayment":
      return (
        tier() &&
        hasBigint(value, "previous") &&
        hasBigint(value, "expected") &&
        hasBigint(value, "fromBlock")
      );
    case "tier-metadata":
      return (
        tier() &&
        hasString(value, "description") &&
        hasString(value, "imageURI") &&
        hasString(value, "externalURI") &&
        hasString(value, "previousDescription") &&
        hasString(value, "previousImageURI") &&
        hasString(value, "previousExternalURI") &&
        hasBigint(value, "fromBlock")
      );
    case "tier-grant":
      return (
        tier() &&
        hasAddress(value, "recipient") &&
        hasBigint(value, "tokenId") &&
        hasBigint(value, "baselineTimestamp") &&
        hasBigint(value, "baselinePaidSeconds") &&
        hasBigint(value, "baselineGrantSeconds") &&
        hasPositiveBigint(value, "grantedSeconds") &&
        hasBigint(value, "fromBlock")
      );
    case "membership-gift":
      return (
        tier() &&
        hasAddress(value, "payer") &&
        hasAddress(value, "recipient") &&
        hasBigint(value, "gross") &&
        hasBigint(value, "periods") &&
        hasBigint(value, "fromBlock") &&
        hasBigint(value, "minimumExpiration")
      );
    case "tier-revoke-grant":
      return (
        tier() &&
        hasBigint(value, "tokenId") &&
        hasBigint(value, "previousGrantSeconds") &&
        hasBigint(value, "fromBlock")
      );
    case "synchronize":
      return (
        tier() &&
        hasBigint(value, "tokenId") &&
        typeof value.previousOccupied === "boolean" &&
        typeof value.previousActive === "boolean" &&
        hasBigint(value, "fromBlock")
      );
    case "tier-refund":
      return (
        tier() &&
        hasBigint(value, "tokenId") &&
        hasAddress(value, "recipient") &&
        hasAddress(value, "tierOwner") &&
        hasBigint(value, "fromBlock")
      );
    case "tier-withdrawal":
      return (
        tier() &&
        hasAddress(value, "owner") &&
        hasBigint(value, "amount") &&
        hasBigint(value, "fromBlock")
      );
    case "tier-pending-owner":
      return (
        tier() &&
        hasAddress(value, "previous") &&
        hasAddress(value, "expected") &&
        hasBigint(value, "fromBlock")
      );
    case "tier-accept-owner":
      return (
        tier() &&
        hasAddress(value, "previousOwner") &&
        hasAddress(value, "expected") &&
        hasBigint(value, "fromBlock")
      );
    case "membership-payment":
      return (
        tier() &&
        hasAddress(value, "payer") &&
        hasAddress(value, "recipient") &&
        hasBigint(value, "gross") &&
        hasBigint(value, "periods") &&
        hasBigint(value, "fromBlock") &&
        hasBigint(value, "minimumExpiration") &&
        hasBigint(value, "minimumShares") &&
        (value.referralStatus === 0 ||
          value.referralStatus === 1 ||
          value.referralStatus === 2)
      );
    case "reward-claim":
      return (
        tier() &&
        hasBigint(value, "tokenId") &&
        hasAddress(value, "owner") &&
        hasBigint(value, "amount") &&
        hasBigint(value, "fromBlock")
      );
    case "referral-claim":
      return (
        tier() &&
        hasAddress(value, "referrer") &&
        hasBigint(value, "amount") &&
        hasBigint(value, "fromBlock")
      );
    default:
      return false;
  }
}

function validPendingWrite(value: unknown): value is PendingWrite {
  if (!isRecord(value)) return false;
  const hasReplacementHash = value.replacementHash !== undefined;
  const hasReplacementReason = value.replacementReason !== undefined;
  return (
    value.version === 1 &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.contextKey === "string" &&
    value.contextKey.length > 0 &&
    typeof value.label === "string" &&
    value.label.length > 0 &&
    typeof value.armedAt === "number" &&
    Number.isSafeInteger(value.armedAt) &&
    validWriteIntent(value.intent) &&
    (value.hash === undefined ||
      (typeof value.hash === "string" && isHash(value.hash))) &&
    (value.replacementHash === undefined ||
      (typeof value.replacementHash === "string" &&
        isHash(value.replacementHash))) &&
    (value.replacementReason === undefined ||
      value.replacementReason === "repriced" ||
      value.replacementReason === "replaced" ||
      value.replacementReason === "cancelled") &&
    hasReplacementHash === hasReplacementReason &&
    (!hasReplacementHash || value.hash !== undefined)
  );
}

function stringify(value: PendingWrite) {
  return JSON.stringify(value, (_key, item: unknown) =>
    typeof item === "bigint" ? { [bigintTag]: item.toString() } : item,
  );
}

function parse(raw: string): unknown {
  return JSON.parse(raw, (_key, item: unknown) => {
    if (
      isRecord(item) &&
      Object.keys(item).length === 1 &&
      typeof item[bigintTag] === "string" &&
      /^(0|[1-9][0-9]*)$/.test(item[bigintTag])
    ) {
      return BigInt(item[bigintTag]);
    }
    return item;
  });
}

export function loadPendingWrite(storage: Storage): PendingWrite | undefined {
  let raw: string | null;
  try {
    raw = storage.getItem(pendingWriteStorageKey);
  } catch (error) {
    throw new PendingWriteStorageError(
      "Browser-local recovery storage could not be read. Do not submit another write until site storage is available again.",
      { cause: error },
    );
  }
  if (!raw) return undefined;
  try {
    const value = parse(raw);
    if (validPendingWrite(value)) return value;
  } catch (error) {
    throw new PendingWriteStorageError(
      "The saved pending action is unreadable. It remains blocked so an uncertain write cannot be duplicated.",
      { cause: error },
    );
  }
  throw new PendingWriteStorageError(
    "The saved pending action uses an invalid or unsupported schema. It remains blocked so an uncertain write cannot be duplicated.",
  );
}

export function savePendingWrite(storage: Storage, pending: PendingWrite) {
  try {
    storage.setItem(pendingWriteStorageKey, stringify(pending));
  } catch (error) {
    throw new PendingWriteStorageError(
      "Browser-local recovery storage could not save this action. No protected write can be signed safely.",
      { cause: error },
    );
  }
}

export function clearPendingWrite(storage: Storage, id?: string) {
  if (id !== undefined && loadPendingWrite(storage)?.id !== id) return;
  try {
    storage.removeItem(pendingWriteStorageKey);
  } catch (error) {
    throw new PendingWriteStorageError(
      "The confirmed action could not be removed from browser-local recovery storage. Reload before preparing another write.",
      { cause: error },
    );
  }
}

export function pendingWriteId() {
  return globalThis.crypto.randomUUID();
}
