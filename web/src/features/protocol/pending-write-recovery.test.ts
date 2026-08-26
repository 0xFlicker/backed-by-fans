import {
  encodeAbiParameters,
  encodeEventTopics,
  getAddress,
  TransactionReceiptNotFoundError,
  type Log,
  type PublicClient,
} from "viem";
import { describe, expect, it, vi } from "vitest";

import { tierAbi } from "@/contracts/abis";
import type { PendingWrite } from "@/features/protocol/pending-write";
import { recoverPendingWrite } from "@/features/protocol/pending-write-recovery";

const tier = getAddress("0x1111111111111111111111111111111111111111");
const wallet = getAddress("0x2222222222222222222222222222222222222222");

function pending(intent: PendingWrite["intent"]): PendingWrite {
  return {
    version: 1,
    id: "write-1",
    contextKey: `46630:${wallet}:${tier}`,
    label: "Recover write",
    armedAt: 1_777_777_777_777,
    intent,
  };
}

function paymentLog() {
  return {
    address: tier,
    data: encodeAbiParameters(
      [{ type: "uint256" }, { type: "uint64" }],
      [10n, 1n],
    ),
    topics: encodeEventTopics({
      abi: tierAbi,
      eventName: "PaymentProcessed",
      args: { payer: wallet, recipient: wallet, tokenId: 7n },
    }),
  } as Log;
}

function pauseLog(paused: boolean) {
  return {
    address: tier,
    data: encodeAbiParameters([{ type: "bool" }], [paused]),
    topics: encodeEventTopics({
      abi: tierAbi,
      eventName: "PauseUpdated",
    }),
  } as Log;
}

function timeUpdateLog(input: {
  paidSeconds: bigint;
  grantSeconds: bigint;
  expiration: bigint;
  blockNumber?: bigint;
}) {
  return {
    address: tier,
    blockNumber: input.blockNumber ?? 101n,
    data: encodeAbiParameters(
      [{ type: "uint64" }, { type: "uint64" }, { type: "uint64" }],
      [input.paidSeconds, input.grantSeconds, input.expiration],
    ),
    topics: encodeEventTopics({
      abi: tierAbi,
      eventName: "MembershipTimeUpdated",
      args: { tokenId: 7n },
    }),
  } as Log;
}

