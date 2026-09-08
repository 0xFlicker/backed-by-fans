import { getAddress, keccak256, type Address, type PublicClient } from "viem";
import { describe, expect, it, vi } from "vitest";

import {
  membershipRendererSchema,
  readProtocolDependencies,
  readProtocolState,
  readBuybackAsset,
  readProtocolActivityPage,
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
const buybackVault = getAddress("0x7777777777777777777777777777777777777777");
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

describe("public buyback ledgers and bounded history", () => {
  it("preserves known per-source inventory when external eligibility reads fail", async () => {
    const inventory = {
      available: 40n,
      totalReceived: 100n,
      totalConvertedIn: 0n,
      totalSpent: 60n,
      totalBurned: 0n,
    };
    const client = {
      readContract: vi.fn(
        async ({ functionName }: { functionName: string }) => {
          if (functionName === "processingStatus")
            throw new Error("Pons unavailable");
          return (
            {
              inventory,
              route: { pools: [] },
              policy: { terms: {}, spent: 60n },
              revision: 2n,
              assetBuybacksPaused: false,
              name: "Scaled Stock Token",
              symbol: "AMD",
              decimals: 6,
              supportsInterface: true,
              uiMultiplier: 4n * 10n ** 18n,
              newUIMultiplier: 4n * 10n ** 18n,
              effectiveAt: 0n,
            } as Record<string, unknown>
          )[functionName];
        },
      ),
    };
    const result = await readBuybackAsset(
      client as unknown as PublicClient,
      buybackVault,
      paymentToken,
      40n,
    );
    expect(result.membership).toEqual(inventory);
    expect(result.donation).toEqual(inventory);
    expect(result.conserved).toBe(true);
    expect(result.metadata?.uiMultiplier).toBe(4n * 10n ** 18n);
    expect(result.eligibility.every((x) => x.status === "unavailable")).toBe(
      true,
    );
    expect(
      client.readContract.mock.calls.every(
        ([call]) =>
          (call as unknown as { blockNumber: bigint }).blockNumber === 40n,
      ),
    ).toBe(true);
  });
  it("distinguishes conversion receipts from newly allocated revenue", async () => {
    const client = {
      readContract: vi.fn(
        async ({ functionName }: { functionName: string }) =>
          (
            ({
              inventory: {
                available: 40n,
                totalReceived: 0n,
                totalConvertedIn: 100n,
                totalSpent: 60n,
                totalBurned: 0n,
              },
              route: { pools: [] },
              policy: {},
              revision: 2n,
              assetBuybacksPaused: false,
              processingStatus: { status: 0 },
              symbol: "ETH",
              decimals: 18,
            }) as Record<string, unknown>
          )[functionName],
      ),
    };
    const result = await readBuybackAsset(
      client as unknown as PublicClient,
      buybackVault,
      paymentToken,
      40n,
    );
    expect(result.membership.totalReceived).toBe(0n);
    expect(result.membership.totalConvertedIn).toBe(100n);
    expect(result.conserved).toBe(true);
  });
  it("pages fifty logs even inside one block without overstating scanned coverage", async () => {
    const logs = Array.from({ length: 61 }, (_, i) => ({
      blockNumber: 4000n,
      logIndex: i,
      eventName: "BuybackBurned",
      args: { burned: 1n },
      address: buybackVault,
      transactionHash: `0x${"1".repeat(64)}`,
    }));
    const client = { getLogs: vi.fn().mockResolvedValue(logs) };
    const context = {
      factory,
      vault: buybackVault,
      fromBlock: 0n,
      toBlock: 4000n,
    };
    const first = await readProtocolActivityPage(
      client as unknown as PublicClient,
      context,
    );
    expect(first.rows).toHaveLength(50);
    expect(first.rows[0].logIndex).toBe(60);
    expect(first.coverage).toMatchObject({
      windowFrom: 2001n,
      windowTo: 4000n,
      completeWindow: false,
      completeHistory: false,
    });
    const second = await readProtocolActivityPage(
      client as unknown as PublicClient,
      { ...context, ...first.next! },
    );
    expect(second.rows).toHaveLength(11);
    expect(second.rows[0].logIndex).toBe(10);
    expect(
      new Set([...first.rows, ...second.rows].map((row) => row.logIndex)).size,
    ).toBe(61);
    expect(second.next).toEqual({ toBlock: 2000n });
    expect(
      client.getLogs.mock.calls.every(
        ([call]) => call.toBlock - call.fromBlock <= 1999n,
      ),
    ).toBe(true);
  });
  it("returns a real empty window and exposes the earlier range, while RPC failure remains unavailable", async () => {
    const client = { getLogs: vi.fn().mockResolvedValue([]) };
    expect(
      await readProtocolActivityPage(client as unknown as PublicClient, {
        factory,
        vault: buybackVault,
        fromBlock: 0n,
        toBlock: 4000n,
      }),
    ).toMatchObject({ rows: [], next: { toBlock: 2000n } });
    client.getLogs.mockRejectedValueOnce(new Error("RPC unavailable"));
    await expect(
      readProtocolActivityPage(client as unknown as PublicClient, {
        factory,
        vault: buybackVault,
        fromBlock: 0n,
        toBlock: 40n,
      }),
    ).rejects.toThrow("RPC unavailable");
  });
});
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
        buybackVault,
        factory,
        vault: buybackVault,
        executor: owner,
        protocolToken: paymentToken,
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
        protocolToken: paymentToken,
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
