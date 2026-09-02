import {
  BaseError,
  ContractFunctionRevertedError,
  ContractFunctionZeroDataError,
  erc20Abi,
  getAddress,
  type Address,
  type PublicClient,
} from "viem";

import { membershipFactoryAbi } from "@/contracts";
import { classifyReadError } from "@/lib/read-state";
import { tokenMultiplierScale } from "@/lib/token-amount";

export const erc8056CoreInterfaceId = "0xa60bf13d" as const;
export const erc8056PendingInterfaceId = "0x4bd27648" as const;
export const paymentTokenPageSize = 100n;

const erc165Abi = [
  {
    type: "function",
    name: "supportsInterface",
    stateMutability: "view",
    inputs: [{ name: "interfaceId", type: "bytes4" }],
    outputs: [{ name: "supported", type: "bool" }],
  },
] as const;

const erc8056Abi = [
  {
    type: "function",
    name: "uiMultiplier",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "multiplier", type: "uint256" }],
  },
  {
    type: "function",
    name: "newUIMultiplier",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "multiplier", type: "uint256" }],
  },
  {
    type: "function",
    name: "effectiveAt",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "timestamp", type: "uint256" }],
  },
] as const;

export type AcceptedPaymentToken = {
  chainId: 4663 | 46630 | 31337;
  factory: Address;
  address: Address;
  registryIndex: number;
  listed: boolean;
  enabled: boolean;
  name: string;
  symbol: string;
  decimals: number;
  scaledUI: boolean;
  uiMultiplier: bigint;
  newUIMultiplier: bigint;
  effectiveAt: bigint;
  walletRawBalance?: bigint;
  readBlock: bigint;
};

export type PaymentTokenReadFailure = {
  address: Address;
  registryIndex: number;
  operation: string;
  label: string;
};

export type AcceptedPaymentTokenReadState =
  | {
      status: "valid" | "partial";
      capturedBlock: bigint;
      data: AcceptedPaymentToken[];
      failures: PaymentTokenReadFailure[];
    }
  | { status: "rate-limited"; label: string }
  | { status: "unavailable"; label: string };

class TokenReadError extends Error {
  constructor(
    readonly operation: string,
    cause: unknown,
  ) {
    super(`Unable to read ${operation}.`, { cause });
  }
}

async function requiredRead<T>(operation: string, read: () => Promise<T>) {
  try {
    return await read();
  } catch (error) {
    throw new TokenReadError(operation, error);
  }
}

async function readOptionalInterfaceSupport(
  operation: string,
  read: () => Promise<boolean>,
) {
  try {
    return await read();
  } catch (error) {
    const unsupported =
      error instanceof BaseError
        ? error.walk(
            (cause) =>
              cause instanceof ContractFunctionRevertedError ||
              cause instanceof ContractFunctionZeroDataError,
          )
        : null;
    if (unsupported) return false;
    throw new TokenReadError(operation, error);
  }
}

