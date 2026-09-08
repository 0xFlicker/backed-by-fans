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
const policyInput = () => ({
  asset: zeroAddress,
  expectedRevisionRaw: "2",
  expectedSafeNonceRaw: "7",
  policy: {
    validAfterRaw: "1000",
    validUntilRaw: "1900",
    batchCapRaw: "1000000000000000",
    totalBudgetRaw: "10000000000000000",
    rates: [
      { numeratorRaw: "500000000", denominatorRaw: "1", toleranceBps: 100 },
    ],
  },
  evidence: {
    reference: "retained/independent-reference.json",
    rationale: "Independent curve inputs and conservative net-output limit.",
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
      "policy",
      policyInput(),
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
    expect(decoded.functionName).toBe("setPolicy");
    expect(payload.referenceEvidence).toEqual(policyInput().evidence);
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
        "policy",
        policyInput(),
      ),
    ).rejects.toThrow("revision");
    const input = policyInput();
    input.expectedSafeNonceRaw = "6";
    await expect(
      prepareBuybackPayload(
        client as unknown as PublicClient,
        context,
        "policy",
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
  ])("rejects invalid or oversized raw budget %s", (raw) => {
    const input = policyInput();
    input.policy.totalBudgetRaw = raw;
    expect(() => parseBuybackInput("policy", input)).toThrow();
  });
  it("rejects excessive tolerance, lifetime, batch exposure and incomplete rates", () => {
    for (let i = 0; i < 4; i++) {
      const input = policyInput();
      if (i === 0) input.policy.rates[0].toleranceBps = 101;
      if (i === 1) input.policy.validUntilRaw = "87401";
      if (i === 2) input.policy.batchCapRaw = "10000000000000001";
      if (i === 3) input.policy.rates = [];
      expect(() => parseBuybackInput("policy", input)).toThrow();
    }
  });
  it("rejects arbitrary call targets, recipients and hidden input fields", () => {
    expect(() =>
      parseBuybackInput("policy", { ...policyInput(), recipient: asset }),
    ).toThrow("field");
    expect(() => parseBuybackInput("withdraw", policyInput())).toThrow(
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
