// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  runPreflight,
  validatePreflightEnvironment,
} from "../../scripts/protocol-fork/preflight";

import { originPin } from "../../scripts/protocol-fork/origin";

// Unit tests exercise preflight decisions using generated ABI fixtures. The
// real preflight still reads freshly compiled Foundry artifacts from disk.
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  const generated = await import("../src/contracts");
  const artifacts: Record<string, unknown> = {
    "IPons.sol/IPonsLaunchFactory.json": generated.iPonsLaunchFactoryAbi,
    "IPons.sol/IPonsMemeHook.json": generated.iPonsMemeHookAbi,
    "IPons.sol/IPonsBuybackVault.json": generated.iPonsBuybackVaultAbi,
    "IERC8056.sol/IScaledUIAmount.json": generated.iScaledUiAmountAbi,
    "IV4Quoter.sol/IV4Quoter.json": generated.iv4QuoterAbi,
  };
  return {
    ...actual,
    readFile: vi.fn(async (...args: Parameters<typeof actual.readFile>) => {
      const path = String(args[0]);
      const marker = "/contracts/out/";
      if (!path.includes(marker)) return actual.readFile(...args);
      const artifact = path.slice(path.indexOf(marker) + marker.length);
      if (!(artifact in artifacts)) {
        throw new Error(`Missing unit-test artifact fixture: ${artifact}`);
      }
      return JSON.stringify({ abi: artifacts[artifact] });
    }),
  };
});

const blockHash = originPin.blockHash as `0x${string}`;
const origin = { blockNumber: BigInt(originPin.blockNumber), blockHash };
const factory = "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e" as const;

function client() {
  return {
    getChainId: vi.fn().mockResolvedValue(4663),
    getBlock: vi.fn().mockResolvedValue({
      number: origin.blockNumber,
      hash: blockHash,
      timestamp: 1788790000n,
    }),
    getCode: vi.fn().mockResolvedValue("0x6000"),
    readContract: vi
      .fn()
      .mockImplementation(
        async ({ functionName }: { functionName: string }) => {
          if (functionName === "launchEnabled") return true;
          if (functionName === "getLaunchConfig")
            return {
              supply: 10n ** 27n,
              curveFeeBps: 100n,
              phantomQuote: 168n * 10n ** 16n,
              graduationThreshold: 420n * 10n ** 16n,
              poolFee: 0,
              tickSpacing: 200,
              enabled: true,
            };
          if (functionName === "previewLaunchEconomics") return blockHash;
          if (
            ["launchFee", "snipeTaxStartBps", "snipeTaxSeconds"].includes(
              functionName,
            )
          )
            return 1n;
          return factory;
        },
      ),
  };
}

