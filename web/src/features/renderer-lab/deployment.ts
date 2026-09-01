import {
  concatHex,
  getCreate2Address,
  keccak256,
  type Hex,
  type PublicClient,
} from "viem";

import {
  isRendererReviewCurrent,
  type RendererReviewDecision,
} from "@/features/renderer-lab/approval";
import type { RendererLabCandidateState } from "@/features/renderer-lab/candidate";

const maxRawDeploymentBytes = 95_000;
export const canonicalRendererCreate2DeployerCodeHash =
  "0x2fa86add0aed31f33a762c9d88e807c475bd51d0f52bd0955754b2608f7e4989" as const;

export type RendererDeploymentPreparationErrorCode =
  | "approval-stale"
  | "deployer-code-mismatch"
  | "address-occupied"
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

export type UnsignedRendererDeployment = {
  chainId: number;
  deployer: `0x${string}`;
  salt: Hex;
  initcode: Hex;
  calldata: Hex;
  rawByteLength: number;
  predictedAddress: `0x${string}`;
  approvalFingerprint: Hex;
  state: "prepared";
};

function byteLength(value: Hex) {
  return (value.length - 2) / 2;
}

export async function prepareUnsignedRendererDeployment(input: {
  client: Pick<PublicClient, "getBytecode">;
  state: RendererLabCandidateState;
  approval: RendererReviewDecision;
  expectedDeployerCodeHash: Hex;
}): Promise<UnsignedRendererDeployment> {
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

  const initCodeHash = keccak256(candidate.creationBytecode);
  const rawByteLength =
    byteLength(candidate.salt) + byteLength(candidate.creationBytecode);
  const predictedAddress = getCreate2Address({
    from: candidate.create2Deployer,
    salt: candidate.salt,
    bytecodeHash: initCodeHash,
  });
  if (
    initCodeHash !== candidate.initCodeHash ||
    rawByteLength !== candidate.rawByteLength ||
    predictedAddress !== candidate.predictedAddress
  ) {
    throw new RendererDeploymentPreparationError(
      "candidate-invalid",
      "The renderer deployment inputs changed after package validation.",
    );
  }
  if (rawByteLength >= maxRawDeploymentBytes) {
    throw new RendererDeploymentPreparationError(
      "nitro-limit",
      "The salt plus final initcode must stay below the Robinhood Nitro deployment limit.",
    );
  }

  const deployerCode = await input.client.getBytecode({
    address: candidate.create2Deployer,
  });
  if (
    !deployerCode ||
    keccak256(deployerCode).toLowerCase() !==
      input.expectedDeployerCodeHash.toLowerCase()
  ) {
    throw new RendererDeploymentPreparationError(
      "deployer-code-mismatch",
      "The canonical CREATE2 deployer is unavailable on this chain.",
    );
  }
  const occupiedCode = await input.client.getBytecode({
    address: candidate.predictedAddress,
  });
  if (occupiedCode && occupiedCode !== "0x") {
    throw new RendererDeploymentPreparationError(
      "address-occupied",
      "The predicted renderer address already contains a contract.",
    );
  }

  return {
    chainId: candidate.chainId,
    deployer: candidate.create2Deployer,
    salt: candidate.salt,
    initcode: candidate.creationBytecode,
    calldata: concatHex([candidate.salt, candidate.creationBytecode]),
    rawByteLength,
    predictedAddress: candidate.predictedAddress,
    approvalFingerprint: input.approval.fingerprint,
    state: "prepared",
  };
}
