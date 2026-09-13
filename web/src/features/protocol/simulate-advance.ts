import { simulateContract, type Config } from "@wagmi/core";
import { BaseError, ContractFunctionRevertedError, type Address } from "viem";
import { protocolBurnRouterAbi } from "@/contracts";
import type { SupportedChainId } from "@/lib/chains";
import { advanceCall, type AdvanceMode } from "./advance-call";

/** Preview the actual router call, including funds released before a buyback. */
export async function simulateAdvance(
  config: Config,
  chainId: SupportedChainId,
  account: Address,
  mode: AdvanceMode,
  plan: {
    router: Address;
    tiers: readonly { tier: Address; maxAccountingSteps: bigint }[];
    purchases: readonly { asset: Address; revision: bigint }[];
    deadline: bigint;
  },
) {
  try {
    const simulation = await simulateContract(config, {
      chainId,
      account,
      address: plan.router,
      abi: protocolBurnRouterAbi,
      ...advanceCall(mode, plan.tiers, plan.purchases, plan.deadline),
      ...(chainId === 31337 ? { gasPrice: 2_000_000_000n } : {}),
    });
    const result = simulation.result;
    const processedSteps =
      typeof result === "bigint" ? result : mode === "both" ? result[0] : 0n;
    const purchases =
      typeof result === "bigint" ? 0n : mode === "both" ? result[2] : result[0];
    const burned =
      typeof result === "bigint" ? 0n : mode === "both" ? result[3] : result[1];
    return {
      request: simulation.request,
      processedSteps,
      purchases,
      burned,
      // advanceAccounting reverts with NothingToDo when it cannot settle anything.
      // A successful call can settle continuous accrual with zero checkpoints.
      ready: mode === "accounting" || processedSteps > 0n || purchases > 0n,
    };
  } catch (error) {
    const reverted =
      error instanceof BaseError &&
      error.walk((cause) => cause instanceof ContractFunctionRevertedError);
    if (
      reverted instanceof ContractFunctionRevertedError &&
      reverted.data?.errorName === "NothingToDo"
    )
      return null;
    throw error;
  }
}
