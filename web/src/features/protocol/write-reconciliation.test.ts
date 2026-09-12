import {
  encodeEventTopics,
  type Address,
  type PublicClient,
  type TransactionReceipt,
} from "viem";
import { QueryClient } from "@tanstack/react-query";
import { membershipTierAbi } from "@/contracts";
import { describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  reconcileSuccessfulWrite,
  reconcileMembershipTransfer,
  invalidateMembershipReads,
  type SuccessfulWriteReceipt,
} from "@/features/protocol/write-reconciliation";

const receipt = {
  status: "success",
  transactionHash: `0x${"1".repeat(64)}`,
  blockNumber: 10n,
  logs: [],
} as unknown as SuccessfulWriteReceipt;

describe("position transfer reconciliation", () => {
  const tier = "0x1111111111111111111111111111111111111111" as Address;
  const from = "0x2222222222222222222222222222222222222222" as Address;
  const to = "0x3333333333333333333333333333333333333333" as Address;
  const later = "0x4444444444444444444444444444444444444444" as Address;
  const transferred = {
    ...receipt,
    logs: [
      {
        address: tier,
        data: "0x",
        topics: encodeEventTopics({
          abi: membershipTierAbi,
          eventName: "Transfer",
          args: { from, to, tokenId: 7n },
        }),
      },
    ],
  } as unknown as SuccessfulWriteReceipt;
  it("keeps receipt provenance while reporting later ownership at one fresh block", async () => {
    const readContract = vi.fn(async ({ functionName }) =>
      functionName === "ownerOf"
        ? later
        : functionName === "isActiveToken"
          ? true
          : { tokenIds: [], nextOffset: 0n, balance: 0n, complete: true },
    );
    const client = {
      getBlockNumber: vi.fn(async () => 42n),
      readContract,
    } as unknown as PublicClient;
    await expect(
      reconcileMembershipTransfer(client, transferred, {
        tier,
        from,
        to,
        tokenId: 7n,
      }),
    ).resolves.toMatchObject({
      recipient: to,
      currentOwner: later,
      active: true,
      blockNumber: 42n,
    });
    expect(
      readContract.mock.calls.every(([call]) => call.blockNumber === 42n),
    ).toBe(true);
  });
  it("does not infer a successful transfer from ownership without its receipt event", async () => {
    const readContract = vi.fn();
    await expect(
      reconcileMembershipTransfer(
        { readContract } as unknown as PublicClient,
        receipt,
        { tier, from, to, tokenId: 7n },
      ),
    ).resolves.toBeUndefined();
    expect(readContract).not.toHaveBeenCalled();
  });
  it("invalidates both wallets and the selected tier while preserving unrelated tier reads", async () => {
    const queries = new QueryClient();
    const keys = [
      ["tier-supporter", 31337, tier, from, "7"],
      ["owner-positions", 31337, tier, to],
      ["account-rewards", 31337, later, to],
      ["tier-supporter", 31337, later, from, "7"],
    ];
    keys.forEach((key) => queries.setQueryData(key, "snapshot"));
    await invalidateMembershipReads(queries, transferred, {
      chainId: 31337,
      tier,
      owners: [from],
    });
    expect(
      keys.map((key) => queries.getQueryState(key)?.isInvalidated),
    ).toEqual([true, true, true, false]);
  });
});

describe("successful write reconciliation", () => {
  it("passes the exact library receipt to domain reconciliation", async () => {
    const dispatch = vi.fn();
    const reconcile = vi.fn(async () => "fresh state");

    await expect(
      reconcileSuccessfulWrite({ receipt, reconcile, dispatch }),
    ).resolves.toBe("fresh state");

    expect(reconcile).toHaveBeenCalledOnce();
    expect(reconcile).toHaveBeenCalledWith(receipt);
    expect(dispatch.mock.calls.map(([event]) => event.type)).toEqual([
      "RECONCILE",
      "RECONCILED",
    ]);
  });

  it("does not accept a receipt-less reconciliation contract", () => {
    type Input = Parameters<typeof reconcileSuccessfulWrite>[0];
    expectTypeOf<Input["receipt"]>().toMatchTypeOf<TransactionReceipt>();
  });

  it("never reports success when the domain postcondition is absent", async () => {
    const dispatch = vi.fn();

    await reconcileSuccessfulWrite({
      receipt,
      reconcile: async () => undefined,
      dispatch,
    });

    expect(dispatch).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: "UNCERTAIN" }),
    );
    expect(dispatch).not.toHaveBeenCalledWith({ type: "RECONCILED" });
  });

  it("can retry only the domain verification with the same successful receipt", async () => {
    const dispatch = vi.fn();
    const reconcile = vi
      .fn<(receipt: SuccessfulWriteReceipt) => Promise<string | undefined>>()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce("visible after a fresh canonical read");

    await expect(
      reconcileSuccessfulWrite({ receipt, reconcile, dispatch }),
    ).resolves.toBeUndefined();
    await expect(
      reconcileSuccessfulWrite({ receipt, reconcile, dispatch }),
    ).resolves.toBe("visible after a fresh canonical read");

    expect(reconcile.mock.calls).toEqual([[receipt], [receipt]]);
    expect(dispatch.mock.calls.map(([event]) => event.type)).toEqual([
      "RECONCILE",
      "UNCERTAIN",
      "RECONCILE",
      "RECONCILED",
    ]);
  });
});
