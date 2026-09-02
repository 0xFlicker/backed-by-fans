import type { DeploymentAvailability } from "@/lib/config";

export function deploymentWriteGuard(input: {
  deployment: DeploymentAvailability;
  walletChainId?: number;
  expectedChainId: number;
}) {
  if (input.deployment.status !== "ready") {
    return { enabled: false as const, reason: input.deployment.detail };
  }
  if (input.walletChainId !== input.expectedChainId) {
    return {
      enabled: false as const,
      reason: "Switch the wallet to the selected membership network.",
    };
  }
  return {
    enabled: true as const,
    factory: input.deployment.factoryAddress,
  };
}
