import {
  ContractFunctionRevertedError,
  getAddress,
  type Address,
  type PublicClient,
} from "viem";
import { describe, expect, it, vi } from "vitest";

import {
  erc8056CoreInterfaceId,
  erc8056PendingInterfaceId,
  readAcceptedPaymentTokens,
} from "@/lib/payment-token-read";
import { tokenMultiplierScale } from "@/lib/token-amount";

const factory = getAddress("0x1111111111111111111111111111111111111111");
const wallet = getAddress("0x2222222222222222222222222222222222222222");
const usdg = getAddress("0x3333333333333333333333333333333333333333");
const stock = getAddress("0xe7f1725e7734ce288f8367e1bb143e90bb3f0512");

function tokenClient(
  input: {
    failStockMultiplier?: boolean;
    revertUnscaledInterfaceProbe?: boolean;
  } = {},
) {
  const readContract = vi.fn(
    ({
      address,
      functionName,
      args,
      blockNumber,
    }: {
      address: Address;
      functionName: string;
      args?: readonly unknown[];
      blockNumber?: bigint;
    }) => {
      expect(blockNumber).toBe(90n);
      if (address === factory) {
        if (functionName === "paymentTokenCount") return Promise.resolve(2n);
        if (functionName === "paymentTokens") {
          expect(args).toEqual([0n, 100n]);
          return Promise.resolve([usdg, stock]);
        }
        if (functionName === "isPaymentTokenListed") {
          return Promise.resolve(true);
        }
        if (functionName === "isPaymentTokenEnabled") {
          return Promise.resolve(true);
        }
      }
      const isStock = address === stock;
      if (functionName === "name") {
        return Promise.resolve(isStock ? "AMD" : "Global Dollar");
      }
      if (functionName === "symbol") {
        return Promise.resolve(isStock ? "AMD" : "USDG");
      }
      if (functionName === "decimals") {
        return Promise.resolve(isStock ? 18 : 6);
      }
      if (functionName === "supportsInterface") {
        if (!isStock && input.revertUnscaledInterfaceProbe) {
          return Promise.reject(
            new ContractFunctionRevertedError({
              abi: [
                {
                  type: "function",
                  name: "supportsInterface",
                  stateMutability: "view",
                  inputs: [{ name: "interfaceId", type: "bytes4" }],
                  outputs: [{ name: "supported", type: "bool" }],
                },
              ],
              functionName: "supportsInterface",
            }),
          );
        }
        expect(args?.[0]).toMatch(
          new RegExp(
            `^(${erc8056CoreInterfaceId}|${erc8056PendingInterfaceId})$`,
          ),
        );
        return Promise.resolve(isStock);
      }
      if (functionName === "balanceOf") {
        expect(args).toEqual([wallet]);
        return Promise.resolve(isStock ? 10n : 0n);
      }
      if (functionName === "uiMultiplier") {
        if (input.failStockMultiplier) return Promise.reject(new Error("RPC"));
        return Promise.resolve(2n * tokenMultiplierScale);
      }
      if (functionName === "newUIMultiplier") {
        return Promise.resolve(3n * tokenMultiplierScale);
      }
      if (functionName === "effectiveAt") return Promise.resolve(500n);
      return Promise.reject(new Error(`Unexpected read ${functionName}`));
    },
  );
  return {
    getBlockNumber: vi.fn().mockResolvedValue(90n),
    readContract,
  } as unknown as PublicClient;
}

describe("accepted payment-token reads", () => {
  it("composes registry, metadata, capability, multiplier, and wallet state at one block", async () => {
    const result = await readAcceptedPaymentTokens(tokenClient(), {
      chainId: 46630,
      factory,
      wallet,
    });
    expect(result).toEqual({
      status: "valid",
      capturedBlock: 90n,
      failures: [],
      data: [
        {
          chainId: 46630,
          factory,
          address: stock,
          registryIndex: 1,
          listed: true,
          enabled: true,
          name: "AMD",
          symbol: "AMD",
          decimals: 18,
          scaledUI: true,
          uiMultiplier: 2n * tokenMultiplierScale,
          newUIMultiplier: 3n * tokenMultiplierScale,
          effectiveAt: 500n,
          walletRawBalance: 10n,
          readBlock: 90n,
        },
        {
          chainId: 46630,
          factory,
          address: usdg,
          registryIndex: 0,
          listed: true,
          enabled: true,
          name: "Global Dollar",
          symbol: "USDG",
          decimals: 6,
          scaledUI: false,
          uiMultiplier: tokenMultiplierScale,
          newUIMultiplier: tokenMultiplierScale,
          effectiveAt: 0n,
          walletRawBalance: 0n,
          readBlock: 90n,
        },
      ],
    });
  });

  it("scopes a multiplier RPC failure to the affected token", async () => {
    const result = await readAcceptedPaymentTokens(
      tokenClient({ failStockMultiplier: true }),
      { chainId: 46630, factory, wallet },
    );
    expect(result).toMatchObject({
      status: "partial",
      data: [{ address: usdg }],
      failures: [
        {
          address: stock,
          registryIndex: 1,
          operation: "current UI multiplier",
        },
      ],
    });
  });

  it("uses a supplied captured block without fetching a newer one", async () => {
    const client = tokenClient();
    const result = await readAcceptedPaymentTokens(client, {
      chainId: 46630,
      factory,
      blockNumber: 90n,
    });
    expect(result.status).toBe("valid");
    expect(client.getBlockNumber).not.toHaveBeenCalled();
  });

  it("treats an optional interface-probe revert as an unscaled ERC-20", async () => {
    const result = await readAcceptedPaymentTokens(
      tokenClient({ revertUnscaledInterfaceProbe: true }),
      { chainId: 46630, factory },
    );
    expect(result).toMatchObject({
      status: "valid",
      data: [
        { address: usdg, scaledUI: false, uiMultiplier: tokenMultiplierScale },
        { address: stock, scaledUI: true },
      ],
    });
  });
});
