import {
  concatHex,
  getAddress,
  getCreate2Address,
  keccak256,
  type Hex,
  type PublicClient,
} from "viem";
import { describe, expect, it, vi } from "vitest";

import { approveRendererCandidate } from "@/features/renderer-lab/approval";
import {
  createRendererLabCandidateState,
  replaceRendererCandidate,
  replaceRendererPreviewRequests,
  replaceRendererPreviewResults,
  type RendererCandidateInput,
} from "@/features/renderer-lab/candidate";
import {
  prepareUnsignedRendererDeployment,
  RendererDeploymentPreparationError,
} from "@/features/renderer-lab/deployment";

const deployer = getAddress("0x4e59b44847b379578588920cA78FbF26c0B4956C");
const deployerCode = "0x60016000526001601ff3";
const deployerCodeHash = keccak256(deployerCode);
const salt = `0x${"34".repeat(32)}` as Hex;

function approvedCandidateState(creationBytecode: Hex = "0x6000600055") {
  const initCodeHash = keccak256(creationBytecode);
  const candidate: RendererCandidateInput = {
    candidateId: "candidate-1",
    chainId: 46_630,
    artifactFingerprint: `0x${"ab".repeat(32)}`,
    interfaceSchema: `0x${"12".repeat(32)}`,
    creationBytecode,
    runtimeBytecode: "0x6000",
    create2Deployer: deployer,
    salt,
    initCodeHash,
    predictedAddress: getCreate2Address({
      from: deployer,
      salt,
      bytecodeHash: initCodeHash,
    }),
    rawByteLength: (salt.length - 2) / 2 + (creationBytecode.length - 2) / 2,
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

function client(getBytecode: PublicClient["getBytecode"]) {
  return { getBytecode } as Pick<PublicClient, "getBytecode">;
}

describe("unsigned renderer deployment preparation", () => {
  it("rejects a predicted CREATE2 address that already contains code", async () => {
    const { state, approval } = approvedCandidateState();
    const getBytecode = vi
      .fn<PublicClient["getBytecode"]>()
      .mockResolvedValueOnce(deployerCode)
      .mockResolvedValueOnce("0x6002");

    await expect(
      prepareUnsignedRendererDeployment({
        client: client(getBytecode),
        state,
        approval,
        expectedDeployerCodeHash: deployerCodeHash,
      }),
    ).rejects.toMatchObject({
      code: "address-occupied",
    } satisfies Partial<RendererDeploymentPreparationError>);
  });

  it("rejects a raw salt-plus-initcode payload at the 95,000-byte Nitro limit", async () => {
    const creationBytecode = `0x${"00".repeat(94_968)}` as Hex;
    const { state, approval } = approvedCandidateState(creationBytecode);
    const getBytecode = vi
      .fn<PublicClient["getBytecode"]>()
      .mockResolvedValue(deployerCode);

    await expect(
      prepareUnsignedRendererDeployment({
        client: client(getBytecode),
        state,
        approval,
        expectedDeployerCodeHash: deployerCodeHash,
      }),
    ).rejects.toMatchObject({
      code: "nitro-limit",
    } satisfies Partial<RendererDeploymentPreparationError>);
  });

  it("returns only an exact unsigned request for the current approved inputs", async () => {
    const { state, approval } = approvedCandidateState();
    const getBytecode = vi
      .fn<PublicClient["getBytecode"]>()
      .mockResolvedValueOnce(deployerCode)
      .mockResolvedValueOnce(undefined);

    const request = await prepareUnsignedRendererDeployment({
      client: client(getBytecode),
      state,
      approval,
      expectedDeployerCodeHash: deployerCodeHash,
    });

    expect(request).toEqual({
      chainId: 46_630,
      deployer,
      salt,
      initcode: state.candidate!.creationBytecode,
      calldata: concatHex([salt, state.candidate!.creationBytecode]),
      rawByteLength: 37,
      predictedAddress: state.candidate!.predictedAddress,
      approvalFingerprint: approval.fingerprint,
      state: "prepared",
    });
    expect(getBytecode).toHaveBeenNthCalledWith(1, { address: deployer });
    expect(getBytecode).toHaveBeenNthCalledWith(2, {
      address: state.candidate!.predictedAddress,
    });
  });
});
