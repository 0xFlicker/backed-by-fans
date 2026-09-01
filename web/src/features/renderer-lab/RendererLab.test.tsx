import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  encodeAbiParameters,
  getAddress,
  getCreate2Address,
  keccak256,
  type Hex,
  type PublicClient,
} from "viem";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RendererLab } from "@/features/renderer-lab/RendererLab";
import { previewRendererRequest } from "@/features/renderer-lab/preview";

const previewMock = vi.hoisted(() => vi.fn());
const processImageMock = vi.hoisted(() => vi.fn());
const prepareDeploymentMock = vi.hoisted(() => vi.fn());
const sendTransactionMock = vi.hoisted(() => vi.fn());
const resetTransactionMock = vi.hoisted(() => vi.fn());
const switchChainMock = vi.hoisted(() => vi.fn());
const wagmiState = vi.hoisted(() => ({
  account: {
    address: undefined as `0x${string}` | undefined,
    chainId: undefined as number | undefined,
    isConnected: false,
  },
  receipt: {
    error: null as Error | null,
    isLoading: false,
    isSuccess: false,
  },
  transaction: {
    data: undefined as `0x${string}` | undefined,
    error: null as Error | null,
    isPending: false,
  },
}));

vi.mock("@/features/renderer-lab/preview", () => ({
  previewRendererRequest: previewMock,
}));

vi.mock("@/features/creator-studio/image-processing", () => ({
  defaultJpegQuality: 0.84,
  defaultOutputDimension: 512,
  jpegQualityBounds: { min: 0.55, max: 0.95, step: 0.01 },
  outputDimensions: [256, 384, 512],
  processImageSource: processImageMock,
}));

vi.mock("@/features/renderer-lab/deployment", () => ({
  canonicalRendererCreate2DeployerCodeHash: `0x${"99".repeat(32)}`,
  prepareUnsignedRendererDeployment: prepareDeploymentMock,
}));

vi.mock("wagmi", () => ({
  useAccount: () => wagmiState.account,
  useSendTransaction: () => ({
    ...wagmiState.transaction,
    reset: resetTransactionMock,
    sendTransactionAsync: sendTransactionMock,
  }),
  useSwitchChain: () => ({ switchChainAsync: switchChainMock }),
  useWaitForTransactionReceipt: () => wagmiState.receipt,
}));

vi.mock("@/components/WalletControl", () => ({
  WalletControl: () => <div data-testid="wallet-prompt">Wallet connection</div>,
}));

const canonicalCreate2Deployer = getAddress(
  "0x4e59b44847b379578588920cA78FbF26c0B4956C",
);
const previewHarness = getAddress("0x2222222222222222222222222222222222222222");
const interfaceSchema = `0x${"12".repeat(32)}` as Hex;
const salt = `0x${"34".repeat(32)}` as Hex;
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#625bff"/></svg>';

function byteLength(value: Hex): number {
  return (value.length - 2) / 2;
}

function rendererPackage() {
  const creationBytecode = "0x6000600055" as Hex;
  const runtimeBytecode = "0x6000" as Hex;
  const compiler = {
    solidity: "0.8.36",
    evmVersion: "cancun",
    optimizerEnabled: true,
    optimizerRuns: 200,
  } as const;
  const artifactFingerprint = keccak256(
    encodeAbiParameters(
      [
        { type: "bytes" },
        { type: "bytes" },
        { type: "string" },
        { type: "string" },
        { type: "bool" },
        { type: "uint256" },
        { type: "bytes32" },
      ],
      [
        creationBytecode,
        runtimeBytecode,
        compiler.solidity,
        compiler.evmVersion,
        compiler.optimizerEnabled,
        BigInt(compiler.optimizerRuns),
        interfaceSchema,
      ],
    ),
  );
  const initCodeHash = keccak256(creationBytecode);
  const predictedAddress = getCreate2Address({
    from: canonicalCreate2Deployer,
    salt,
    bytecodeHash: initCodeHash,
  });

  return {
    formatVersion: 1 as const,
    rendererName: "Moonlit Memberships",
    interfaceSchema,
    compiler,
    artifacts: {
      sourceRoot: "/local/moonlit",
      abi: "[]",
      creationBytecode,
      runtimeBytecode,
      artifactFingerprint,
      creationByteLength: byteLength(creationBytecode),
      runtimeByteLength: byteLength(runtimeBytecode),
    },
    deployment: {
      chainId: 46_630,
      create2Deployer: canonicalCreate2Deployer,
      salt,
      initCodeHash,
      predictedAddress,
      rawByteLength: byteLength(salt) + byteLength(creationBytecode),
    },
    examples: [
      [1, "active", "none"],
      [1, "expired", "browser-slot"],
      [7, "active", "browser-slot"],
      [7, "expired", "none"],
      [42, "active", "none"],
      [42, "expired", "browser-slot"],
    ].map(([tokenId, state, imageMode], index) => ({
      requestId: `example-${index + 1}`,
      tokenId: tokenId as 1 | 7 | 42,
      state: state as "active" | "expired",
      imageMode: imageMode as "none" | "browser-slot",
      method: "previewSVG" as const,
      contextWithoutMedia: { tokenId, state },
      localImageSlot: imageMode === "browser-slot",
    })),
    skill: ".agents/skills/backed-by-fans-renderer/SKILL.md",
    llms: ".agents/skills/backed-by-fans-renderer/llms.txt",
  };
}

