import {
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionData,
  getAddress,
  maxUint256,
  serializeTransaction,
  type Hex,
  type Log,
} from "viem";
import { describe, expect, it } from "vitest";

import { approveRendererCandidate } from "@/features/renderer-lab/approval";
import {
  createRendererLabCandidateState,
  replaceRendererCandidate,
  replaceRendererPreviewRequests,
  replaceRendererPreviewResults,
  type RendererCandidateInput,
} from "@/features/renderer-lab/candidate";
import {
  prepareRendererDeployment,
  rendererAddressFromDeploymentLogs,
  RendererDeploymentPreparationError,
} from "@/features/renderer-lab/deployment";
import { maxRendererInitcodeBytes } from "@/features/renderer-lab/package-import";
import { rendererRegistryAbi } from "@/contracts";

const registry = getAddress("0x1111111111111111111111111111111111111111");

function approvedCandidateState(creationBytecode: Hex = "0x6000600055") {
  const candidate: RendererCandidateInput = {
    candidateId: "candidate-1",
    chainId: 46_630,
    artifactFingerprint: `0x${"ab".repeat(32)}`,
    interfaceSchema: `0x${"12".repeat(32)}`,
    creationBytecode,
    runtimeBytecode: "0x6000",
    initCodeByteLength: (creationBytecode.length - 2) / 2,
  };
  const requests = Array.from({ length: 6 }, (_, index) => ({
    requestId: `request-${index + 1}`,
    mode: "undeployed-initcode" as const,
    method: "previewSVG" as const,
    contextWithoutMedia: { tokenId: [1, 1, 7, 7, 42, 42][index] },
    localImageSlot: index % 2 === 1,
  }));

  let state = createRendererLabCandidateState();
  state = replaceRendererCandidate(state, candidate);
  state = replaceRendererPreviewRequests(
    state,
    state.candidate!.candidateFingerprint,
    requests,
  );
  state = replaceRendererPreviewResults(state, {
    candidateFingerprint: state.candidate!.candidateFingerprint,
    requestSetFingerprint: state.requestSet!.requestSetFingerprint,
    results: requests.map((request) => ({
      requestId: request.requestId,
      status: "ready" as const,
      image: `<svg xmlns="http://www.w3.org/2000/svg"><text>${request.requestId}</text></svg>`,
    })),
  });

  return { state, approval: approveRendererCandidate(state) };
}

describe("renderer registry deployment preparation", () => {
  it("requires a configured registry", () => {
    const { state, approval } = approvedCandidateState();

    expect(() => prepareRendererDeployment({ state, approval })).toThrow(
      expect.objectContaining({
        code: "registry-unavailable",
      }) as RendererDeploymentPreparationError,
    );
  });

  it("rejects initcode above the registry transaction limit", () => {
    const creationBytecode =
      `0x${"00".repeat(maxRendererInitcodeBytes + 1)}` as Hex;
    const { state, approval } = approvedCandidateState(creationBytecode);

    expect(() =>
      prepareRendererDeployment({ registry, state, approval }),
    ).toThrow(
      expect.objectContaining({
        code: "nitro-limit",
      }) as RendererDeploymentPreparationError,
    );
  });

  it("leaves room for a conservatively large signed transaction envelope", () => {
    const data = encodeFunctionData({
      abi: rendererRegistryAbi,
      functionName: "deployAndRegister",
      args: [`0x${"00".repeat(maxRendererInitcodeBytes)}`],
    });
    const serialized = serializeTransaction(
      {
        chainId: 46_630,
        data,
        gas: 0xffffffffffffffffn,
        maxFeePerGas: maxUint256,
        maxPriorityFeePerGas: maxUint256,
        nonce: Number.MAX_SAFE_INTEGER,
        to: registry,
        type: "eip1559",
        value: 0n,
      },
      {
        r: `0x${"ff".repeat(32)}`,
        s: `0x${"ff".repeat(32)}`,
        yParity: 1,
      },
    );

    expect((serialized.length - 2) / 2).toBeLessThanOrEqual(95_000);
  });

  it("returns the exact registry input for the approved candidate", () => {
    const { state, approval } = approvedCandidateState();

    expect(prepareRendererDeployment({ registry, state, approval })).toEqual({
      chainId: 46_630,
      registry,
      initCode: state.candidate!.creationBytecode,
      initCodeByteLength: 5,
      approvalFingerprint: approval.fingerprint,
      state: "prepared",
    });
  });

  it("returns the actual renderer emitted by the configured registry", () => {
    const creator = getAddress("0x2222222222222222222222222222222222222222");
    const renderer = getAddress("0x3333333333333333333333333333333333333333");
    const log = {
      address: registry,
      topics: encodeEventTopics({
        abi: rendererRegistryAbi,
        eventName: "RendererDeployed",
        args: {
          creator,
          renderer,
          initCodeHash: `0x${"44".repeat(32)}`,
        },
      }),
      data: encodeAbiParameters([{ type: "uint256" }], [0n]),
    } as Log;

    expect(rendererAddressFromDeploymentLogs({ logs: [log], registry })).toBe(
      renderer,
    );
    expect(
      rendererAddressFromDeploymentLogs({
        logs: [log],
        registry: getAddress("0x4444444444444444444444444444444444444444"),
      }),
    ).toBeUndefined();
  });
});
