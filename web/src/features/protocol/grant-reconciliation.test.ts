import {
  encodeAbiParameters,
  encodeEventTopics,
  getAddress,
  zeroAddress,
  type Log,
  type PublicClient,
} from "viem";
import { describe, expect, it, vi } from "vitest";

import { membershipTierAbi } from "@/contracts";
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
      abi: membershipTierAbi,
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
    readContract: vi
      .fn()
      .mockImplementation(async ({ functionName }) =>
        functionName === "ownerOf" ? recipient : [90n, 80n, 1010n],
      ),
    getBlock: vi.fn().mockResolvedValue({ timestamp: 1_010n }),
  } as unknown as PublicClient;
}

describe("tier grant reconciliation", () => {
  it("discovers a new identity only from its mint receipt and pins postconditions", async () => {
    const rpc = client();
    vi.mocked(rpc.readContract).mockImplementation(async ({ functionName }) =>
      functionName === "ownerOf" ? recipient : ([0n, 30n, 1010n] as never),
    );
    const supplied = receipt(
      timeUpdateLog({ paidSeconds: 0n, grantSeconds: 30n, expiration: 1040n }),
    );
    supplied.logs.push({
      address: tier,
      data: "0x",
      topics: encodeEventTopics({
        abi: membershipTierAbi,
        eventName: "Transfer",
        args: { from: zeroAddress, to: recipient, tokenId: 7n },
      }),
    } as unknown as SuccessfulWriteReceipt["logs"][number]);
    await expect(
      reconcileTierGrant(
        rpc,
        {
          ...baseline,
          tokenId: 0n,
          baselinePaidSeconds: 0n,
          baselineGrantSeconds: 0n,
        },
        supplied,
      ),
    ).resolves.toMatchObject({ tokenId: 7n });
    expect(rpc.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "ownerOf",
        args: [7n],
        blockNumber: 101n,
      }),
    );
    expect(rpc.readContract).not.toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "tokenOf" }),
    );
  });

  it("rejects a receipt for a different current beneficiary", async () => {
    const rpc = client();
    vi.mocked(rpc.readContract).mockResolvedValue(zeroAddress as never);
    await expect(
      reconcileTierGrant(
        rpc,
        baseline,
        receipt(
          timeUpdateLog({
            paidSeconds: 90n,
            grantSeconds: 80n,
            expiration: 1180n,
          }),
        ),
      ),
    ).resolves.toBeUndefined();
  });
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
