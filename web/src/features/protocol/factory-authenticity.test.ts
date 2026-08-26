import { describe, expect, it, vi } from "vitest";
import { getAddress, keccak256, type PublicClient } from "viem";

import { verifyFactoryAuthenticity } from "@/features/protocol/factory-authenticity";
import type { ReadyDeployment } from "@/lib/config";

const factory = getAddress("0x1111111111111111111111111111111111111111");
const token = getAddress("0x2222222222222222222222222222222222222222");
const renderer = getAddress("0x3333333333333333333333333333333333333333");
const deployer = getAddress("0x4444444444444444444444444444444444444444");
const runtimeCode = "0x6000";
const runtimeHash = keccak256(runtimeCode);
const deployment: ReadyDeployment = {
  status: "ready",
  chainId: 46630,
  factoryAddress: factory,
  usdgAddress: token,
  factoryRuntimeCodeHash: runtimeHash,
  rendererRuntimeCodeHash: runtimeHash,
  deployerRuntimeCodeHash: runtimeHash,
  usdgRuntimeCodeHash: runtimeHash,
};

function client(input: { chainId?: number; factoryCode?: `0x${string}` } = {}) {
  return {
    getBlockNumber: vi.fn().mockResolvedValue(90n),
    getChainId: vi.fn().mockResolvedValue(input.chainId ?? 46630),
    getBytecode: vi.fn(({ address }) =>
      Promise.resolve(
        address === factory ? (input.factoryCode ?? runtimeCode) : runtimeCode,
      ),
    ),
    readContract: vi.fn(({ functionName }: { functionName: string }) => {
      const values: Record<string, unknown> = {
        paymentToken: token,
        renderer,
        deployer,
        protocolFeeBps: 100,
        maxPageSize: 100n,
      };
      return Promise.resolve(values[functionName]);
    }),
  } as unknown as PublicClient;
}

describe("factory deployment authenticity", () => {
  it("verifies the RPC chain and every signed runtime commitment", async () => {
    await expect(
      verifyFactoryAuthenticity(client(), deployment),
    ).resolves.toMatchObject({ status: "verified", capturedBlock: 90n });
  });

  it("rejects a same-surface factory with different runtime bytecode", async () => {
    await expect(
      verifyFactoryAuthenticity(client({ factoryCode: "0x6001" }), deployment),
    ).resolves.toMatchObject({
      status: "interface-mismatch",
      failedChecks: expect.arrayContaining(["factory runtime code"]),
    });
  });

  it("rejects an RPC endpoint serving a different chain", async () => {
    await expect(
      verifyFactoryAuthenticity(client({ chainId: 1 }), deployment),
    ).resolves.toMatchObject({
      status: "interface-mismatch",
      failedChecks: expect.arrayContaining(["RPC chain ID"]),
    });
  });
});
