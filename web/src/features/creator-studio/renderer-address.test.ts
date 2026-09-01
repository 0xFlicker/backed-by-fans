import { getAddress, keccak256, type Hex, type PublicClient } from "viem";
import { describe, expect, it, vi } from "vitest";

import {
  normalizeRendererAddress,
  resolveRendererAddress,
} from "@/features/creator-studio/renderer-address";

const canonicalChainId = 46_630 as const;
const rendererAddress = getAddress(
  "0x1111111111111111111111111111111111111111",
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
