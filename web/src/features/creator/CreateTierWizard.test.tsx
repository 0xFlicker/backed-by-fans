import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  getAddress,
  keccak256,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createDefaultArtConfig } from "@/features/creator-studio/art-config";
import {
  persistUnsignedStudioDraft,
  studioDraftAbiVersion,
  studioDraftRendererBoundsVersion,
} from "@/features/creator-studio/studio-draft";

let walletAddress: Address | undefined;
let walletChainId = 46_630;
let failDraftRecovery = false;
const readProtocolDependencies = vi.hoisted(() => vi.fn());
const simulateContract = vi.hoisted(() => vi.fn());
const writeContractAsync = vi.hoisted(() => vi.fn());
const processImageSource = vi.hoisted(() => vi.fn());
const activeClient = vi.hoisted(() => ({
  call: vi
    .fn()
    .mockRejectedValue(new Error("Preview unavailable in unit test")),
  getBalance: vi.fn().mockResolvedValue(1n),
  estimateContractGas: vi.fn().mockResolvedValue(1n),
  getChainId: vi.fn().mockResolvedValue(46_630),
  getBlockNumber: vi.fn().mockResolvedValue(10n),
  getGasPrice: vi.fn().mockResolvedValue(1n),
  getBytecode: vi.fn(),
  readContract: vi.fn().mockResolvedValue(`0x${"66".repeat(32)}`),
  waitForTransactionReceipt: vi.fn(),
}));

vi.mock("@wagmi/core", () => ({ simulateContract }));
vi.mock(
  "@/features/creator-studio/image-processing",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/features/creator-studio/image-processing")
    >()),
    processImageSource,
  }),
);
vi.mock("wagmi", () => ({
  useAccount: () => ({
    address: walletAddress,
    chainId: walletAddress ? walletChainId : undefined,
    isConnected: Boolean(walletAddress),
  }),
  useChainId: () => walletChainId,
  useConfig: () => ({}),
  usePublicClient: () => ({}),
  useSwitchChain: () => ({ switchChain: vi.fn() }),
  useWriteContract: () => ({ isPending: false, writeContractAsync }),
}));
vi.mock("@/components/WalletControl", () => ({
  WalletControl: () => <button type="button">Connect wallet</button>,
}));
vi.mock("@/components/WalletReadiness", () => ({
  WalletReadiness: () => <p>Wallet readiness preview</p>,
}));
vi.mock("@/features/protocol/protocol-read", () => ({
  membershipRendererSchema: `0x${"33".repeat(32)}`,
  readProtocolDependencies,
}));
vi.mock("@/lib/use-active-network", () => ({
  useActiveNetwork: () => ({
    chainId: walletChainId,
    clientChainId: 46_630,
    client: activeClient,
    deployment: {
      status: "ready",
      chainId: 46_630,
      factoryAddress: "0x1111111111111111111111111111111111111111",
      usdgAddress: "0x2222222222222222222222222222222222222222",
      rendererAddress: "0x3333333333333333333333333333333333333333",
      previewHarnessAddress: "0x7777777777777777777777777777777777777777",
    },
  }),
}));

import { CreateTierWizard } from "@/features/creator/CreateTierWizard";

function renderWizard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CreateTierWizard />
    </QueryClientProvider>,
  );
}

function rendererTokenURI() {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" />';
  const image = `data:image/svg+xml;base64,${btoa(svg)}`;
  const metadata = JSON.stringify({
    name: "Creator membership #7",
    description: "",
    image,
    external_url: "",
    attributes: [],
  });
  return `data:application/json;base64,${btoa(metadata)}`;
}

function rendererRead(functionName: string) {
  if (functionName === "rendererSchema") return `0x${"33".repeat(32)}`;
  if (functionName === "rendererName") return "BACKED BY FANS / FOUNDING SIX";
  if (functionName === "engineCount") return 6;
  if (functionName === "engineName") return "STACK";
  if (functionName === "previewSVG") {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" />';
  }
  return `0x${"66".repeat(32)}`;
}

