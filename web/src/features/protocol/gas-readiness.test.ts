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
  it("reserves both the wrapped ETH amount and the network fee", async () => {
    await expect(
      assertSufficientGas(client(1199n), account, { value: 1000n }),
    ).rejects.toThrow("including its ETH amount and network fee");
    await expect(
      assertSufficientGas(client(1200n), account, { value: 1000n }),
    ).resolves.toBe(200n);
  });
  it("honors an explicit caller gas limit", async () => {
    await expect(
      assertSufficientGas(client(1999n), account, { gas: 1000n }),
    ).rejects.toThrow("Fund gas before retrying");
    await expect(
      assertSufficientGas(client(2000n), account, { gas: 1000n }),
    ).resolves.toBe(2000n);
  });
  it("uses the RPC estimate without an additional safety margin", async () => {
    await expect(
      assertSufficientGas(client(199n), account, {}),
    ).rejects.toThrow("Fund gas before retrying");
    await expect(assertSufficientGas(client(200n), account, {})).resolves.toBe(
      200n,
    );
  });
});
