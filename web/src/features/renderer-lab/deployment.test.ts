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

import {
  createRendererLabCandidateState,
  replaceRendererCandidate,
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

function candidateState(creationBytecode: Hex = "0x6000600055") {
  const candidate: RendererCandidateInput = {
    candidateId: "candidate-1",
    chainId: 46_630,
    artifactFingerprint: `0x${"ab".repeat(32)}`,
    interfaceSchema: `0x${"12".repeat(32)}`,
    creationBytecode,
    runtimeBytecode: "0x6000",
    initCodeByteLength: (creationBytecode.length - 2) / 2,
  };
  let state = createRendererLabCandidateState();
  state = replaceRendererCandidate(state, candidate);
  return state;
}

describe("renderer registry deployment preparation", () => {
  it("requires a configured registry", () => {
    const state = candidateState();

    expect(() => prepareRendererDeployment({ state })).toThrow(
      expect.objectContaining({
        code: "registry-unavailable",
      }) as RendererDeploymentPreparationError,
    );
  });

  it("rejects initcode above the registry transaction limit", () => {
    const creationBytecode =
      `0x${"00".repeat(maxRendererInitcodeBytes + 1)}` as Hex;
    const state = candidateState(creationBytecode);

    expect(() => prepareRendererDeployment({ registry, state })).toThrow(
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

  it("returns the exact registry input for the loaded candidate", () => {
    const state = candidateState();

    expect(prepareRendererDeployment({ registry, state })).toEqual({
      chainId: 46_630,
      registry,
      initCode: state.candidate!.creationBytecode,
      initCodeByteLength: 5,
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
