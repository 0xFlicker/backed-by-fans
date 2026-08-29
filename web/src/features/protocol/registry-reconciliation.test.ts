import {
  encodeAbiParameters,
  encodeEventTopics,
  getAddress,
  type Address,
  type Log,
  type PublicClient,
} from "viem";
import { describe, expect, it, vi } from "vitest";

import { robinhoodMembershipFactoryAbi } from "@/contracts";
import {
  defaultCreatorForm,
  evaluateCreatorForm,
} from "@/features/creator/config";
import { reconcileCreatedTier } from "@/features/protocol/registry-reconciliation";
import type { SuccessfulWriteReceipt } from "@/features/protocol/write-reconciliation";

const creator = getAddress("0x1111111111111111111111111111111111111111");
const factory = getAddress("0x2222222222222222222222222222222222222222");
const tier = getAddress("0x3333333333333333333333333333333333333333");
const otherTier = getAddress("0x4444444444444444444444444444444444444444");
const config = evaluateCreatorForm(defaultCreatorForm, creator).config!;

function tierCreatedLog(emittedTier: Address, tierIndex = 0n) {
  return {
    address: factory,
    blockNumber: 40n,
    data: encodeAbiParameters(
      [{ type: "string" }, { type: "string" }],
      [config.name, config.symbol],
    ),
    topics: encodeEventTopics({
      abi: robinhoodMembershipFactoryAbi,
      eventName: "TierCreated",
      args: { tier: emittedTier, creator, tierIndex },
    }),
  } as Log;
}

function receipt(logs: Log[]) {
  return {
    status: "success",
    blockNumber: 40n,
    logs,
  } as unknown as SuccessfulWriteReceipt;
}

function reconciliationClient(registeredTier = tier) {
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
        if (address === factory && functionName === "tiers") {
          return [registeredTier];
        }
        const fields = {
          owner: creator,
          name: config.name,
          symbol: config.symbol,
          pricePerPeriod: config.pricePerPeriod,
          periodDuration: config.periodDuration,
          rewardBps: config.rewardBps,
          referralBps: config.referralBps,
          supplyCap: config.supplyCap,
          maxPrepaidPeriods: config.maxPrepaidPeriods,
          description: config.metadata.description,
          imageURI: config.metadata.imageURI,
          externalURI: config.metadata.externalURI,
        };
        return fields[functionName as keyof typeof fields];
      },
    ),
  } as unknown as PublicClient;
}

describe("created-tier reconciliation", () => {
  it("verifies the exact tier emitted by the supplied receipt", async () => {
    await expect(
      reconcileCreatedTier(reconciliationClient(), {
        factory,
        config,
        receipt: receipt([tierCreatedLog(tier)]),
      }),
    ).resolves.toBe(tier);
  });

  it("uses the receipt index when another creator took the prior slot", async () => {
    await expect(
      reconcileCreatedTier(reconciliationClient(), {
        factory,
        config,
        receipt: receipt([tierCreatedLog(tier, 1n)]),
      }),
    ).resolves.toBe(tier);
  });

  it("does not substitute another matching registry tier", async () => {
    await expect(
      reconcileCreatedTier(reconciliationClient(otherTier), {
        factory,
        config,
        receipt: receipt([tierCreatedLog(tier)]),
      }),
    ).resolves.toBeUndefined();
  });

  it("requires a matching TierCreated event from the supplied receipt", async () => {
    await expect(
      reconcileCreatedTier(reconciliationClient(), {
        factory,
        config,
        receipt: receipt([]),
      }),
    ).resolves.toBeUndefined();
  });
});
