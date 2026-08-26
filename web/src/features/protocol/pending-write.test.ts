import { getAddress } from "viem";
import { describe, expect, it } from "vitest";

import {
  clearPendingWrite,
  loadPendingWrite,
  pendingWriteStorageKey,
  PendingWriteStorageError,
  savePendingWrite,
  type PendingWrite,
} from "@/features/protocol/pending-write";
import { createMemoryStorage } from "@/test/memory-storage";

const tier = getAddress("0x1111111111111111111111111111111111111111");
const wallet = getAddress("0x2222222222222222222222222222222222222222");

function pending(): PendingWrite {
  return {
    version: 1,
    id: "write-1",
    contextKey: `46630:${wallet}:${tier}`,
    label: "Renew membership",
    armedAt: 1_777_777_777_777,
    hash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    intent: {
      kind: "membership-payment",
      tier,
      payer: wallet,
      recipient: wallet,
      gross: 10n,
      periods: 1n,
      fromBlock: 100n,
      minimumExpiration: 123n,
      minimumShares: 456n,
      referralStatus: 1,
    },
  };
}

describe("pending write storage", () => {
  it("round-trips a typed intent and its bigint postcondition", () => {
    const local = createMemoryStorage();
    savePendingWrite(local, pending());

    expect(loadPendingWrite(local)).toEqual(pending());
  });

  it("does not clear another in-flight write by id", () => {
    const local = createMemoryStorage();
    savePendingWrite(local, pending());

    clearPendingWrite(local, "write-2");
    expect(loadPendingWrite(local)?.id).toBe("write-1");

    clearPendingWrite(local, "write-1");
    expect(loadPendingWrite(local)).toBeUndefined();
  });

  it("keeps corrupt or unsupported records blocked for explicit recovery", () => {
    const local = createMemoryStorage();
    local.setItem(pendingWriteStorageKey, "not-json");
    expect(() => loadPendingWrite(local)).toThrow(PendingWriteStorageError);
    expect(local.getItem(pendingWriteStorageKey)).toBe("not-json");

    local.setItem(pendingWriteStorageKey, JSON.stringify({ version: 2 }));
    expect(() => loadPendingWrite(local)).toThrow(PendingWriteStorageError);
    expect(local.getItem(pendingWriteStorageKey)).not.toBeNull();
  });

  it("rejects incomplete replacement metadata", () => {
    const local = createMemoryStorage();
    const serialized = JSON.stringify(pending(), (_key, value: unknown) =>
      typeof value === "bigint"
        ? { $backedByFansBigInt: value.toString() }
        : value,
    );
    const value = JSON.parse(serialized) as Record<string, unknown>;
    delete value.hash;
    value.replacementHash =
      "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    value.replacementReason = "repriced";
    local.setItem(pendingWriteStorageKey, JSON.stringify(value));

    expect(() => loadPendingWrite(local)).toThrow(/invalid or unsupported/i);
  });

  it("surfaces browser storage read, write, and removal failures", () => {
    const readFailure = createMemoryStorage();
    readFailure.getItem = () => {
      throw new Error("read denied");
    };
    expect(() => loadPendingWrite(readFailure)).toThrow(/could not be read/i);

    const writeFailure = createMemoryStorage();
    writeFailure.setItem = () => {
      throw new Error("quota exceeded");
    };
    expect(() => savePendingWrite(writeFailure, pending())).toThrow(
      /could not save/i,
    );

    const removalFailure = createMemoryStorage();
    savePendingWrite(removalFailure, pending());
    removalFailure.removeItem = () => {
      throw new Error("remove denied");
    };
    expect(() => clearPendingWrite(removalFailure, "write-1")).toThrow(
      /could not be removed/i,
    );
  });
});
