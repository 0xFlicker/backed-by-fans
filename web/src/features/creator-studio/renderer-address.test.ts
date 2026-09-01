import {
  getAddress,
  keccak256,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { describe, expect, it, vi } from "vitest";

import {
  createRendererAddressApproval,
  createRepresentativeRendererResultState,
  isRendererAddressApprovalCurrent,
  normalizeRendererAddress,
  representativeRendererPreviews,
  resolveRendererAddress,
  type RendererAddressResolution,
  type RepresentativeRendererResult,
} from "@/features/creator-studio/renderer-address";

const canonicalChainId = 46_630 as const;
const rendererAddress = getAddress(
  "0x1111111111111111111111111111111111111111",
);
const otherRendererAddress = getAddress(
  "0x2222222222222222222222222222222222222222",
);
const expectedSchema = `0x${"33".repeat(32)}` as Hex;
const rendererCode = "0x60006000" as Hex;

function rendererClient(input?: {
  chainId?: number;
  code?: Hex;
  schema?: Hex;
  name?: string;
  engineNames?: readonly string[];
}) {
  const engineNames = input?.engineNames ?? ["AFTERIMAGE", "BLOOM"];
  const readContract = vi.fn(
    async (request: { functionName: string; args?: readonly unknown[] }) => {
      switch (request.functionName) {
        case "rendererSchema":
          return input?.schema ?? expectedSchema;
        case "rendererName":
          return input?.name ?? "Signal Garden";
        case "engineCount":
          return engineNames.length;
        case "engineName":
          return engineNames[Number(request.args?.[0])];
        default:
          throw new Error(`Unexpected read ${request.functionName}`);
      }
    },
  );
  const client = {
    getChainId: vi.fn(async () => input?.chainId ?? canonicalChainId),
    getBlockNumber: vi.fn(async () => 123n),
    getBytecode: vi.fn(async () => input?.code ?? rendererCode),
    readContract,
  };
  return { client: client as unknown as PublicClient, ...client };
}

function readyResults(suffix = "v1"): readonly RepresentativeRendererResult[] {
  return representativeRendererPreviews.map((preview) => ({
    id: preview.id,
    status: "ready" as const,
    image: `<svg xmlns="http://www.w3.org/2000/svg"><text>${preview.id}-${suffix}</text></svg>`,
  }));
}

function resolution(
  address: Address = rendererAddress,
): RendererAddressResolution {
  return {
    chainId: canonicalChainId,
    address,
    capturedBlock: 123n,
    runtimeCodeHash: keccak256(rendererCode),
    schema: expectedSchema,
    name: "Signal Garden",
    engines: ["AFTERIMAGE", "BLOOM"],
  };
}

describe("renderer address resolution", () => {
  it("trims and normalizes a valid address while rejecting malformed and zero addresses", () => {
    expect(
      normalizeRendererAddress(
        "  0x52908400098527886e0f7030069857d2e4169ee7  ",
      ),
    ).toBe("0x52908400098527886E0F7030069857D2E4169EE7");

    expect(() => normalizeRendererAddress("not-an-address")).toThrow(
      /valid renderer address/i,
    );
    expect(() =>
      normalizeRendererAddress("0x0000000000000000000000000000000000000000"),
    ).toThrow(/zero address/i);
  });

  it("looks up code only on the supplied canonical chain and never falls back", async () => {
    const wrongChain = rendererClient({ chainId: 31_337 });

    await expect(
      resolveRendererAddress(wrongChain.client, {
        address: rendererAddress,
        canonicalChainId,
        expectedSchema,
      }),
    ).rejects.toMatchObject({ code: "wrong-chain" });
    expect(wrongChain.getBytecode).not.toHaveBeenCalled();
    expect(wrongChain.readContract).not.toHaveBeenCalled();

    const missingCode = rendererClient({ code: "0x" });
    await expect(
      resolveRendererAddress(missingCode.client, {
        address: rendererAddress,
        canonicalChainId,
        expectedSchema,
      }),
    ).rejects.toMatchObject({ code: "no-code" });
    expect(missingCode.getBytecode).toHaveBeenCalledWith({
      address: rendererAddress,
      blockNumber: 123n,
    });
    expect(missingCode.readContract).not.toHaveBeenCalled();
  });

  it("reads the renderer schema, name, and complete engine manifest directly", async () => {
    const { client, readContract } = rendererClient({
      engineNames: ["AFTERIMAGE", "BLOOM", "LOOM"],
    });

    await expect(
      resolveRendererAddress(client, {
        address: rendererAddress.toLowerCase(),
        canonicalChainId,
        expectedSchema,
      }),
    ).resolves.toEqual({
      chainId: canonicalChainId,
      address: rendererAddress,
      capturedBlock: 123n,
      runtimeCodeHash: keccak256(rendererCode),
      schema: expectedSchema,
      name: "Signal Garden",
      engines: ["AFTERIMAGE", "BLOOM", "LOOM"],
    });

    expect(
      readContract.mock.calls.map(([request]) => [
        request.functionName,
        request.args,
      ]),
    ).toEqual([
      ["rendererSchema", undefined],
      ["rendererName", undefined],
      ["engineCount", undefined],
      ["engineName", [0]],
      ["engineName", [1]],
      ["engineName", [2]],
    ]);
  });

  it("treats a pasted address only as a contract address and never loads skill content", async () => {
    const { client } = rendererClient();
    const fetcher = vi.spyOn(globalThis, "fetch");

    await resolveRendererAddress(client, {
      address: rendererAddress,
      canonicalChainId,
      expectedSchema,
    });

    expect(fetcher).not.toHaveBeenCalled();
    fetcher.mockRestore();
  });

  it("rejects an incompatible schema or incomplete manifest", async () => {
    await expect(
      resolveRendererAddress(
        rendererClient({ schema: `0x${"ff".repeat(32)}` }).client,
        { address: rendererAddress, canonicalChainId, expectedSchema },
      ),
    ).rejects.toMatchObject({ code: "interface-mismatch" });

    await expect(
      resolveRendererAddress(rendererClient({ name: "  " }).client, {
        address: rendererAddress,
        canonicalChainId,
        expectedSchema,
      }),
    ).rejects.toMatchObject({ code: "invalid-manifest" });
  });
});

describe("representative renderer results", () => {
  it("requires all six specified token, state, and image combinations", () => {
    expect(representativeRendererPreviews).toEqual([
      {
        id: "token-1-active-without-image",
        tokenId: 1,
        membershipState: "active",
        imageMode: "without-image",
      },
      {
        id: "token-1-expired-with-image",
        tokenId: 1,
        membershipState: "expired",
        imageMode: "with-image",
      },
      {
        id: "token-7-active-with-image",
        tokenId: 7,
        membershipState: "active",
        imageMode: "with-image",
      },
      {
        id: "token-7-expired-without-image",
        tokenId: 7,
        membershipState: "expired",
        imageMode: "without-image",
      },
      {
        id: "token-42-active-without-image",
        tokenId: 42,
        membershipState: "active",
        imageMode: "without-image",
      },
      {
        id: "token-42-expired-with-image",
        tokenId: 42,
        membershipState: "expired",
        imageMode: "with-image",
      },
    ]);

    const pending = createRepresentativeRendererResultState(
      readyResults().slice(0, 5),
    );
    expect(pending).toMatchObject({
      status: "pending",
      canApprove: false,
      missing: ["token-42-expired-with-image"],
    });
  });

  it("blocks approval when any representative call fails or has no displayable image", () => {
    const failed = createRepresentativeRendererResultState([
      ...readyResults().slice(0, 5),
      {
        id: "token-42-expired-with-image",
        status: "failed",
        error: "The renderer call reverted.",
      },
    ]);
    expect(failed).toMatchObject({
      status: "failed",
      canApprove: false,
      failures: [
        {
          id: "token-42-expired-with-image",
          error: "The renderer call reverted.",
        },
      ],
    });

    const malformed = createRepresentativeRendererResultState([
      ...readyResults().slice(0, 5),
      {
        id: "token-42-expired-with-image",
        status: "ready",
        image: "not an image",
      },
    ]);
    expect(malformed).toMatchObject({
      status: "failed",
      canApprove: false,
    });
  });

  it("makes a complete displayable result set ready for explicit approval", () => {
    const state = createRepresentativeRendererResultState(readyResults());

    expect(state.status).toBe("ready");
    expect(state.canApprove).toBe(true);
    if (state.status !== "ready") throw new Error("Expected ready state");
    expect(state.resultFingerprints).toHaveLength(6);
    expect(new Set(state.resultFingerprints)).toHaveProperty("size", 6);
  });
});

describe("renderer address approval", () => {
  it("invalidates approval when the renderer, requests, or displayed results change", () => {
    const previewState = createRepresentativeRendererResultState(
      readyResults("approved"),
    );
    if (previewState.status !== "ready") {
      throw new Error("Expected ready representative previews");
    }
    const requestSetFingerprint = `0x${"44".repeat(32)}` as Hex;
    const approved = createRendererAddressApproval({
      renderer: resolution(),
      requestSetFingerprint,
      previewState,
      approvedAt: 1_800_000_000_000,
    });

    expect(
      isRendererAddressApprovalCurrent(approved, {
        renderer: resolution(),
        requestSetFingerprint,
        previewState,
      }),
    ).toBe(true);
    expect(
      isRendererAddressApprovalCurrent(approved, {
        renderer: resolution(otherRendererAddress),
        requestSetFingerprint,
        previewState,
      }),
    ).toBe(false);
    expect(
      isRendererAddressApprovalCurrent(approved, {
        renderer: resolution(),
        requestSetFingerprint: `0x${"55".repeat(32)}`,
        previewState,
      }),
    ).toBe(false);

    const changedResults = createRepresentativeRendererResultState(
      readyResults("changed"),
    );
    if (changedResults.status !== "ready") {
      throw new Error("Expected changed representative previews");
    }
    expect(
      isRendererAddressApprovalCurrent(approved, {
        renderer: resolution(),
        requestSetFingerprint,
        previewState: changedResults,
      }),
    ).toBe(false);
  });
});