async function readToken(
  client: PublicClient,
  input: {
    chainId: AcceptedPaymentToken["chainId"];
    factory: Address;
    address: Address;
    registryIndex: number;
    wallet?: Address;
    blockNumber: bigint;
  },
): Promise<AcceptedPaymentToken> {
  const contract = { address: input.address, blockNumber: input.blockNumber };
  const [
    listed,
    enabled,
    name,
    symbol,
    decimals,
    supportsCore,
    supportsPending,
  ] = await Promise.all([
    requiredRead("registry listing", () =>
      client.readContract({
        address: input.factory,
        abi: membershipFactoryAbi,
        functionName: "isPaymentTokenListed",
        args: [input.address],
        blockNumber: input.blockNumber,
      }),
    ),
    requiredRead("publication status", () =>
      client.readContract({
        address: input.factory,
        abi: membershipFactoryAbi,
        functionName: "isPaymentTokenEnabled",
        args: [input.address],
        blockNumber: input.blockNumber,
      }),
    ),
    requiredRead("token name", () =>
      client.readContract({
        ...contract,
        abi: erc20Abi,
        functionName: "name",
      }),
    ),
    requiredRead("token symbol", () =>
      client.readContract({
        ...contract,
        abi: erc20Abi,
        functionName: "symbol",
      }),
    ),
    requiredRead("token decimals", () =>
      client.readContract({
        ...contract,
        abi: erc20Abi,
        functionName: "decimals",
      }),
    ),
    readOptionalInterfaceSupport("ERC-8056 core capability", () =>
      client.readContract({
        ...contract,
        abi: erc165Abi,
        functionName: "supportsInterface",
        args: [erc8056CoreInterfaceId],
      }),
    ),
    readOptionalInterfaceSupport("ERC-8056 pending capability", () =>
      client.readContract({
        ...contract,
        abi: erc165Abi,
        functionName: "supportsInterface",
        args: [erc8056PendingInterfaceId],
      }),
    ),
  ]);

  if (!listed) throw new TokenReadError("registry listing", "not listed");
  if (!name.trim()) throw new TokenReadError("token name", "empty name");
  if (!symbol.trim()) throw new TokenReadError("token symbol", "empty symbol");
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new TokenReadError("token decimals", "invalid decimals");
  }
  if (supportsCore !== supportsPending) {
    throw new TokenReadError(
      "ERC-8056 capabilities",
      "core and pending support differ",
    );
  }

  let uiMultiplier = tokenMultiplierScale;
  let newUIMultiplier = tokenMultiplierScale;
  let effectiveAt = 0n;
  if (supportsCore) {
    [uiMultiplier, newUIMultiplier, effectiveAt] = await Promise.all([
      requiredRead("current UI multiplier", () =>
        client.readContract({
          ...contract,
          abi: erc8056Abi,
          functionName: "uiMultiplier",
        }),
      ),
      requiredRead("pending UI multiplier", () =>
        client.readContract({
          ...contract,
          abi: erc8056Abi,
          functionName: "newUIMultiplier",
        }),
      ),
      requiredRead("UI multiplier schedule", () =>
        client.readContract({
          ...contract,
          abi: erc8056Abi,
          functionName: "effectiveAt",
        }),
      ),
    ]);
    if (uiMultiplier === 0n || newUIMultiplier === 0n) {
      throw new TokenReadError("UI multiplier", "zero multiplier");
    }
  }

  const walletRawBalance = input.wallet
    ? await requiredRead("wallet balance", () =>
        client.readContract({
          ...contract,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [input.wallet!],
        }),
      )
    : undefined;

  return {
    chainId: input.chainId,
    factory: input.factory,
    address: input.address,
    registryIndex: input.registryIndex,
    listed,
    enabled,
    name,
    symbol,
    decimals,
    scaledUI: supportsCore,
    uiMultiplier,
    newUIMultiplier,
    effectiveAt,
    ...(walletRawBalance === undefined ? {} : { walletRawBalance }),
    readBlock: input.blockNumber,
  };
}

export async function readAcceptedPaymentTokens(
  client: PublicClient,
  input: {
    chainId: AcceptedPaymentToken["chainId"];
    factory: Address;
    wallet?: Address;
    blockNumber?: bigint;
  },
): Promise<AcceptedPaymentTokenReadState> {
  try {
    const capturedBlock =
      input.blockNumber ?? (await client.getBlockNumber({ cacheTime: 0 }));
    const total = await client.readContract({
      address: input.factory,
      abi: membershipFactoryAbi,
      functionName: "paymentTokenCount",
      blockNumber: capturedBlock,
    });
    const addresses: Address[] = [];
    for (let offset = 0n; offset < total; offset += paymentTokenPageSize) {
      const page = await client.readContract({
        address: input.factory,
        abi: membershipFactoryAbi,
        functionName: "paymentTokens",
        args: [offset, paymentTokenPageSize],
        blockNumber: capturedBlock,
      });
      addresses.push(...page.map((address) => getAddress(address)));
    }
    if (addresses.length !== Number(total)) {
      throw new Error("Accepted-token pagination returned an incomplete list.");
    }
    if (
      new Set(addresses.map((address) => address.toLowerCase())).size !==
      addresses.length
    ) {
      throw new Error(
        "Accepted-token pagination returned a duplicate address.",
      );
    }

    const data: AcceptedPaymentToken[] = [];
    const failures: PaymentTokenReadFailure[] = [];
    for (const [registryIndex, address] of addresses.entries()) {
      try {
        data.push(
          await readToken(client, {
            ...input,
            address,
            registryIndex,
            blockNumber: capturedBlock,
          }),
        );
      } catch (error) {
        failures.push({
          address,
          registryIndex,
          operation:
            error instanceof TokenReadError ? error.operation : "token state",
          label:
            error instanceof TokenReadError
              ? error.message
              : "Unable to read this payment token.",
        });
      }
    }
    data.sort((left, right) => {
      const leftHeld = (left.walletRawBalance ?? 0n) > 0n;
      const rightHeld = (right.walletRawBalance ?? 0n) > 0n;
      return leftHeld === rightHeld
        ? left.registryIndex - right.registryIndex
        : leftHeld
          ? -1
          : 1;
    });
    return {
      status: failures.length === 0 ? "valid" : "partial",
      capturedBlock,
      data,
      failures,
    };
  } catch (error) {
    const classified = classifyReadError(error);
    return classified.status === "rate-limited"
      ? classified
      : { status: "unavailable", label: classified.label };
  }
}