async function expectOriginalRenderer() {
  await waitFor(() =>
    expect(screen.getByRole("radio", { name: /STACK/i })).toHaveAttribute(
      "aria-checked",
      "true",
    ),
  );
  expect(
    screen.queryByLabelText("Renderer contract address"),
  ).not.toBeInTheDocument();
}

describe("creator setup component", () => {
  beforeEach(() => {
    walletAddress = undefined;
    walletChainId = 46_630;
    failDraftRecovery = false;
    window.localStorage.clear();
    activeClient.getBalance.mockResolvedValue(1n);
    activeClient.estimateContractGas.mockResolvedValue(1n);
    activeClient.getBlockNumber.mockResolvedValue(10n);
    activeClient.getGasPrice.mockResolvedValue(1n);
    activeClient.getChainId.mockResolvedValue(46_630);
    activeClient.getBytecode.mockReset();
    activeClient.getBytecode.mockResolvedValue("0x6000");
    activeClient.waitForTransactionReceipt.mockReset();
    simulateContract.mockReset();
    writeContractAsync.mockReset();
    processImageSource.mockReset();
    processImageSource.mockResolvedValue({
      mime: "image/jpeg",
      dimension: 512,
      quality: 0.84,
      byteLength: 4,
      bytes: new Uint8Array([1, 2, 3, 4]),
      previewBytes: new Uint8Array([1, 2, 3, 4]),
      rendererCallBytes: new Uint8Array([1, 2, 3, 4]),
      gasEstimateBytes: new Uint8Array([1, 2, 3, 4]),
      writeBytes: new Uint8Array([1, 2, 3, 4]),
      objectURL: "blob:prepared-image",
      dispose: vi.fn(),
    });
    activeClient.readContract.mockImplementation(
      ({ functionName }: { functionName: string }) => {
        if (failDraftRecovery && functionName === "predictTierIdentity") {
          return Promise.reject(new Error("RPC unavailable"));
        }
        return Promise.resolve(
          functionName === "tierForIdentity"
            ? zeroAddress
            : functionName === "previewTokenURI"
              ? rendererTokenURI()
              : functionName === "previewSVG"
                ? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" />'
                : functionName === "rendererSchema"
                  ? `0x${"33".repeat(32)}`
                  : functionName === "rendererName"
                    ? "BACKED BY FANS / FOUNDING SIX"
                    : functionName === "engineCount"
                      ? 6
                      : functionName === "engineName"
                        ? "STACK"
                        : rendererRead(functionName),
        );
      },
    );
    readProtocolDependencies.mockResolvedValue({
      status: "valid",
      data: {
        chainId: 46_630,
        factory: "0x1111111111111111111111111111111111111111",
        paymentToken: "0x2222222222222222222222222222222222222222",
        rendererSchema: `0x${"33".repeat(32)}`,
        renderer: "0x3333333333333333333333333333333333333333",
        rendererName: "BACKED BY FANS / FOUNDING SIX",
        rendererEngineCount: 6,
        rendererEngineNames: [
          "STACK",
          "CHORUS",
          "LOOM",
          "BLOOM",
          "MARQUEE",
          "AFTERIMAGE",
        ],
        previewHarness: "0x7777777777777777777777777777777777777777",
        mediaStoreFactory: "0x4444444444444444444444444444444444444444",
        mediaStoreFactoryRuntimeCodehash: `0x${"55".repeat(32)}`,
      },
    });
  });

  it("starts identity fields empty with examples as placeholders", async () => {
    const user = userEvent.setup();
    renderWizard();

    const name = screen.getByLabelText("Membership name");
    const symbol = screen.getByLabelText("Symbol");
    expect(name).toHaveValue("");
    expect(name).toHaveAttribute("placeholder", "Creator membership");
    expect(symbol).toHaveValue("");
    expect(symbol).toHaveAttribute("placeholder", "FANS");
    expect(document.getElementById("tier-name-error")).toHaveAttribute(
      "aria-hidden",
      "true",
    );

    await user.click(name);
    await user.click(symbol);
    expect(document.getElementById("tier-name-error")).toHaveAttribute(
      "role",
      "alert",
    );
  });

  it("starts the Art Studio with the original renderer selected", async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.click(screen.getByRole("button", { name: /^art studio$/i }));
    await expectOriginalRenderer();
    expect(screen.getByRole("radio", { name: /CUSTOM/i })).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Artwork renderer" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/approve|accept/i)).not.toBeInTheDocument();
  });

  it("keeps the six original styles visible when protocol reads fail", async () => {
    const user = userEvent.setup();
    readProtocolDependencies.mockRejectedValueOnce(
      new Error("RPC unavailable"),
    );
    renderWizard();

    await user.click(screen.getByRole("button", { name: /^art studio$/i }));

    const styles = screen.getByRole("radiogroup", { name: "Art styles" });
    expect(within(styles).getAllByRole("radio")).toHaveLength(7);
    expect(
      within(styles).getByRole("radio", { name: /STACK/i }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      within(styles).getByRole("radio", { name: /CUSTOM/i }),
    ).toBeVisible();
  });

  it("accepts a custom renderer address without a separate approval step", async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole("button", { name: /^art studio$/i }));
    await user.click(screen.getByRole("radio", { name: /Custom/i }));
    const input = await screen.findByLabelText("Renderer contract address");
    const customRenderer = "0x8888888888888888888888888888888888888888";

    await user.type(input, customRenderer);
    await waitFor(() =>
      expect(screen.getByText("BACKED BY FANS / FOUNDING SIX")).toBeVisible(),
    );
    expect(
      screen.queryByRole("button", { name: /use this renderer/i }),
    ).not.toBeInTheDocument();
  });

  it("shows a custom renderer error directly", async () => {
    const user = userEvent.setup();
    activeClient.getBytecode.mockResolvedValue("0x");
    renderWizard();
    await user.click(screen.getByRole("button", { name: /^art studio$/i }));
    await user.click(screen.getByRole("radio", { name: /Custom/i }));
    await user.type(
      screen.getByLabelText("Renderer contract address"),
      "0x8888888888888888888888888888888888888888",
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No renderer contract exists",
    );
  });

  it("keeps the selected renderer usable when saved-draft recovery loses RPC access", async () => {
    const user = userEvent.setup();
    const creator = getAddress("0x1111111111111111111111111111111111111111");
    const customRenderer = getAddress(
      "0x8888888888888888888888888888888888888888",
    );
    walletAddress = creator;
    const savedDraftKey = persistUnsignedStudioDraft(window.localStorage, {
      scope: {
        chainId: 46_630,
        factory: getAddress("0x1111111111111111111111111111111111111111"),
        creator,
        renderer: customRenderer,
        mediaRegistry: getAddress("0x4444444444444444444444444444444444444444"),
        abiVersion: studioDraftAbiVersion,
        rendererBoundsVersion: studioDraftRendererBoundsVersion,
      },
      tierSalt: `0x${"12".repeat(32)}`,
      art: createDefaultArtConfig("stack", 12n),
      media: { mode: "none" },
    });
    const savedDraft = window.localStorage.getItem(savedDraftKey);
    renderWizard();

    await user.click(screen.getByRole("button", { name: /^art studio$/i }));
    await expectOriginalRenderer();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /surprise me/i }),
      ).toBeEnabled(),
    );
    await user.click(screen.getByRole("radio", { name: /Custom/i }));
    failDraftRecovery = true;
    await user.type(
      screen.getByLabelText("Renderer contract address"),
      customRenderer,
    );

    await waitFor(() =>
      expect(screen.getByRole("radio", { name: /Custom/i })).toHaveAttribute(
        "aria-checked",
        "true",
      ),
    );
    expect(
      await screen.findByText(/Continuing without autosave for this renderer/i),
    ).toBeVisible();
    expect(screen.getByRole("radio", { name: /STACK/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /surprise me/i })).toBeEnabled();
    expect(
      screen.queryByRole("heading", { name: /Saved draft needs attention/i }),
    ).not.toBeInTheDocument();
    expect(window.localStorage.getItem(savedDraftKey)).toBe(savedDraft);
  });

  it("preserves completed input through wallet and network rerenders", async () => {
    const user = userEvent.setup();
    const view = renderWizard();
    const name = screen.getByLabelText("Membership name");
    await user.type(name, "The listening room");

    walletAddress = getAddress("0x1111111111111111111111111111111111111111");
    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <CreateTierWizard />
      </QueryClientProvider>,
    );
    walletChainId = 4_663;
    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <CreateTierWizard />
      </QueryClientProvider>,
    );

    expect(screen.getByLabelText("Membership name")).toHaveValue(
      "The listening room",
    );
  });

  it("uses a fresh salt for an empty creator scope and restores each saved identity", async () => {
    const creatorA = getAddress("0x1111111111111111111111111111111111111111");
    const creatorB = getAddress("0x9999999999999999999999999999999999999999");
    walletAddress = creatorA;
    const view = renderWizard();
    const saltCalls = (creator: Address) =>
      activeClient.readContract.mock.calls
        .map(([request]) => request)
        .filter(
          (request) =>
            request.functionName === "predictTierIdentity" &&
            request.args?.[0] === creator,
        )
        .map((request) => request.args?.[1]);

    await waitFor(() => expect(saltCalls(creatorA)).toHaveLength(1));
    const saltA = saltCalls(creatorA).at(-1);

    walletAddress = creatorB;
    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <CreateTierWizard />
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(saltCalls(creatorB).some((salt) => salt !== saltA)).toBe(true),
    );
    const saltB = saltCalls(creatorB).at(-1);
    expect(saltB).not.toBe(saltA);

    walletAddress = creatorA;
    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <CreateTierWizard />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(saltCalls(creatorA).at(-1)).toBe(saltA));
  });

  it("rotates identity when a new creator continues after storage recovery fails", async () => {
    const user = userEvent.setup();
    const creatorA = getAddress("0x1111111111111111111111111111111111111111");
    const creatorB = getAddress("0x9999999999999999999999999999999999999999");
    const saltCalls = (creator: Address) =>
      activeClient.readContract.mock.calls
        .map(([request]) => request)
        .filter(
          (request) =>
            request.functionName === "predictTierIdentity" &&
            request.args?.[0] === creator,
        )
        .map((request) => request.args?.[1]);

    walletAddress = creatorA;
    const view = renderWizard();
    await waitFor(() => expect(saltCalls(creatorA)).toHaveLength(1));
    const saltA = saltCalls(creatorA).at(-1);
    await user.click(screen.getByRole("button", { name: /^art studio$/i }));

    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    walletAddress = creatorB;
    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <CreateTierWizard />
      </QueryClientProvider>,
    );

    const continueWithoutAutosave = await screen.findByRole("button", {
      name: /continue without autosave/i,
    });
    await user.click(continueWithoutAutosave);

    await waitFor(() =>
      expect(saltCalls(creatorB).some((salt) => salt !== saltA)).toBe(true),
    );
    expect(saltCalls(creatorB).at(-1)).not.toBe(saltA);
  });

  it("preserves uncertain tier verification across creator scope changes without resubmitting", async () => {
    const user = userEvent.setup();
    const creatorA = getAddress("0x1111111111111111111111111111111111111111");
    const creatorB = getAddress("0x9999999999999999999999999999999999999999");
    const transactionHash = `0x${"77".repeat(32)}`;

    walletAddress = creatorA;
    activeClient.getBalance.mockResolvedValue(10n);
    simulateContract.mockResolvedValue({ request: {} });
    writeContractAsync.mockResolvedValue(transactionHash);
    activeClient.waitForTransactionReceipt.mockResolvedValue({
      status: "success",
      transactionHash,
      blockNumber: 10n,
      logs: [],
    });
    const view = renderWizard();

    await user.type(screen.getByLabelText("Membership name"), "After Hours");
    await user.type(screen.getByLabelText("Symbol"), "NITE");
    await user.click(screen.getByRole("button", { name: /^art studio$/i }));
    await expectOriginalRenderer();
    await user.click(screen.getByRole("button", { name: /^risks$/i }));
    const acknowledgements = screen.getAllByRole("checkbox");
    await user.click(acknowledgements[0]);
    await user.click(acknowledgements[1]);
    await user.click(screen.getByRole("button", { name: /^review$/i }));

    const publish = screen.getByRole("button", {
      name: /publish this membership/i,
    });
    await waitFor(() => expect(publish).toBeEnabled());
    await user.click(publish);

    expect(simulateContract).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        functionName: "createTier",
        args: [
          expect.objectContaining({
            renderer: "0x3333333333333333333333333333333333333333",
          }),
        ],
      }),
    );

    await screen.findByRole("heading", {
      name: /finish checking the membership/i,
    });
    expect(publish).toBeDisabled();
    expect(writeContractAsync).toHaveBeenCalledOnce();

    walletAddress = creatorB;
    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <CreateTierWizard />
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", {
          name: /finish checking the membership/i,
        }),
      ).not.toBeInTheDocument(),
    );

    walletAddress = creatorA;
    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <CreateTierWizard />
      </QueryClientProvider>,
    );

    await screen.findByRole("heading", {
      name: /finish checking the membership/i,
    });
    const recoveredPublish = screen.getByRole("button", {
      name: /publish this membership/i,
    });
    expect(recoveredPublish).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /check again/i }));
    await waitFor(() => expect(writeContractAsync).toHaveBeenCalledOnce());
    expect(activeClient.waitForTransactionReceipt).toHaveBeenCalledOnce();
    expect(activeClient.waitForTransactionReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ confirmations: 3 }),
    );
  });

  it("waits for three image confirmations, then submits the membership", async () => {
    const user = userEvent.setup();
    const imageHash = `0x${"88".repeat(32)}`;
    const membershipHash = `0x${"99".repeat(32)}`;
    const creator = getAddress("0x1111111111111111111111111111111111111111");
    const store = getAddress("0x5555555555555555555555555555555555555555");
    const payload = "0x01020304";
    const runtimeCode = `0x00${payload.slice(2)}` as Hex;
    const digest = keccak256(payload);
    const runtimeCodehash = keccak256(runtimeCode);

    walletAddress = creator;
    activeClient.getBalance.mockResolvedValue(10n);
    simulateContract.mockResolvedValue({ request: {} });
    writeContractAsync
      .mockResolvedValueOnce(imageHash)
      .mockResolvedValueOnce(membershipHash);
    activeClient.waitForTransactionReceipt
      .mockResolvedValueOnce({
        status: "success",
        transactionHash: imageHash,
        blockNumber: 10n,
        logs: [],
      })
      .mockImplementationOnce(() => new Promise(() => {}));
    activeClient.getBytecode.mockResolvedValue(runtimeCode);
    activeClient.readContract.mockImplementation(
      ({ functionName }: { functionName: string }) => {
        if (functionName === "tierForIdentity")
          return Promise.resolve(zeroAddress);
        if (functionName === "previewTokenURI") {
          return Promise.resolve(rendererTokenURI());
        }
        if (functionName === "mediaStore" || functionName === "predictStore") {
          return Promise.resolve(store);
        }
        if (functionName === "isRegisteredMedia") return Promise.resolve(true);
        if (functionName === "mediaRecord") {
          return Promise.resolve({
            store,
            creator,
            mime: 1,
            length: 4,
            digest,
            runtimeCodehash,
          });
        }
        return Promise.resolve(rendererRead(functionName));
      },
    );
    renderWizard();

    await user.type(screen.getByLabelText("Membership name"), "After Hours");
    await user.type(screen.getByLabelText("Symbol"), "NITE");
    await user.click(screen.getByRole("button", { name: /^art studio$/i }));
    await expectOriginalRenderer();
    await user.click(screen.getByText("Add an image", { exact: true }));
    await user.upload(
      screen.getByLabelText("Add new image"),
      new File([new Uint8Array([1, 2, 3, 4])], "cover.jpg", {
        type: "image/jpeg",
      }),
    );
    await screen.findByAltText("New image");
    await user.click(screen.getByRole("button", { name: /^risks$/i }));
    const acknowledgements = screen.getAllByRole("checkbox");
    await user.click(acknowledgements[0]);
    await user.click(acknowledgements[1]);
    await user.click(screen.getByRole("button", { name: /^review$/i }));

    const publish = screen.getByRole("button", {
      name: /publish this membership/i,
    });
    await waitFor(() => expect(publish).toBeEnabled());
    await user.click(publish);

    await waitFor(() => expect(writeContractAsync).toHaveBeenCalledTimes(2));
    expect(activeClient.waitForTransactionReceipt).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ confirmations: 3, hash: imageHash }),
    );
    expect(activeClient.waitForTransactionReceipt).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ confirmations: 3, hash: membershipHash }),
    );
  });

  it("keeps an empty percentage calm while editing and normalizes it to zero on blur", async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.click(screen.getByRole("button", { name: /^support split$/i }));
    const reward = screen.getByLabelText("Membership rewards (%)");
    const referral = screen.getByLabelText("Referral share (%)");

    await user.clear(reward);
    expect(reward).toHaveValue("");
    expect(document.getElementById("tier-reward-error")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(document.getElementById("tier-reward-error")).not.toHaveAttribute(
      "role",
    );
    expect(document.getElementById("tier-referral-error")).toBeInTheDocument();

    await user.click(referral);
    expect(reward).toHaveValue("0");
  });

  it("replaces the mutable image URI with the immutable Art Studio", async () => {
    const user = userEvent.setup();
    renderWizard();

    expect(
      screen.queryByLabelText(/creator image uri/i),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^art studio$/i }));

    expect(
      screen.getByLabelText("Creator setup steps").parentElement,
    ).toHaveClass("creator-workspace", "creator-workspace-studio");

    expect(
      screen.getByRole("heading", {
        name: /make the membership unmistakably yours/i,
      }),
    ).toBeVisible();
    expect(
      within(
        screen.getByRole("radiogroup", { name: "Art styles" }),
      ).getAllByRole("radio"),
    ).toHaveLength(7);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /surprise me/i }),
      ).toBeEnabled(),
    );
  });

  it("creates a fresh collection identity for each new Studio mount", async () => {
    const user = userEvent.setup();
    const first = renderWizard();
    await user.click(screen.getByRole("button", { name: /^art studio$/i }));
    await expectOriginalRenderer();
    const firstSeed = first.container.querySelector("code")?.textContent;
    first.unmount();

    const second = renderWizard();
    await user.click(screen.getByRole("button", { name: /^art studio$/i }));
    await expectOriginalRenderer();
    const secondSeed = second.container.querySelector("code")?.textContent;
    expect(firstSeed).toMatch(/^[0-9a-f]{32}$/);
    expect(secondSeed).toMatch(/^[0-9a-f]{32}$/);
    expect(secondSeed).not.toBe(firstSeed);
  });

  it("confirms the art direction by advancing to price and period", async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole("button", { name: /^art studio$/i }));
    expect(
      screen.queryByRole("button", { name: /keep this direction/i }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /next step/i }));

    expect(
      screen.getByRole("heading", { name: /set price and renewal/i }),
    ).toBeVisible();
  });

  it("requires both material acknowledgements before deployment", async () => {
    const user = userEvent.setup();
    walletAddress = getAddress("0x1111111111111111111111111111111111111111");
    renderWizard();

    await user.click(screen.getByRole("button", { name: /^risks$/i }));
    const acknowledgements = screen.getAllByRole("checkbox");
    expect(acknowledgements).toHaveLength(2);
    await user.click(acknowledgements[0]);
    await user.click(screen.getByRole("button", { name: /^review$/i }));

    const queue = screen.getByRole("region", { name: /publish queue/i });
    expect(queue).toBeVisible();
    expect(within(queue).getByText("Create membership")).toBeVisible();
    expect(within(queue).queryByText("Store image")).not.toBeInTheDocument();
    expect(screen.getByText(/review both acknowledgements/i)).toBeVisible();
    expect(
      screen.getByRole("button", { name: /publish this membership/i }),
    ).toBeDisabled();
  });
});
