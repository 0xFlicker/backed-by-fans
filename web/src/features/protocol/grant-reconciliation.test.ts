import {
  encodeAbiParameters,
  encodeEventTopics,
  getAddress,
  type Log,
  type PublicClient,
} from "viem";
import { describe, expect, it, vi } from "vitest";

import { tierAbi } from "@/contracts/abis";
import {
  reconcileTierGrant,
  type TierGrantBaseline,
} from "@/features/protocol/grant-reconciliation";
import type { SuccessfulWriteReceipt } from "@/features/protocol/write-reconciliation";

const tier = getAddress("0x1111111111111111111111111111111111111111");
const recipient = getAddress("0x2222222222222222222222222222222222222222");
const baseline = {
  tier,
  recipient,
  tokenId: 7n,
  baselineTimestamp: 1_000n,
  baselinePaidSeconds: 100n,
  baselineGrantSeconds: 50n,
  grantedSeconds: 30n,
} satisfies TierGrantBaseline;

function timeUpdateLog(input: {
  paidSeconds: bigint;
  grantSeconds: bigint;
  expiration: bigint;
}) {
  return {
    address: tier,
    blockNumber: 101n,
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

function receipt(log: Log) {
  return {
    status: "success",
    blockNumber: 101n,
    logs: [log],
  } as unknown as SuccessfulWriteReceipt;
}

function client() {
  return {
    readContract: vi.fn().mockResolvedValue(7n),
    getBlock: vi.fn().mockResolvedValue({ timestamp: 1_010n }),
  } as unknown as PublicClient;
}

describe("tier grant reconciliation", () => {
  it("proves the exact decayed grant transition from the supplied receipt", async () => {
    await expect(
      reconcileTierGrant(
        client(),
        baseline,
        receipt(
          timeUpdateLog({
            paidSeconds: 90n,
            grantSeconds: 80n,
            expiration: 1_180n,
          }),
        ),
      ),
    ).resolves.toEqual({
      tokenId: 7n,
      paidSeconds: 90n,
      grantSeconds: 80n,
      expiration: 1_180n,
    });
  });

  it("does not mistake a paid-time transition for the grant", async () => {
    await expect(
      reconcileTierGrant(
        client(),
        baseline,
        receipt(
          timeUpdateLog({
            paidSeconds: 120n,
            grantSeconds: 50n,
            expiration: 1_180n,
          }),
        ),
      ),
    ).resolves.toBeUndefined();
  });
});
