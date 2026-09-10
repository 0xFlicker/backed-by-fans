import { zeroAddress, type Address, type PublicClient } from "viem";
import { membershipFactoryAbi, protocolBuybackVaultAbi } from "@/contracts";
import { readPoolMarginal } from "./buyback-policy/live";
import { fraction } from "./buyback-policy/math";
import manifest from "../../../contracts/external/verification/4663/sources.json";

const usdg: Address = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const weth = manifest.records.weth.address.toLowerCase();

/** Raw USDG per raw token, from the configured conversion pools at one block. */
export async function readRewardUsdPrices(
  client: PublicClient,
  factory: Address,
  tokens: Address[],
) {
  const blockNumber = await client.getBlockNumber();
  const vault = await client.readContract({
    address: factory,
    abi: membershipFactoryAbi,
    functionName: "buybackVault",
    blockNumber,
  });
  async function nativePrice(token: Address) {
    if (token === zeroAddress || token.toLowerCase() === weth)
      return fraction(1n, 1n);
    const route = await client.readContract({
      address: vault,
      abi: protocolBuybackVaultAbi,
      functionName: "route",
      args: [token],
      blockNumber,
    });
    let cursor = token;
    let price = fraction(1n, 1n);
    for (const pool of route.pools) {
      const leg = await readPoolMarginal(client, pool, cursor, blockNumber);
      price = fraction(
        price.numerator * leg.numerator,
        price.denominator * leg.denominator,
      );
      cursor =
        cursor.toLowerCase() === pool.currency0.toLowerCase()
          ? pool.currency1
          : pool.currency0;
    }
    if (cursor !== zeroAddress && cursor.toLowerCase() !== weth)
      throw new Error("No USD conversion route");
    return price;
  }
  const usdNative = await nativePrice(usdg);
  return Promise.all(
    tokens.map(async (token) => {
      const native =
        token.toLowerCase() === usdg.toLowerCase()
          ? usdNative
          : await nativePrice(token);
      return {
        token,
        price: fraction(
          native.numerator * usdNative.denominator,
          native.denominator * usdNative.numerator,
        ),
      };
    }),
  );
}

export function formatRewardUsd(
  amount: bigint,
  price: { numerator: bigint; denominator: bigint },
  locale?: string,
) {
  const cents = (amount * price.numerator) / (price.denominator * 10_000n);
  if (amount > 0n && cents === 0n)
    return (
      "< " +
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "USD",
      }).format(0.01)
    );
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
  }).format(Number(cents) / 100);
}
