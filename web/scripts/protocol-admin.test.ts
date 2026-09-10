// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  BaseError,
  ContractFunctionRevertedError,
  ContractFunctionExecutionError,
  decodeFunctionData,
  zeroAddress,
  type PublicClient,
} from "viem";
import { protocolBuybackVaultAbi } from "../src/contracts";
import {
  parseBuybackInput,
  prepareBuybackPayload,
  preparePaymentTokenPayload,
  prepareMinimumPaymentPayload,
  validateAdminRpc,
  type AdminContext,
} from "./protocol-admin";
const asset = "0x1111111111111111111111111111111111111111";
const context: AdminContext = {
  chainId: 31337,
  blockNumber: 10n,
  blockTimestamp: 1000n,
  safe: asset,
  safeNonce: 7n,
  factory: asset,
  vault: asset,
  protocolToken: asset,
  factoryCodeHash: `0x${"1".repeat(64)}`,
  vaultCodeHash: `0x${"2".repeat(64)}`,
  version: "protocol-buyback-burn-v1",
};
const limitsInput = () => ({
  asset: zeroAddress,
  expectedRevisionRaw: "2",
  expectedSafeNonceRaw: "7",
  limits: {
    minInput: "1000",
    maxInput: "10000000000000000",
    minInterval: "3600",
  },
});

describe("optional token capabilities", () => {
  function tokenClient(error: BaseError) {
    return {
      readContract: vi.fn(
        async ({ functionName }: { functionName: string }) => {
          if (functionName === "supportsInterface")
            throw new ContractFunctionExecutionError(error, {
              abi: [],
              functionName,
            });
          return (
            {
              name: "Wrapped Ether",
              symbol: "WETH",
              decimals: 18,
              isPaymentTokenListed: false,
              isPaymentTokenEnabled: false,
              balanceOf: 0n,
            } as Record<string, unknown>
          )[functionName];
        },
      ),
      simulateContract: vi.fn().mockResolvedValue({ request: {} }),
    };
  }
  it("accepts an ERC20 that reverts on optional ERC165 calls", async () => {
    const client = tokenClient(
      new ContractFunctionRevertedError({
        abi: [],
        functionName: "supportsInterface",
        data: "0x",
      }),
    );
    const payload = await preparePaymentTokenPayload(
      client as unknown as PublicClient,
      context,
      asset,
      true,
    );
    expect(payload.metadata).toMatchObject({ symbol: "WETH", decimals: 18 });
    expect(client.simulateContract).toHaveBeenCalledOnce();
  });
  it("prepares a Safe minimum update and rejects values outside positive uint112", async () => {
    const client = tokenClient(
      new ContractFunctionRevertedError({
        abi: [],
        functionName: "supportsInterface",
        data: "0x",
      }),
    );
    const payload = await prepareMinimumPaymentPayload(
      client as unknown as PublicClient,
      context,
      asset,
      1_000_000n,
    );
    expect(payload.decoded).toMatchObject({
      functionName: "setMinimumPayment",
      args: [asset, 1_000_000n],
    });
    expect(payload.postconditions).toEqual({
      paymentToken: asset,
      minimumPayment: 1_000_000n,
    });
    expect(client.simulateContract).toHaveBeenCalledWith(
      expect.objectContaining({ account: context.safe, blockNumber: 10n }),
    );
    for (const minimum of [0n, -1n, 1n << 112n]) {
      await expect(
        prepareMinimumPaymentPayload(
          client as unknown as PublicClient,
          context,
          asset,
          minimum,
        ),
      ).rejects.toThrow("positive uint112");
    }
    expect(client.simulateContract).toHaveBeenCalledOnce();
  });
  it("propagates transport failures instead of declaring an asset unscaled", async () => {
    const client = tokenClient(new BaseError("RPC unavailable"));
    await expect(
      preparePaymentTokenPayload(
        client as unknown as PublicClient,
        context,
        asset,
        true,
      ),
    ).rejects.toThrow("RPC unavailable");
    expect(client.simulateContract).not.toHaveBeenCalled();
  });
});