function packageFile(value: unknown = rendererPackage()) {
  return new File([JSON.stringify(value)], "moonlit.renderer.json", {
    type: "application/json",
  });
}

function renderLab(
  props: Partial<React.ComponentProps<typeof RendererLab>> = {},
) {
  return render(
    <RendererLab
      client={{} as PublicClient}
      previewHarness={previewHarness}
      {...props}
    />,
  );
}

afterEach(() => {
  window.history.replaceState(null, "", "/");
  processImageMock.mockReset();
  prepareDeploymentMock.mockReset();
  sendTransactionMock.mockReset();
  resetTransactionMock.mockReset();
  switchChainMock.mockReset();
  wagmiState.account.address = undefined;
  wagmiState.account.chainId = undefined;
  wagmiState.account.isConnected = false;
  wagmiState.receipt.error = null;
  wagmiState.receipt.isLoading = false;
  wagmiState.receipt.isSuccess = false;
  wagmiState.transaction.data = undefined;
  wagmiState.transaction.error = null;
  wagmiState.transaction.isPending = false;
});

describe("public renderer lab", () => {
  it("imports and previews without a wallet, then requires approval plus Deploy before showing wallet UI", async () => {
    const user = userEvent.setup();
    previewMock.mockResolvedValue(svg);
    renderLab();

    expect(screen.getByRole("heading", { name: "Renderer lab" })).toBeVisible();
    expect(screen.queryByTestId("wallet-prompt")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Deploy renderer" }),
    ).not.toBeInTheDocument();

    await user.upload(screen.getByLabelText("Renderer package"), packageFile());

    expect(screen.getByText("Moonlit Memberships")).toBeVisible();
    expect(screen.getByText("Ready to preview 6 examples.")).toBeVisible();
    expect(screen.queryByTestId("wallet-prompt")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Preview 6 examples" }),
    );

    await waitFor(() =>
      expect(previewRendererRequest).toHaveBeenCalledTimes(6),
    );
    expect(
      await screen.findAllByRole("img", { name: /Membership example/i }),
    ).toHaveLength(6);
    expect(screen.queryByTestId("wallet-prompt")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Deploy renderer" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reject renderer" }));
    expect(screen.getByText("Renderer rejected.")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Deploy renderer" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Approve renderer" }));

    const summary = screen.getByRole("region", { name: "Deployment summary" });
    expect(within(summary).getByText("Robinhood testnet")).toBeVisible();
    expect(
      within(summary).getByText(rendererPackage().deployment.predictedAddress),
    ).toBeVisible();
    expect(within(summary).getByText("37 bytes")).toBeVisible();
    expect(screen.queryByTestId("wallet-prompt")).not.toBeInTheDocument();

    await user.click(screen.getByText("Technical details"));
    expect(within(summary).getByText(salt)).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Deploy renderer" }));
    expect(screen.getByTestId("wallet-prompt")).toBeVisible();
    expect(screen.getByText(/Your wallet owns submission/i)).toBeVisible();
    expect(sendTransactionMock).not.toHaveBeenCalled();
  });

  it("simulates the prepared request and passes that exact request to wagmi", async () => {
    const user = userEvent.setup();
    const value = rendererPackage();
    const call = vi.fn().mockResolvedValue({ data: "0x" });
    const getBytecode = vi.fn().mockResolvedValue("0x6000");
    wagmiState.account.address = getAddress(
      "0x7777777777777777777777777777777777777777",
    );
    wagmiState.account.chainId = 46_630;
    wagmiState.account.isConnected = true;
    wagmiState.receipt.isSuccess = true;
    previewMock.mockResolvedValue(svg);
    prepareDeploymentMock.mockResolvedValue({
      approvalFingerprint: `0x${"88".repeat(32)}`,
      calldata: `${value.deployment.salt}${value.artifacts.creationBytecode.slice(2)}`,
      chainId: 46_630,
      deployer: value.deployment.create2Deployer,
      initcode: value.artifacts.creationBytecode,
      predictedAddress: value.deployment.predictedAddress,
      rawByteLength: value.deployment.rawByteLength,
      salt: value.deployment.salt,
      state: "prepared",
    });
    sendTransactionMock.mockResolvedValue(`0x${"aa".repeat(32)}`);
    renderLab({
      client: { call, getBytecode } as unknown as PublicClient,
    });

    await user.upload(screen.getByLabelText("Renderer package"), packageFile());
    await user.click(
      screen.getByRole("button", { name: "Preview 6 examples" }),
    );
    await screen.findAllByRole("img", { name: /Membership example/i });
    await user.click(screen.getByRole("button", { name: "Approve renderer" }));
    await user.click(screen.getByRole("button", { name: "Deploy renderer" }));

    await waitFor(() => expect(sendTransactionMock).toHaveBeenCalledOnce());
    expect(call).toHaveBeenCalledOnce();
    expect(sendTransactionMock.mock.calls[0][0]).toEqual(call.mock.calls[0][0]);
    expect(switchChainMock).not.toHaveBeenCalled();
    expect(
      await screen.findByText(
        `Renderer deployed: ${value.deployment.predictedAddress}`,
      ),
    ).toBeVisible();
    expect(getBytecode).toHaveBeenCalledWith({
      address: value.deployment.predictedAddress,
    });
  });

  it("accepts drag-and-drop and explains invalid packages without loading them", async () => {
    renderLab();
    const invalid = packageFile({ formatVersion: 1 });

    fireEvent.drop(screen.getByLabelText("Renderer package drop zone"), {
      dataTransfer: { files: [invalid] },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /schema validation failed/i,
    );
    expect(screen.queryByText("Ready to preview")).not.toBeInTheDocument();
    expect(screen.queryByTestId("wallet-prompt")).not.toBeInTheDocument();
  });

  it("processes a local image in the browser and supplies it only to image-slot previews", async () => {
    const user = userEvent.setup();
    const preparedBytes = new Uint8Array([0xff, 0xd8, 0xff, 0x01]);
    const dispose = vi.fn();
    processImageMock.mockResolvedValue({
      byteLength: preparedBytes.byteLength,
      dimension: 512,
      mime: "image/jpeg",
      objectURL: "blob:prepared-image",
      rendererCallBytes: preparedBytes,
      dispose,
    });
    previewMock.mockResolvedValue(svg);
    renderLab();

    await user.upload(screen.getByLabelText("Renderer package"), packageFile());
    const source = new File([new Uint8Array([1, 2, 3])], "portrait.jpg", {
      type: "image/jpeg",
    });
    await user.upload(screen.getByLabelText("Choose JPEG or PNG"), source);

    await waitFor(() => expect(processImageMock).toHaveBeenCalledOnce());
    expect(screen.getByText("portrait.jpg")).toBeVisible();
    expect(screen.getByAltText("Selected source")).toHaveAttribute(
      "src",
      "blob:prepared-image",
    );

    await user.click(
      screen.getByRole("button", { name: "Preview 6 examples" }),
    );
    await waitFor(() => expect(previewMock).toHaveBeenCalledTimes(6));

    for (const [input] of previewMock.mock.calls) {
      expect(input.nativeMedia).toEqual(
        input.request.localImageSlot
          ? { bytes: "0xffd8ff01", mime: 1 }
          : undefined,
      );
    }
  });

  it("loads the optional fragment helper into the same browser-memory preview flow", async () => {
    const user = userEvent.setup();
    const preparedBytes = new Uint8Array([0xff, 0xd8, 0xff, 0x01]);
    processImageMock.mockResolvedValue({
      byteLength: preparedBytes.byteLength,
      dimension: 512,
      mime: "image/jpeg",
      objectURL: "blob:helper-image",
      rendererCallBytes: preparedBytes,
      dispose: vi.fn(),
    });
    const value = rendererPackage();
    const helperCandidate = {
      candidateId: "candidate-1",
      artifactFingerprint: value.artifacts.artifactFingerprint,
      creationBytecode: value.artifacts.creationBytecode,
      runtimeBytecode: value.artifacts.runtimeBytecode,
      salt: value.deployment.salt,
      manifest: {
        ...value,
        artifacts: {
          ...value.artifacts,
          creationBytecode: undefined,
          runtimeBytecode: undefined,
        },
        examples: undefined,
      },
    };
    const helperRequests = {
      candidateFingerprint: value.artifacts.artifactFingerprint,
      requestSetFingerprint: `0x${"56".repeat(32)}`,
      requests: value.examples.map((example) => ({
        requestId: example.requestId,
        method: example.method,
        mode: "undeployed-initcode" as const,
        contextWithoutMedia: example.contextWithoutMedia,
        localImageSlot: example.localImageSlot,
      })),
    };
    const submitExampleResults = vi.fn().mockResolvedValue({ accepted: true });
    const helperImage = new File(
      [new Uint8Array([0xff, 0xd8, 0xff, 0xe0])],
      "helper-portrait.jpg",
      { type: "image/jpeg" },
    );
    const helper = {
      connect: vi.fn().mockResolvedValue({
        sessionId: "session-123",
        sourceImage: {
          name: helperImage.name,
          mime: "image/jpeg",
          size: helperImage.size,
        },
      }),
      getCandidate: vi.fn().mockResolvedValue(helperCandidate),
      getExampleRequests: vi.fn().mockResolvedValue(helperRequests),
      getSourceImage: vi.fn().mockResolvedValue(helperImage),
      submitExampleResults,
    };
    const helperClientFactory = vi.fn(() => helper);
    const fragment = new URLSearchParams({
      helper: "http://127.0.0.1:54321",
      capability: "c".repeat(43),
      sessionId: "session-123",
    });
    window.history.replaceState(null, "", `/render#${fragment}`);
    previewMock.mockResolvedValue(svg);

    renderLab({ helperClientFactory });

    expect(
      await screen.findByText("Connected to local helper with source image."),
    ).toBeVisible();
    expect(window.location.hash).toBe("");
    expect(screen.getByText("Moonlit Memberships")).toBeVisible();
    expect(await screen.findByText("helper-portrait.jpg")).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "Preview 6 examples" }),
    );

    await waitFor(() => expect(submitExampleResults).toHaveBeenCalledOnce());
    expect(JSON.stringify(submitExampleResults.mock.calls[0][0])).not.toMatch(
      /nativeMedia|sourceImage/i,
    );
    expect(screen.queryByTestId("wallet-prompt")).not.toBeInTheDocument();
  });

  it("offers a connected creator's uploaded images as preview sources", async () => {
    const user = userEvent.setup();
    wagmiState.account.address = getAddress(
      "0x7777777777777777777777777777777777777777",
    );
    wagmiState.account.chainId = 46_630;
    wagmiState.account.isConnected = true;
    const preparedBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    processImageMock.mockResolvedValue({
      byteLength: preparedBytes.byteLength,
      dimension: 384,
      mime: "image/png",
      objectURL: "blob:saved-image",
      rendererCallBytes: preparedBytes,
      dispose: vi.fn(),
    });
    const creatorMediaLoader = vi.fn().mockResolvedValue([
      {
        store: getAddress("0x8888888888888888888888888888888888888888"),
        creator: wagmiState.account.address,
        mime: 2,
        length: 8,
        digest: `0x${"11".repeat(32)}`,
        runtimeCodehash: `0x${"22".repeat(32)}`,
        payload: "0x89504e470d0a1a0a",
      },
    ]);

    renderLab({ creatorMediaLoader });
    await user.upload(screen.getByLabelText("Renderer package"), packageFile());

    const saved = await screen.findByRole("button", {
      name: "Use uploaded image 1",
    });
    await user.click(saved);

    await waitFor(() => expect(processImageMock).toHaveBeenCalledOnce());
    expect(screen.getByText("Saved image 1")).toBeVisible();
    expect(creatorMediaLoader).toHaveBeenCalledWith(
      expect.anything(),
      wagmiState.account.address,
    );
  });
});
