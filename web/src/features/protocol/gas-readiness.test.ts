import { getAddress, type PublicClient } from "viem";
import { describe, expect, it, vi } from "vitest";

import { assertSufficientGas } from "@/features/protocol/gas-readiness";

const account = getAddress("0x1111111111111111111111111111111111111111");

function client(balance: bigint) {
  return {
    getBalance: vi.fn().mockResolvedValue(balance),
    estimateContractGas: vi.fn().mockResolvedValue(100n),
    getGasPrice: vi.fn().mockResolvedValue(2n),
  } as unknown as PublicClient;
}

describe("gas readiness", () => {
  it("requires a twenty-percent safety margin before returning a write", async () => {
    await expect(
      assertSufficientGas(client(239n), account, {}),
    ).rejects.toThrow("Fund gas before retrying");
    await expect(assertSufficientGas(client(240n), account, {})).resolves.toBe(
      240n,
    );
  });
});