describe("buyback administration payloads", () => {
  it("emits decoded, bounded Safe Call payloads without signing or submission", async () => {
    const client = {
      readContract: vi.fn().mockResolvedValue(2n),
      simulateContract: vi.fn().mockResolvedValue({ request: {} }),
    };
    const payload = await prepareBuybackPayload(
      client as unknown as PublicClient,
      context,
      "limits",
      limitsInput(),
    );
    expect(payload).toMatchObject({
      chainId: 31337,
      safe: asset,
      safeNonce: "7",
      operation: 0,
      value: "0",
      previousRevision: "2",
      expectedRevision: "3",
      to: asset,
    });
    const decoded = decodeFunctionData({
      abi: protocolBuybackVaultAbi,
      data: payload.data,
    });
    expect(decoded.functionName).toBe("setLimits");
    expect(client.simulateContract).toHaveBeenCalledOnce();
    expect(payload).not.toHaveProperty("privateKey");
  });
  it("rejects stale nonce and revisions before preparing a transaction", async () => {
    const client = {
      readContract: vi.fn().mockResolvedValue(3n),
      simulateContract: vi.fn(),
    };
    await expect(
      prepareBuybackPayload(
        client as unknown as PublicClient,
        context,
        "limits",
        limitsInput(),
      ),
    ).rejects.toThrow("revision");
    const input = limitsInput();
    input.expectedSafeNonceRaw = "6";
    await expect(
      prepareBuybackPayload(
        client as unknown as PublicClient,
        context,
        "limits",
        input,
      ),
    ).rejects.toThrow("nonce");
    expect(client.simulateContract).not.toHaveBeenCalled();
  });
  it.each([
    "0",
    "-1",
    "1.5",
    "1e18",
    "01",
    "340282366920938463463374607431768211456",
  ])("rejects invalid or oversized raw maximum %s", (raw) => {
    const input = limitsInput();
    input.limits.maxInput = raw;
    expect(() => parseBuybackInput("limits", input)).toThrow();
  });
  it("rejects inverted batch bounds and out-of-range intervals", () => {
    const input = limitsInput();
    input.limits.minInput = "10000000000000001";
    expect(() => parseBuybackInput("limits", input)).toThrow("Maximum");
    input.limits.minInput = "1";
    input.limits.minInterval = (2n ** 64n).toString();
    expect(() => parseBuybackInput("limits", input)).toThrow();
  });
  it("supports a standing global interval without an expiry", () => {
    expect(
      parseBuybackInput("interval", {
        expectedSafeNonceRaw: "7",
        minInterval: "3600",
      }),
    ).toMatchObject({ method: "setGlobalMinInterval", args: [3600n] });
  });
  it("rejects arbitrary call targets, recipients and hidden input fields", () => {
    expect(() =>
      parseBuybackInput("limits", { ...limitsInput(), recipient: asset }),
    ).toThrow("field");
    expect(() => parseBuybackInput("withdraw", limitsInput())).toThrow(
      "action",
    );
    expect(() =>
      parseBuybackInput("route", {
        asset,
        expectedRevisionRaw: "0",
        expectedSafeNonceRaw: "7",
        pools: [],
        target: asset,
      }),
    ).toThrow("field");
  });
  it("allows only the typed conversion path and rejects nonzero hooks", () => {
    const input = {
      asset,
      expectedRevisionRaw: "0",
      expectedSafeNonceRaw: "7",
      pools: [
        {
          currency0: zeroAddress,
          currency1: asset,
          fee: 100,
          tickSpacing: 1,
          hooks: asset,
        },
      ],
    };
    expect(() => parseBuybackInput("route", input)).toThrow("hook");
    input.pools[0].hooks = zeroAddress;
    expect(parseBuybackInput("route", input).method).toBe("setRoute");
  });
});

describe("administration endpoints", () => {
  it("keeps fork endpoints loopback-only and rejects unknown networks", () => {
    expect(validateAdminRpc("forknet", "http://127.0.0.1:8547").chainId).toBe(
      31337,
    );
    for (const url of [
      "https://mainnet.example",
      "http://user:key@127.0.0.1:8547",
      "http://127.0.0.1:8547/proxy",
      "http://127.0.0.1:8547?upstream=x",
    ])
      expect(() => validateAdminRpc("forknet", url)).toThrow();
    expect(() =>
      validateAdminRpc("unknown", "http://127.0.0.1:8547"),
    ).toThrow();
  });
});

it("rejects a wrong RPC chain before fetching addresses or signing context", async () => {
  const { readAdminContext } = await import("./protocol-admin");
  const client = {
    getChainId: vi.fn().mockResolvedValue(4663),
    getBlock: vi.fn(),
    readContract: vi.fn(),
  };
  await expect(
    readAdminContext(client as unknown as PublicClient, 31337, asset),
  ).rejects.toThrow("chain mismatch");
  expect(client.getBlock).not.toHaveBeenCalled();
  expect(client.readContract).not.toHaveBeenCalled();
});
