import { getAddress, keccak256, type Address, type PublicClient } from "viem";
import { describe, expect, it, vi } from "vitest";

import {
  membershipRendererSchema,
  readProtocolDependencies,
  readProtocolState,
} from "@/features/protocol/protocol-read";
import type { ReadyDeployment } from "@/lib/config";

const factory = getAddress("0x1111111111111111111111111111111111111111");
const paymentToken = getAddress("0x2222222222222222222222222222222222222222");
const stockToken = getAddress("0x9999999999999999999999999999999999999999");
const renderer = getAddress("0x3333333333333333333333333333333333333333");
const mediaStoreFactory = getAddress(
  "0x4444444444444444444444444444444444444444",
);
const owner = getAddress("0x5555555555555555555555555555555555555555");
const pendingOwner = getAddress("0x6666666666666666666666666666666666666666");
const feeRecipient = getAddress("0x7777777777777777777777777777777777777777");
const previewHarness = getAddress("0x8888888888888888888888888888888888888888");
const rendererCode = "0x6001600055" as const;
const mediaStoreFactoryCode = "0x6002600055" as const;
const previewHarnessCode = "0x6003600055" as const;
const foundingEngineNames = [
  "STACK",
  "CHORUS",
  "LOOM",
  "BLOOM",
  "MARQUEE",
  "AFTERIMAGE",
] as const;
const deployment = {
  status: "ready",
  chainId: 46630,
  factoryAddress: factory,
  rendererAddress: renderer,
  previewHarnessAddress: previewHarness,
} satisfies ReadyDeployment & {
  rendererAddress: Address;
  previewHarnessAddress: Address;
};

function protocolClient(
  input: {
    rendererCode?: `0x${string}`;
    previewHarnessCode?: `0x${string}`;
    mediaStoreFactoryHash?: `0x${string}`;
    rendererSchema?: `0x${string}`;
    tokenListed?: boolean;
  } = {},
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
      if (address === renderer) {
        if (functionName === "rendererSchema") {
          return Promise.resolve(
            input.rendererSchema ?? membershipRendererSchema,
          );
        }
        if (functionName === "rendererName") {
          return Promise.resolve("FOUNDING SIX");
        }
        if (functionName === "engineCount") return Promise.resolve(6);
        if (functionName === "engineName") {
          return Promise.resolve(foundingEngineNames[Number(args?.[0])]);
        }
      }
      const values: Record<string, unknown> = {
        paymentTokenCount: 2n,
        paymentTokens: [paymentToken, stockToken],
        isPaymentTokenListed: input.tokenListed ?? true,
        rendererSchema: membershipRendererSchema,
        mediaStoreFactory,
        mediaStoreFactoryRuntimeCodehash:
          input.mediaStoreFactoryHash ?? keccak256(mediaStoreFactoryCode),
        owner,
        pendingOwner,
        feeRecipient,
        protocolFeeBps: 100,
        tierCount: 4n,
        balanceOf: address === paymentToken ? 9n : 4n,
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
          ? (input.rendererCode ?? rendererCode)
          : address === previewHarness
            ? (input.previewHarnessCode ?? previewHarnessCode)
            : mediaStoreFactoryCode,
      ),
    ),
    readContract,
  } as unknown as PublicClient;
}

describe("protocol dependency reads", () => {
  it("derives direct renderer, preview harness, and media registry dependencies at one block", async () => {
    const client = protocolClient();
    const result = await readProtocolState(client, deployment);

    expect(result).toMatchObject({
      status: "valid",
      capturedBlock: 40n,
      data: {
        chainId: 46630,
        factory,
        paymentTokens: [paymentToken, stockToken],
        rendererSchema: membershipRendererSchema,
        renderer,
        rendererName: "FOUNDING SIX",
        rendererEngineCount: 6,
        rendererEngineNames: foundingEngineNames,
        previewHarness,
        mediaStoreFactory,
        owner,
        protocolFeeBps: 100,
        tierCount: 4n,
        protocolBalances: [
          { token: paymentToken, raw: 9n },
          { token: stockToken, raw: 4n },
        ],
      },
    });
    const functionNames = vi
      .mocked(client.readContract)
      .mock.calls.map(([call]) => call.functionName);
    expect(functionNames).not.toContain("rendererCount");
    expect(functionNames).not.toContain("rendererRecord");
    expect(functionNames).not.toContain("rendererVersionOf");
    for (const call of vi.mocked(client.readContract).mock.calls) {
      expect(call[0]).toMatchObject({ blockNumber: 40n });
    }
    for (const call of vi.mocked(client.getBytecode).mock.calls) {
      expect(call[0]).toMatchObject({ blockNumber: 40n });
    }
  });

  it("rejects an enumerated token that is not factory-listed", async () => {
    const result = await readProtocolDependencies(
      protocolClient({ tokenListed: false }),
      deployment,
    );
    expect(result).toMatchObject({ status: "unavailable" });
  });

  it("rejects a direct renderer without code", async () => {
    const result = await readProtocolDependencies(
      protocolClient({ rendererCode: "0x" }),
      deployment,
    );

    expect(result).toMatchObject({
      status: "interface-mismatch",
      failedChecks: ["renderer code"],
    });
  });

  it("rejects a direct renderer with the wrong schema", async () => {
    const result = await readProtocolDependencies(
      protocolClient({ rendererSchema: `0x${"ff".repeat(32)}` }),
      deployment,
    );

    expect(result).toMatchObject({
      status: "interface-mismatch",
      failedChecks: ["renderer schema"],
    });
  });

  it("rejects a preview harness without code", async () => {
    const result = await readProtocolDependencies(
      protocolClient({ previewHarnessCode: "0x" }),
      deployment,
    );

    expect(result).toMatchObject({
      status: "interface-mismatch",
      failedChecks: ["renderer preview harness code"],
    });
  });

  it("keeps the onchain media registry runtime identity check", async () => {
    const result = await readProtocolDependencies(
      protocolClient({
        mediaStoreFactoryHash: `0x${"ff".repeat(32)}`,
      }),
      deployment,
    );

    expect(result).toMatchObject({
      status: "interface-mismatch",
      failedChecks: ["media registry runtime identity"],
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