describe("pending write recovery", () => {
  it("proves a restored mutable setting from its exact historical event", async () => {
    const client = {
      getLogs: vi.fn().mockResolvedValue([pauseLog(true)]),
    } as unknown as PublicClient;

    await expect(
      recoverPendingWrite(
        client,
        pending({
          kind: "tier-paused",
          tier,
          previous: false,
          expected: true,
          fromBlock: 100n,
        }),
      ),
    ).resolves.toMatchObject({ status: "reconciled" });
  });

  it("proves a grant only from the expected decayed time transition", async () => {
    const exact = timeUpdateLog({
      paidSeconds: 90n,
      grantSeconds: 80n,
      expiration: 1_180n,
    });
    const client = {
      readContract: vi.fn().mockResolvedValue(7n),
      getLogs: vi.fn().mockResolvedValue([exact]),
      getBlock: vi.fn().mockResolvedValue({ timestamp: 1_010n }),
    } as unknown as PublicClient;
    const write = pending({
      kind: "tier-grant",
      tier,
      recipient: wallet,
      tokenId: 7n,
      baselineTimestamp: 1_000n,
      baselinePaidSeconds: 100n,
      baselineGrantSeconds: 50n,
      grantedSeconds: 30n,
      fromBlock: 101n,
    });

    await expect(recoverPendingWrite(client, write)).resolves.toMatchObject({
      status: "reconciled",
    });
  });

  it("does not mistake unrelated paid time for the pending grant", async () => {
    const unrelatedPayment = timeUpdateLog({
      paidSeconds: 120n,
      grantSeconds: 50n,
      expiration: 1_180n,
    });
    const client = {
      readContract: vi.fn().mockResolvedValue(7n),
      getLogs: vi.fn().mockResolvedValue([unrelatedPayment]),
      getBlock: vi.fn().mockResolvedValue({ timestamp: 1_010n }),
    } as unknown as PublicClient;

    await expect(
      recoverPendingWrite(
        client,
        pending({
          kind: "tier-grant",
          tier,
          recipient: wallet,
          tokenId: 7n,
          baselineTimestamp: 1_000n,
          baselinePaidSeconds: 100n,
          baselineGrantSeconds: 50n,
          grantedSeconds: 30n,
          fromBlock: 101n,
        }),
      ),
    ).resolves.toMatchObject({ status: "uncertain" });
  });

  it("proves a restored payment only when every durable postcondition matches", async () => {
    const client = {
      getBlockNumber: vi.fn().mockResolvedValue(100n),
      getLogs: vi.fn().mockResolvedValue([paymentLog()]),
      readContract: vi.fn(
        async ({ functionName }: { functionName: string }) => {
          if (functionName === "tokenOf") return 7n;
          if (functionName === "expiresAt") return 500n;
          if (functionName === "sharesOf") return 900n;
          if (functionName === "referralOf") return [2, wallet] as const;
          throw new Error(`Unexpected ${functionName}`);
        },
      ),
    } as unknown as PublicClient;
    const write = pending({
      kind: "membership-payment",
      tier,
      payer: wallet,
      recipient: wallet,
      gross: 10n,
      periods: 1n,
      fromBlock: 100n,
      minimumExpiration: 500n,
      minimumShares: 900n,
      referralStatus: 2,
    });

    await expect(recoverPendingWrite(client, write)).resolves.toMatchObject({
      status: "reconciled",
    });

    if (write.intent.kind !== "membership-payment") {
      throw new Error("Expected membership payment intent");
    }
    write.intent = { ...write.intent, minimumShares: 901n };
    await expect(recoverPendingWrite(client, write)).resolves.toMatchObject({
      status: "uncertain",
    });
  });

  it("turns a persisted reverted receipt into a definitive retry state", async () => {
    const client = {
      getTransactionReceipt: vi.fn().mockResolvedValue({
        status: "reverted",
        blockNumber: 123n,
        logs: [],
      }),
    } as unknown as PublicClient;
    const write = {
      ...pending({
        kind: "tier-paused",
        tier,
        previous: false,
        expected: true,
        fromBlock: 100n,
      }),
      hash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    } satisfies PendingWrite;

    await expect(recoverPendingWrite(client, write)).resolves.toEqual({
      status: "reverted",
      error: "The recovered transaction reverted onchain.",
    });
  });

  it("recognizes a confirmed cancellation replacement without applying the action", async () => {
    const client = {
      getTransactionReceipt: vi.fn().mockResolvedValue({
        status: "success",
        blockNumber: 124n,
        logs: [],
      }),
    } as unknown as PublicClient;
    const write = {
      ...pending({
        kind: "tier-paused",
        tier,
        previous: false,
        expected: true,
        fromBlock: 100n,
      }),
      replacementHash:
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      replacementReason: "cancelled" as const,
      hash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    } satisfies PendingWrite;

    await expect(recoverPendingWrite(client, write)).resolves.toEqual({
      status: "cancelled",
      error: "The recovered replacement cancelled this action onchain.",
    });
  });

  it("unblocks a confirmed same-nonce replacement that did not apply the action", async () => {
    const client = {
      getTransactionReceipt: vi.fn().mockResolvedValue({
        status: "success",
        blockNumber: 124n,
        logs: [],
      }),
    } as unknown as PublicClient;
    const write = {
      ...pending({
        kind: "tier-paused",
        tier,
        previous: false,
        expected: true,
        fromBlock: 100n,
      }),
      hash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      replacementHash:
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      replacementReason: "replaced" as const,
    } satisfies PendingWrite;

    await expect(recoverPendingWrite(client, write)).resolves.toEqual({
      status: "cancelled",
      error:
        "The wallet confirmed a different same-nonce replacement, and the exact protected action was not found onchain.",
    });
  });

  it("distinguishes a missing receipt from a provider failure", async () => {
    const hash =
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
    const write = {
      ...pending({
        kind: "tier-paused",
        tier,
        previous: false,
        expected: true,
        fromBlock: 100n,
      }),
      hash,
    } satisfies PendingWrite;
    const missing = {
      getTransactionReceipt: vi
        .fn()
        .mockRejectedValue(new TransactionReceiptNotFoundError({ hash })),
      getLogs: vi.fn().mockResolvedValue([pauseLog(true)]),
    } as unknown as PublicClient;
    await expect(recoverPendingWrite(missing, write)).resolves.toMatchObject({
      status: "reconciled",
    });

    const unavailable = {
      getTransactionReceipt: vi
        .fn()
        .mockRejectedValue(new Error("provider unavailable")),
    } as unknown as PublicClient;
    await expect(recoverPendingWrite(unavailable, write)).rejects.toThrow(
      "provider unavailable",
    );
  });
});