describe("strict fork preflight", () => {
  it("requires a nonzero official quote along a correctly connected route", async () => {
    const rpc = client();
    const originalRead = rpc.readContract.getMockImplementation()!;
    rpc.readContract.mockImplementation(
      async (request: { functionName: string }) =>
        request.functionName === "quoteExactInputSingle"
          ? [50n, 80000n]
          : originalRead(request),
    );
    const asset = "0x000000000000000000000000000000000000000a" as const;
    const native = "0x0000000000000000000000000000000000000000" as const;
    const inputs = {
      quoter: factory,
      assets: [{ kind: "usdg" as const, address: asset, decimals: 6 }],
      routes: {
        usdg: {
          amountInRaw: "100",
          pools: [
            {
              currency0: native,
              currency1: asset,
              fee: 0,
              tickSpacing: 200,
              hooks: native,
            },
          ],
        },
      },
    };
    const report = await runPreflight(rpc, origin, inputs);
    expect(
      report.checks.find((check) => check.id === "routes.usdg")?.status,
    ).toBe("passed");
    const quoteCall = rpc.readContract.mock.calls.find(
      ([request]) => request.functionName === "quoteExactInputSingle",
    )?.[0];
    expect(quoteCall?.args).toEqual([
      {
        poolKey: inputs.routes.usdg.pools[0],
        zeroForOne: false,
        exactAmount: 100n,
        hookData: "0x",
      },
    ]);
    rpc.readContract.mockImplementation(
      async (request: { functionName: string }) =>
        request.functionName === "quoteExactInputSingle"
          ? [0n, 80000n]
          : originalRead(request),
    );
    const zeroQuote = await runPreflight(rpc, origin, inputs);
    expect(
      zeroQuote.checks.find((check) => check.id === "routes.usdg")?.status,
    ).toBe("failed");
  });

  it("rejects an unrelated pool without treating its quote as the asset's route", async () => {
    const rpc = client();
    const native = "0x0000000000000000000000000000000000000000" as const;
    const result = await runPreflight(rpc, origin, {
      quoter: factory,
      assets: [{ kind: "usdg", address: factory, decimals: 6 }],
      routes: {
        usdg: {
          amountInRaw: "100",
          pools: [
            {
              currency0: native,
              currency1: "0x000000000000000000000000000000000000000a",
              fee: 0,
              tickSpacing: 200,
              hooks: native,
            },
          ],
        },
      },
    });
    expect(
      result.checks.find((check) => check.id === "routes.usdg")?.status,
    ).toBe("failed");
    expect(
      rpc.readContract.mock.calls.some(
        ([request]) => request.functionName === "quoteExactInputSingle",
      ),
    ).toBe(false);
  });

  it("uses the checked-in pin and rejects invalid overrides before network access", () => {
    expect(() => validatePreflightEnvironment({})).toThrow("BBF_FORK_RPC_URL");
    expect(() =>
      validatePreflightEnvironment({ BBF_FORK_BLOCK_NUMBER: "latest" }),
    ).toThrow("BBF_FORK_BLOCK_NUMBER");
  });

  it("requires matching canonical block identity and fails before dependency reads", async () => {
    const rpc = client();
    rpc.getBlock.mockResolvedValue({
      number: origin.blockNumber,
      hash: `0x${"2".repeat(64)}`,
      timestamp: 0n,
    });
    const result = await runPreflight(rpc, origin);
    expect(result.status).toBe("failed");
    expect(
      result.checks.find((check) => check.id === "origin.block")?.status,
    ).toBe("failed");
    expect(rpc.readContract).not.toHaveBeenCalled();
  });

  it("rejects a wrong origin chain before using its state", async () => {
    const rpc = client();
    rpc.getChainId.mockResolvedValue(1);
    const result = await runPreflight(rpc, origin);
    expect(result.status).toBe("failed");
    expect(rpc.getBlock).not.toHaveBeenCalled();
  });

  it("pins every state/code request and keeps missing asset/source gates failed", async () => {
    const rpc = client();
    const result = await runPreflight(rpc, origin);
    expect(rpc.getCode).toHaveBeenCalled();
    for (const [request] of [
      ...rpc.getCode.mock.calls,
      ...rpc.readContract.mock.calls,
    ]) {
      expect(request.blockNumber).toBe(origin.blockNumber);
      expect(request.blockTag).toBeUndefined();
    }
    expect(
      result.checks.find((check) => check.id === "assets.stock")?.status,
    ).toBe("failed");
    expect(
      result.checks.find(
        (check) => check.id === "sources.verified-input-coverage",
      )?.status,
    ).toBe("failed");
    expect(result.status).toBe("failed");
  });

  it("does not turn absent code or failed archive reads into a mock or latest-state success", async () => {
    const rpc = client();
    rpc.getCode.mockResolvedValue(undefined);
    rpc.readContract.mockRejectedValue(
      new Error("secret upstream https://provider.example/private-key"),
    );
    const result = await runPreflight(rpc, origin);
    expect(result.status).toBe("failed");
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("private-key");
    expect(serialized).not.toContain("provider.example");
    expect(
      result.checks.some(
        (check) => check.reason === "Historical contract read failed",
      ),
    ).toBe(true);
  });

  it("rejects evidence inside a disposable directory and credentials in a local URL", () => {
    const values = {
      BBF_FORK_BLOCK_NUMBER: originPin.blockNumber,
      BBF_FORK_BLOCK_HASH: blockHash,
      BBF_FORK_RPC_URL: "https://private.example",
      BBF_FORK_EVIDENCE_DIR: "/tmp/run/evidence",
      BBF_FORK_TEMP_DIR: "/tmp/run",
    };
    expect(() => validatePreflightEnvironment(values)).toThrow("outside");
    expect(() =>
      validatePreflightEnvironment({
        ...values,
        BBF_FORK_EVIDENCE_DIR: "/tmp/evidence",
        BBF_FORK_EXECUTION_RPC_URL: "http://key:secret@127.0.0.1:8547",
      }),
    ).toThrow("loopback");
  });
});
