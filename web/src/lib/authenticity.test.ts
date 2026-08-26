import { describe, expect, it, vi } from "vitest";
import { getAddress, keccak256, type Hex, type PublicClient } from "viem";

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
const deployer = getAddress("0x5555555555555555555555555555555555555555");
const implementation = getAddress("0x6666666666666666666666666666666666666666");
const implementationWord =
  `0x${"0".repeat(24)}${implementation.slice(2)}` as Hex;
const runtimeCode = "0x6000";
const runtimeHash = keccak256(runtimeCode);
const deployment: DeploymentAvailability = {
  status: "ready",
  chainId: 46630,
  factoryAddress: factory,
  usdgAddress: token,
  factoryRuntimeCodeHash: runtimeHash,
  rendererRuntimeCodeHash: runtimeHash,
  deployerRuntimeCodeHash: runtimeHash,
  usdgRuntimeCodeHash: runtimeHash,
  usdgImplementationAddress: implementation,
  usdgImplementationRuntimeCodeHash: runtimeHash,
};

function authenticityClient(registered: boolean) {
  return {
    getBlockNumber: vi.fn().mockResolvedValue(90n),
    getChainId: vi.fn().mockResolvedValue(46630),
    getBytecode: vi.fn().mockResolvedValue(runtimeCode),
    getStorageAt: vi.fn().mockResolvedValue(implementationWord),
    readContract: vi.fn(({ functionName }: { functionName: string }) => {
      const values: Record<string, unknown> = {
        isRegisteredTier: registered,
        paymentToken: token,
        renderer,
        deployer,
        protocolFeeBps: 100,
        maxPageSize: 100n,
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
      deployment,
      tier,
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
      deployment,
      tier,
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

  it("keeps a verified stale deployment identity disabled", () => {
    const verified: AuthenticityResult = {
      status: "verified",
      capturedBlock: 9n,
      factory: getAddress("0x9999999999999999999999999999999999999999"),
      tier,
      paymentToken: token,
    };
    expect(
      getWriteGuard({
        deployment,
        walletChainId: 46630,
        expectedChainId: 46630,
        authenticity: verified,
      }),
    ).toMatchObject({
      enabled: false,
      reason: expect.stringContaining("do not match"),
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
          deployer,
          protocolFeeBps: 100,
          maxPageSize: 100n,
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
        deployment,
        tier,
      }),
    ).resolves.toMatchObject({
      status: "interface-mismatch",
      failedChecks: expect.arrayContaining(["erc165 interface"]),
    });
  });
});
