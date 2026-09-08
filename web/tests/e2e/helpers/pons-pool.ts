import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  encodeAbiParameters,
  parseAbiParameters,
  erc20Abi,
  zeroAddress,
  type Abi,
  type Address,
} from "viem";
import type { forkContext } from "./protocol-fork";

export type Pool = {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
};
export const poolParameters = parseAbiParameters(
  "(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)",
);
export async function compiledAbi(path: string): Promise<Abi> {
  return JSON.parse(
    await readFile(resolve(process.cwd(), "../contracts/out", path), "utf8"),
  ).abi;
}

// Official Universal Router commands and IV4Router.ExactInputSingleParams.
// This is test trade construction, never used by the protocol runner or app.
export async function poolTrade(
  f: Awaited<ReturnType<typeof forkContext>>,
  account: Address,
  pool: Pool,
  zeroForOne: boolean,
  amount: bigint,
) {
  const router = "0x8876789976dEcBfCbBbe364623C63652db8C0904",
    permit2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
  const input = zeroForOne ? pool.currency0 : pool.currency1;
  const output = zeroForOne ? pool.currency1 : pool.currency0;
  const [routerAbi, quoterAbi, permitAbi] = await Promise.all([
    compiledAbi("IUniversalRouter.sol/IUniversalRouter.json"),
    compiledAbi("IV4Quoter.sol/IV4Quoter.json"),
    compiledAbi("IAllowanceTransfer.sol/IAllowanceTransfer.json"),
  ]);
  const quote = await f.client.simulateContract({
    address: "0x8Dc178eFB8111BB0973Dd9d722ebeFF267c98F94",
    abi: quoterAbi,
    functionName: "quoteExactInputSingle",
    args: [{ poolKey: pool, zeroForOne, exactAmount: amount, hookData: "0x" }],
    account,
    gasPrice: 2000000000n,
  });
  const minimum = ((quote.result as readonly bigint[])[0] * 99n) / 100n;
  if (minimum === 0n) throw new Error("No positive authentic pool quote");
  const deadline = (await f.client.getBlock()).timestamp + 300n;
  if (input !== zeroAddress) {
    await f.write(account, input, erc20Abi, "approve", [permit2, amount]);
    await f.write(account, permit2, permitAbi, "approve", [
      input,
      router,
      amount,
      Number(deadline),
    ]);
  }
  const actions = [
    encodeAbiParameters(
      parseAbiParameters(
        "((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,uint256 minHopPriceX36,bytes hookData) params",
      ),
      [
        {
          poolKey: pool,
          zeroForOne,
          amountIn: amount,
          amountOutMinimum: minimum,
          minHopPriceX36: 0n,
          hookData: "0x",
        },
      ],
    ),
    encodeAbiParameters(parseAbiParameters("address,uint256"), [input, amount]),
    encodeAbiParameters(parseAbiParameters("address,uint256"), [
      output,
      minimum,
    ]),
  ];
  const receipt = await f.write(
    account,
    router,
    routerAbi,
    "execute",
    [
      "0x1004",
      [
        encodeAbiParameters(parseAbiParameters("bytes,bytes[]"), [
          "0x060c0f",
          actions,
        ]),
        encodeAbiParameters(parseAbiParameters("address,address,uint256"), [
          zeroAddress,
          account,
          0n,
        ]),
      ],
      deadline,
    ],
    input === zeroAddress ? amount : 0n,
  );
  if (input !== zeroAddress) {
    await f.write(account, input, erc20Abi, "approve", [permit2, 0n]);
    await f.write(account, permit2, permitAbi, "approve", [
      input,
      router,
      0n,
      Number(deadline),
    ]);
  }
  return { receipt, minimum };
}
