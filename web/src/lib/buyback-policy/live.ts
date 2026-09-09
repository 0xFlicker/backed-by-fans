import {
  encodeAbiParameters,
  keccak256,
  zeroAddress,
  getAddress,
  type PublicClient,
  type Address,
  type Hex,
} from "viem";
import {
  protocolBuybackVaultAbi,
  ponsBuybackExecutorAbi,
  iPonsBondingCurveAbi,
  iPonsLaunchFactoryAbi,
  iPoolManagerAbi,
  iv4QuoterAbi,
} from "../../contracts";
import manifest from "../../../../contracts/external/verification/4663/sources.json" with { type: "json" };
import type { Pool } from "./model";
import { fraction, dragBps, type Fraction } from "./math";
const records = manifest.records;
const manager = getAddress(records.poolManager.address),
  quoter = getAddress(records.quoter.address),
  launchFactory = getAddress(records.factory.address),
  weth = getAddress(records.weth.address);
export async function readMarketState(
  client: PublicClient,
  input: {
    vault: Address;
    asset: Address;
    protocolToken: Address;
    blockNumber: bigint;
  },
) {
  const { vault, asset, protocolToken, blockNumber } = input;
  if (protocolToken === zeroAddress)
    throw new Error(
      "Protocol token has not been deployed. Buyback quotes will be available after launch.",
    );
  const [executor, route] = await Promise.all([
    client.readContract({
      address: vault,
      abi: protocolBuybackVaultAbi,
      functionName: "executor",
      blockNumber,
    }),
    client.readContract({
      address: vault,
      abi: protocolBuybackVaultAbi,
      functionName: "route",
      args: [asset],
      blockNumber,
    }),
  ]);
  const [curve, lifecycle, launch] = await Promise.all([
    client.readContract({
      address: executor,
      abi: ponsBuybackExecutorAbi,
      functionName: "curve",
      blockNumber,
    }),
    client.readContract({
      address: executor,
      abi: ponsBuybackExecutorAbi,
      functionName: "lifecycle",
      blockNumber,
    }),
    client.readContract({
      address: launchFactory,
      abi: iPonsLaunchFactoryAbi,
      functionName: "getLaunchedToken",
      args: [protocolToken],
      blockNumber,
    }),
  ]);
  if (
    !launch.exists ||
    launch.curve.toLowerCase() !== curve.toLowerCase() ||
    launch.pairToken !== zeroAddress
  )
    throw new Error("Pons launch identity mismatch");
  if (lifecycle === 1)
    throw new Error(
      "Graduation pending: wait for the canonical pool to become available",
    );
  const pools = route.pools.map((p) => ({ ...p }));
  let cursor = asset === weth ? zeroAddress : asset;
  const legs: {
    input: Address;
    output: Address;
    pool?: Pool;
    marginal: Fraction;
  }[] = [];
  const poolMarginal = async (pool: Pool, from: Address) => {
    if (
      from.toLowerCase() !== pool.currency0.toLowerCase() &&
      from.toLowerCase() !== pool.currency1.toLowerCase()
    )
      throw new Error("Disconnected conversion route");
    const poolId = keccak256(
      encodeAbiParameters(
        [
          { type: "address" },
          { type: "address" },
          { type: "uint24" },
          { type: "int24" },
          { type: "address" },
        ],
        [
          pool.currency0,
          pool.currency1,
          pool.fee,
          pool.tickSpacing,
          pool.hooks,
        ],
      ),
    );
    // Uniswap v4 StateLibrary: pools mapping at slot 6, slot0 low 160 bits is sqrtPriceX96.
    const slot = keccak256(
      encodeAbiParameters(
        [{ type: "bytes32" }, { type: "uint256" }],
        [poolId, 6n],
      ),
    );
    const word = await client.readContract({
      address: manager,
      abi: iPoolManagerAbi,
      functionName: "extsload",
      args: [slot],
      blockNumber,
    });
    const sqrt = BigInt(word as Hex) & ((1n << 160n) - 1n);
    if (sqrt === 0n) throw new Error("Pool is not initialized");
    return from.toLowerCase() === pool.currency0.toLowerCase()
      ? fraction(sqrt * sqrt, 1n << 192n)
      : fraction(1n << 192n, sqrt * sqrt);
  };
  for (const pool of pools) {
    const output =
      cursor.toLowerCase() === pool.currency0.toLowerCase()
        ? pool.currency1
        : pool.currency0;
    legs.push({
      input: cursor,
      output,
      pool,
      marginal: await poolMarginal(pool, cursor),
    });
    cursor = output;
  }
  if (cursor.toLowerCase() === weth.toLowerCase()) cursor = zeroAddress;
  if (cursor !== zeroAddress)
    throw new Error("Conversion route does not end in native ETH");
  let curveTerms:
    | {
        quote: bigint;
        tokens: bigint;
        fee: bigint;
        tax: bigint;
        sellable: bigint;
      }
    | undefined;
  if (lifecycle === 0) {
    const [quote, tokens, fee, tax, sellable, penalty] = await Promise.all([
      client.readContract({
        address: curve,
        abi: iPonsBondingCurveAbi,
        functionName: "quoteReserve",
        blockNumber,
      }),
      client.readContract({
        address: curve,
        abi: iPonsBondingCurveAbi,
        functionName: "tokenReserve",
        blockNumber,
      }),
      client.readContract({
        address: curve,
        abi: iPonsBondingCurveAbi,
        functionName: "feeBps",
        blockNumber,
      }),
      client.readContract({
        address: curve,
        abi: iPonsBondingCurveAbi,
        functionName: "creatorTaxBps",
        blockNumber,
      }),
      client.readContract({
        address: curve,
        abi: iPonsBondingCurveAbi,
        functionName: "sellableTokens",
        blockNumber,
      }),
      client.readContract({
        address: curve,
        abi: iPonsBondingCurveAbi,
        functionName: "currentSnipeTaxBps",
        args: [executor],
        blockNumber,
      }),
    ]);
    if (penalty !== 0n)
      throw new Error("Launch anti-sniping penalty is active");
    curveTerms = { quote, tokens, fee, tax, sellable };
    legs.push({
      input: zeroAddress,
      output: protocolToken,
      marginal: fraction(tokens, quote),
    });
  } else {
    const hook = await client.readContract({
      address: launchFactory,
      abi: iPonsLaunchFactoryAbi,
      functionName: "memeHook",
      blockNumber,
    });
    const pool = {
      currency0: zeroAddress,
      currency1: protocolToken,
      fee: launch.poolFee,
      tickSpacing: launch.tickSpacing,
      hooks: hook,
    };
    legs.push({
      input: zeroAddress,
      output: protocolToken,
      pool,
      marginal: await poolMarginal(pool, zeroAddress),
    });
  }
  return {
    executor,
    curve,
    lifecycle,
    route: pools,
    legs,
    curveTerms,
    blockNumber,
  };
}
export async function quoteMarket(
  client: PublicClient,
  market: Awaited<ReturnType<typeof readMarketState>>,
  amount: bigint,
) {
  let cursor = amount;
  const outputs: {
    input: Address;
    output: Address;
    inputRaw: bigint;
    outputRaw: bigint;
    marginal: Fraction;
    feeRaw?: bigint;
    priceImpactBps?: bigint;
  }[] = [];
  for (const leg of market.legs) {
    let output: bigint,
      spent = cursor;
    if (leg.pool) {
      if (cursor >= 2n ** 128n) throw new Error("Quote input exceeds uint128");
      const q = await client.simulateContract({
        address: quoter,
        abi: iv4QuoterAbi,
        functionName: "quoteExactInputSingle",
        args: [
          {
            poolKey: leg.pool,
            zeroForOne:
              leg.input.toLowerCase() === leg.pool.currency0.toLowerCase(),
            exactAmount: cursor,
            hookData: "0x",
          },
        ],
        blockNumber: market.blockNumber,
      });
      output = q.result[0];
    } else {
      const c = market.curveTerms!;
      const net =
        cursor - (cursor * c.fee) / 10000n - (cursor * c.tax) / 10000n;
      output = (net * c.tokens) / (c.quote + net);
      if (output > c.sellable) {
        output = c.sellable;
        const netRequired = (c.quote * output) / (c.tokens - output) + 1n;
        spent =
          (netRequired * 10000n + (10000n - c.fee - c.tax) - 1n) /
          (10000n - c.fee - c.tax);
        if (spent > cursor) spent = cursor;
      }
    }
    if (output <= 0n || spent <= 0n)
      throw new Error("Proposed batch rounds to zero output");
    const feeRaw = leg.pool
      ? undefined
      : (spent * market.curveTerms!.fee) / 10000n +
        (spent * market.curveTerms!.tax) / 10000n;
    outputs.push({
      input: leg.input,
      output: leg.output,
      inputRaw: spent,
      outputRaw: output,
      marginal: leg.marginal,
      feeRaw,
      priceImpactBps:
        feeRaw === undefined
          ? undefined
          : dragBps(spent - feeRaw, output, leg.marginal),
    });
    cursor = output;
  }
  return outputs;
}
