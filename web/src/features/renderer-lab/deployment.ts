import {
  isAddressEqual,
  parseEventLogs,
  type Address,
  type Hex,
  type Log,
} from "viem";

import { rendererRegistryAbi } from "@/contracts";
import {
  isRendererReviewCurrent,
  type RendererReviewDecision,
} from "@/features/renderer-lab/approval";
import type { RendererLabCandidateState } from "@/features/renderer-lab/candidate";
import { maxRendererInitcodeBytes } from "@/features/renderer-lab/package-import";

export type RendererDeploymentPreparationErrorCode =
  | "approval-stale"
  | "registry-unavailable"
  | "nitro-limit"
  | "candidate-invalid";

export class RendererDeploymentPreparationError extends Error {
  readonly code: RendererDeploymentPreparationErrorCode;

  constructor(code: RendererDeploymentPreparationErrorCode, message: string) {
    super(message);
    this.name = "RendererDeploymentPreparationError";
    this.code = code;
  }
}

export type PreparedRendererDeployment = {
  chainId: number;
  registry: Address;
  initCode: Hex;
  initCodeByteLength: number;
  approvalFingerprint: Hex;
  state: "prepared";
};

function byteLength(value: Hex) {
  return (value.length - 2) / 2;
}

export function prepareRendererDeployment(input: {
  registry?: Address;
  state: RendererLabCandidateState;
  approval: RendererReviewDecision;
}): PreparedRendererDeployment {
  const candidate = input.state.candidate;
  if (
    !candidate ||
    input.approval.decision !== "approved" ||
    !isRendererReviewCurrent(input.approval, input.state)
  ) {
    throw new RendererDeploymentPreparationError(
      "approval-stale",
      "Review and approve the current renderer examples before deployment.",
    );
  }
  if (!input.registry) {
    throw new RendererDeploymentPreparationError(
      "registry-unavailable",
      "Renderer deployment is not available on this network yet.",
    );
  }

  const initCodeByteLength = byteLength(candidate.creationBytecode);
  if (initCodeByteLength !== candidate.initCodeByteLength) {
    throw new RendererDeploymentPreparationError(
      "candidate-invalid",
      "The renderer deployment input changed after package validation.",
    );
  }
  if (initCodeByteLength > maxRendererInitcodeBytes) {
    throw new RendererDeploymentPreparationError(
      "nitro-limit",
      `Renderer initcode must be ${maxRendererInitcodeBytes.toLocaleString()} bytes or smaller.`,
    );
  }

  return {
    chainId: candidate.chainId,
    registry: input.registry,
    initCode: candidate.creationBytecode,
    initCodeByteLength,
    approvalFingerprint: input.approval.fingerprint,
    state: "prepared",
  };
}

export function rendererAddressFromDeploymentLogs(input: {
  logs: readonly Log[];
  registry: Address;
}): Address | undefined {
  const events = parseEventLogs({
    abi: rendererRegistryAbi,
    eventName: "RendererDeployed",
    logs: [...input.logs],
  });
  return events.findLast((event) =>
    isAddressEqual(event.address, input.registry),
  )?.args.renderer;
}
