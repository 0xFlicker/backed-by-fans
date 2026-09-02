import { getAddress, type PublicClient } from "viem";
import { describe, expect, it, vi } from "vitest";

import {
  reconcileExpiredMembershipSync,
  scanExpiredMemberships,
} from "@/features/creator/expired-membership-sync";
import type { SuccessfulWriteReceipt } from "@/features/protocol/write-reconciliation";
import { verifyMulticall3 } from "@/lib/direct-read";

vi.mock("@/lib/direct-read", () => ({
  multicall3Address: "0xca11bde05977b3631167028862be2a173976ca11",
  verifyMulticall3: vi.fn().mockResolvedValue("verified"),
}));

const tier = getAddress("0x1111111111111111111111111111111111111111");

const success = (result: unknown) => ({ status: "success" as const, result });
const failure = { status: "failure" as const };

function receipt(logs: SuccessfulWriteReceipt["logs"] = []) {
  return {
    status: "success" as const,
    logs,
    blockNumber: 11n,
  } as SuccessfulWriteReceipt;
}

describe("expired membership sync reads", () => {
  it("scans one captured block in pages of one hundred and skips burned tokens", async () => {
    const multicall = vi
      .fn()
      .mockImplementationOnce(({ contracts }: { contracts: unknown[] }) =>
        Promise.resolve(
          Array.from({ length: contracts.length / 2 }, (_, index) =>
            index === 4
              ? [success(false), success(false)]
              : [success(true), success(index % 2 === 0)],
          ).flat(),
        ),
      )
      .mockResolvedValueOnce([success(true), success(false)]);
    const progress = vi.fn();
    const client = { multicall } as unknown as PublicClient;

    const result = await scanExpiredMemberships(client, {
      tier,
      totalMinted: 101n,
      capturedBlock: 90n,
      onProgress: progress,
    });

    expect(multicall).toHaveBeenCalledTimes(2);
    expect(multicall).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ blockNumber: 90n, allowFailure: true }),
    );
    expect(result.scanned).toBe(101n);
    expect(result.tokenIds).not.toContain(5n);
    expect(result.tokenIds).toContain(2n);
    expect(result.tokenIds).toContain(101n);
    expect(progress).toHaveBeenLastCalledWith({
      scanned: 101n,
      total: 101n,
      expired: result.tokenIds.length,
    });
  });

  it("aborts instead of returning partial results when a required read fails", async () => {
    const client = {
      multicall: vi.fn().mockResolvedValue([success(true), failure]),
    } as unknown as PublicClient;

    await expect(
      scanExpiredMemberships(client, {
        tier,
        totalMinted: 1n,
        capturedBlock: 90n,
      }),
    ).rejects.toThrow("Membership #1 could not be verified");
  });

  it("falls back to block-pinned direct reads without verified Multicall3", async () => {
    vi.mocked(verifyMulticall3).mockResolvedValueOnce("missing");
    const readContract = vi.fn(({ functionName }: { functionName: string }) =>
      Promise.resolve(functionName === "isOccupied"),
    );
    const client = {
      multicall: vi.fn(),
      readContract,
    } as unknown as PublicClient;

    const result = await scanExpiredMemberships(client, {
      tier,
      totalMinted: 1n,
      capturedBlock: 90n,
    });

    expect(result.tokenIds).toEqual([1n]);
    expect(readContract).toHaveBeenCalledTimes(2);
    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({ blockNumber: 90n }),
    );
    expect(client.multicall).not.toHaveBeenCalled();
  });

  it("aborts a direct-read scan when occupancy cannot be verified", async () => {
    vi.mocked(verifyMulticall3).mockResolvedValueOnce("missing");
    const client = {
      readContract: vi.fn(({ functionName }: { functionName: string }) =>
        functionName === "isOccupied"
          ? Promise.reject(new Error("RPC transport failed"))
          : Promise.resolve(false),
      ),
    } as unknown as PublicClient;

    await expect(
      scanExpiredMemberships(client, {
        tier,
        totalMinted: 1n,
        capturedBlock: 90n,
      }),
    ).rejects.toThrow("Membership #1 could not be verified");
  });

  it("reconciles every request as burned or renewed at one fresh block", async () => {
    const client = {
      getBlockNumber: vi.fn().mockResolvedValue(100n),
      multicall: vi
        .fn()
        .mockResolvedValue([
          success(false),
          success(false),
          success(true),
          success(true),
        ]),
    } as unknown as PublicClient;

    await expect(
      reconcileExpiredMembershipSync(client, {
        tier,
        tokenIds: [1n, 2n],
        receipt: receipt(),
      }),
    ).resolves.toEqual({
      blockNumber: 100n,
      burnedIds: [1n],
      renewedIds: [2n],
    });
  });

  it("rejects a requested membership that remains minted and expired", async () => {
    const client = {
      getBlockNumber: vi.fn().mockResolvedValue(100n),
      multicall: vi.fn().mockResolvedValue([success(true), success(false)]),
    } as unknown as PublicClient;

    await expect(
      reconcileExpiredMembershipSync(client, {
        tier,
        tokenIds: [1n],
        receipt: receipt(),
      }),
    ).resolves.toBeUndefined();
  });
});
