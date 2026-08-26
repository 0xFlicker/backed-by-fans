import { describe, expect, it, vi } from "vitest";
import { getAddress, type PublicClient } from "viem";

import {
  getWriteGuard,
  verifyTierAuthenticity,
  type AuthenticityResult,
} from "@/lib/authenticity";
import type { DeploymentAvailability } from "@/lib/config";

const factory = getAddress("0x1111111111111111111111111111111111111111");
const tier = getAddress("0x2222222222222222222222222222222222222222");
const token = getAddress("0x3333333333333333333333333333333333333333");
const renderer = getAddress("0x4444444444444444444444444444444444444444");
const deployment: DeploymentAvailability = {
  status: "ready",
  factoryAddress: factory,
  usdgAddress: token,
};

function authenticityClient(registered: boolean) {
  return {
    getBlockNumber: vi.fn().mockResolvedValue(90n),
    getBytecode: vi.fn().mockResolvedValue("0x6000"),
    readContract: vi.fn(({ functionName }: { functionName: string }) => {
      const values: Record<string, unknown> = {
        isRegisteredTier: registered,
        paymentToken: token,
        renderer,
        tierCount: 1n,
        factory,
        name: "Global Dollar",
        symbol: "USDG",
        decimals: 6,
        supportsInterface: true,
      };
      return Promise.resolve(values[functionName]);
    }),
  } as unknown as PublicClient;
}

describe("tier authenticity and write guard", () => {
  it("prevents an unregistered contract from reaching approval", async () => {
    const result = await verifyTierAuthenticity(authenticityClient(false), {
      factory,
      tier,
      expectedPaymentToken: token,
    });

    expect(result).toMatchObject({
      status: "interface-mismatch",
      failedChecks: expect.arrayContaining(["factory registration"]),
    });
    expect(
      getWriteGuard({
        deployment,
        walletChainId: 46630,
        expectedChainId: 46630,
        authenticity: result,
      }),
    ).toMatchObject({ enabled: false });
  });

  it("enables a write only after registration, bindings, and interfaces verify", async () => {
    const result = await verifyTierAuthenticity(authenticityClient(true), {
      factory,
      tier,
      expectedPaymentToken: token,
    });

    expect(result).toMatchObject({ status: "verified", capturedBlock: 90n });
    expect(
      getWriteGuard({
        deployment,
        walletChainId: 46630,
        expectedChainId: 46630,
        authenticity: result,
      }),
    ).toEqual({
      enabled: true,
      factory,
      tier,
      paymentToken: token,
      capturedBlock: 90n,
    });
  });

  it("keeps verified contracts disabled on the wrong wallet chain", () => {
    const verified: AuthenticityResult = {
      status: "verified",
      capturedBlock: 9n,
      factory,
      tier,
      paymentToken: token,
    };
    expect(
      getWriteGuard({
        deployment,
        walletChainId: 1,
        expectedChainId: 46630,
        authenticity: verified,
      }),
    ).toMatchObject({
      enabled: false,
      reason: expect.stringContaining("Switch"),
    });
  });

  it("classifies a missing standard function as an interface mismatch", async () => {
    const client = authenticityClient(true);
    vi.mocked(client.readContract).mockImplementation(
      ({ functionName }: { functionName: string }) => {
        if (functionName === "supportsInterface") {
          return Promise.reject(
            new Error("function selector was not recognized"),
          );
        }
        const values: Record<string, unknown> = {
          isRegisteredTier: true,
          paymentToken: token,
          renderer,
          tierCount: 1n,
          factory,
          name: "Global Dollar",
          symbol: "USDG",
          decimals: 6,
        };
        return Promise.resolve(values[functionName]);
      },
    );

    await expect(
      verifyTierAuthenticity(client, {
        factory,
        tier,
        expectedPaymentToken: token,
      }),
    ).resolves.toMatchObject({
      status: "interface-mismatch",
      failedChecks: expect.arrayContaining(["erc165 interface"]),
    });
  });
});
