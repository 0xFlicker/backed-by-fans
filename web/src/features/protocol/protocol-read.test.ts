import { getAddress, keccak256, type PublicClient } from "viem";
import { describe, expect, it, vi } from "vitest";

import {
  membershipRendererSchema,
  readProtocolDependencies,
  readProtocolState,
} from "@/features/protocol/protocol-read";
import type { ReadyDeployment } from "@/lib/config";

const factory = getAddress("0x1111111111111111111111111111111111111111");
const paymentToken = getAddress("0x2222222222222222222222222222222222222222");
const renderer = getAddress("0x3333333333333333333333333333333333333333");
const secondRenderer = getAddress("0x8888888888888888888888888888888888888888");
const mediaStoreFactory = getAddress(
  "0x4444444444444444444444444444444444444444",
);
const owner = getAddress("0x5555555555555555555555555555555555555555");
const pendingOwner = getAddress("0x6666666666666666666666666666666666666666");
const feeRecipient = getAddress("0x7777777777777777777777777777777777777777");
const rendererCode = "0x6001600055" as const;
const secondRendererCode = "0x6003600055" as const;
const mediaStoreFactoryCode = "0x6002600055" as const;
const foundingEngineNames = [
  "STACK",
  "CHORUS",
  "LOOM",
  "BLOOM",
  "MARQUEE",
  "AFTERIMAGE",
] as const;
const deployment: ReadyDeployment = {
  status: "ready",
  chainId: 46630,
  factoryAddress: factory,
  usdgAddress: paymentToken,
};

function protocolClient(
  input: { rendererHash?: `0x${string}`; rendererCount?: number } = {},
) {
  const readContract = vi.fn(
    ({
      address,
      functionName,
      args,
    }: {
      address: string;
      functionName: string;
      args?: readonly unknown[];
    }) => {
      const rendererVersion = Number(args?.[0] ?? 1);
      if (functionName === "rendererRecord") {
        return Promise.resolve(
          rendererVersion === 2
            ? {
                implementation: secondRenderer,
                runtimeCodehash: keccak256(secondRendererCode),
                enabled: true,
              }
            : {
                implementation: renderer,
                runtimeCodehash: input.rendererHash ?? keccak256(rendererCode),
                enabled: true,
              },
        );
      }
      if (functionName === "rendererVersionOf") {
        return Promise.resolve(args?.[0] === secondRenderer ? 2 : 1);
      }
      if (functionName === "rendererName") {
        return Promise.resolve(
          address === secondRenderer ? "SECOND LIGHT" : "FOUNDING SIX",
        );
      }
      if (functionName === "engineCount") {
        return Promise.resolve(address === secondRenderer ? 1 : 6);
      }
      if (functionName === "engineName") {
        return Promise.resolve(
          address === secondRenderer
            ? "SECOND ENGINE"
            : foundingEngineNames[rendererVersion],
        );
      }
      const values: Record<string, unknown> = {
        paymentToken,
        rendererSchema: membershipRendererSchema,
        rendererCount: input.rendererCount ?? 1,
        mediaStoreFactory,
        mediaStoreFactoryRuntimeCodehash: keccak256(mediaStoreFactoryCode),
        owner,
        pendingOwner,
        feeRecipient,
        protocolFeeBps: 100,
        tierCount: 4n,
        balanceOf: 9n,
      };
      return Promise.resolve(values[functionName]);
    },
  );
  return {
    getBlockNumber: vi.fn().mockResolvedValue(40n),
    getChainId: vi.fn().mockResolvedValue(46630),
    getBytecode: vi.fn(({ address }: { address: string }) =>
      Promise.resolve(
        address === renderer
          ? rendererCode
          : address === secondRenderer
            ? secondRendererCode
            : mediaStoreFactoryCode,
      ),
    ),
    readContract,
  } as unknown as PublicClient;
}

describe("protocol dependency reads", () => {
  it("derives and verifies dependencies from the canonical factory at one block", async () => {
    const client = protocolClient();
    const result = await readProtocolState(client, deployment);

    expect(result).toMatchObject({
      status: "valid",
      capturedBlock: 40n,
      data: {
        chainId: 46630,
        factory,
        paymentToken,
        rendererSchema: membershipRendererSchema,
        rendererCount: 1,
        defaultRendererVersion: 1,
        renderers: [
          {
            version: 1,
            implementation: renderer,
            enabled: true,
            name: "FOUNDING SIX",
            engineCount: 6,
            engineNames: foundingEngineNames,
          },
        ],
        mediaStoreFactory,
        owner,
        protocolFeeBps: 100,
        tierCount: 4n,
      },
    });
    for (const call of vi.mocked(client.readContract).mock.calls) {
      expect(call[0]).toMatchObject({ blockNumber: 40n });
    }
    for (const call of vi.mocked(client.getBytecode).mock.calls) {
      expect(call[0]).toMatchObject({ blockNumber: 40n });
    }
  });

  it("does not silently choose a renderer when multiple versions are enabled", async () => {
    const result = await readProtocolDependencies(
      protocolClient({ rendererCount: 2 }),
      deployment,
    );

    expect(result).toMatchObject({
      status: "valid",
      data: {
        rendererCount: 2,
        defaultRendererVersion: undefined,
        renderers: [
          {
            version: 1,
            name: "FOUNDING SIX",
            enabled: true,
            engineCount: 6,
            engineNames: foundingEngineNames,
          },
          {
            version: 2,
            name: "SECOND LIGHT",
            enabled: true,
            engineCount: 1,
            engineNames: ["SECOND ENGINE"],
          },
        ],
      },
    });
  });

  it("rejects a renderer whose current bytecode misses the factory snapshot", async () => {
    const result = await readProtocolDependencies(
      protocolClient({ rendererHash: `0x${"ff".repeat(32)}` }),
      deployment,
    );

    expect(result).toMatchObject({
      status: "interface-mismatch",
      failedChecks: ["renderer 1 runtime identity"],
    });
  });

  it("rejects the wrong RPC chain before dependency reads", async () => {
    const client = protocolClient();
    vi.mocked(client.getChainId).mockResolvedValue(1);

    await expect(readProtocolDependencies(client, deployment)).resolves.toEqual(
      {
        status: "wrong-chain",
        expectedChainId: 46630,
        actualChainId: 1,
        label: "The RPC does not match the selected membership network.",
      },
    );
    expect(client.readContract).not.toHaveBeenCalled();
  });
});
