import { getAddress, type Address, type PublicClient } from "viem";
import { describe, expect, it, vi } from "vitest";

import {
  defaultCreatorForm,
  evaluateCreatorForm,
} from "@/features/creator/config";
import { recoverCreatedTier } from "@/features/protocol/registry-recovery";

const creator = getAddress("0x1111111111111111111111111111111111111111");
const factory = getAddress("0x2222222222222222222222222222222222222222");
const tier = getAddress("0x3333333333333333333333333333333333333333");
const config = evaluateCreatorForm(defaultCreatorForm, creator).config!;

function recoveryClient(
  tiers: readonly string[],
  overrides: Partial<{
    supplyCap: bigint;
    maxPrepaidPeriods: bigint;
    description: string;
    imageURI: string;
    externalURI: string;
  }> = {},
) {
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
        if (address === factory && functionName === "tierCount") {
          return BigInt(tiers.length);
        }
        if (address === factory && functionName === "tiers") return tiers;
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
          ...overrides,
        };
        return fields[functionName as keyof typeof fields];
      },
    ),
  } as unknown as PublicClient;
}

describe("uncertain deployment registry recovery", () => {
  it("finds the one matching tier added after the captured cursor", async () => {
    const result = await recoverCreatedTier(recoveryClient([tier]), {
      factory,
      fromIndex: 0n,
      config,
    });

    expect(result).toEqual({ status: "found", currentCount: 1n, tier });
  });

  it("does not invent deployment success when the registry did not advance", async () => {
    const result = await recoverCreatedTier(recoveryClient([]), {
      factory,
      fromIndex: 0n,
      config,
    });

    expect(result).toEqual({ status: "not-found", currentCount: 0n });
  });

  it("does not claim a concurrent tier with different mutable launch terms", async () => {
    const result = await recoverCreatedTier(
      recoveryClient([tier], { supplyCap: config.supplyCap + 1n }),
      { factory, fromIndex: 0n, config },
    );

    expect(result).toEqual({ status: "not-found", currentCount: 1n });
  });

  it("fails closed when duplicate matching tiers make recovery ambiguous", async () => {
    const second = getAddress("0x4444444444444444444444444444444444444444");
    const result = await recoverCreatedTier(recoveryClient([tier, second]), {
      factory,
      fromIndex: 0n,
      config,
    });

    expect(result).toEqual({
      status: "ambiguous",
      currentCount: 2n,
      tiers: [tier, second],
    });
  });
});
