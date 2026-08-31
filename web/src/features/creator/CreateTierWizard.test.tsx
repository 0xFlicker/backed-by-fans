import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getAddress, zeroAddress, type Address } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

let walletAddress: Address | undefined;
let walletChainId = 46_630;
const readProtocolDependencies = vi.hoisted(() => vi.fn());
const simulateContract = vi.hoisted(() => vi.fn());
const writeContractAsync = vi.hoisted(() => vi.fn());
const activeClient = vi.hoisted(() => ({
  call: vi
    .fn()
    .mockRejectedValue(new Error("Preview unavailable in unit test")),
  getBalance: vi.fn().mockResolvedValue(1n),
  estimateContractGas: vi.fn().mockResolvedValue(1n),
  getBlockNumber: vi.fn().mockResolvedValue(10n),
  getGasPrice: vi.fn().mockResolvedValue(1n),
  readContract: vi.fn().mockResolvedValue(`0x${"66".repeat(32)}`),
  waitForTransactionReceipt: vi.fn(),
}));

vi.mock("@wagmi/core", () => ({ simulateContract }));
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

describe("creator setup component", () => {
  beforeEach(() => {
    walletAddress = undefined;
    walletChainId = 46_630;
    window.localStorage.clear();
    activeClient.getBalance.mockResolvedValue(1n);
    activeClient.estimateContractGas.mockResolvedValue(1n);
    activeClient.getBlockNumber.mockResolvedValue(10n);
    activeClient.getGasPrice.mockResolvedValue(1n);
    activeClient.waitForTransactionReceipt.mockReset();
    simulateContract.mockReset();
    writeContractAsync.mockReset();
    activeClient.readContract.mockImplementation(
      ({ functionName }: { functionName: string }) =>
        Promise.resolve(
          functionName === "tierForIdentity"
            ? zeroAddress
            : functionName === "previewTokenURI"
              ? rendererTokenURI()
              : `0x${"66".repeat(32)}`,
        ),
    );
    readProtocolDependencies.mockResolvedValue({
      status: "valid",
      data: {
        chainId: 46_630,
        factory: "0x1111111111111111111111111111111111111111",
        paymentToken: "0x2222222222222222222222222222222222222222",
        rendererSchema: `0x${"33".repeat(32)}`,
        rendererCount: 1,
        renderers: [
          {
            version: 1,
            implementation: "0x3333333333333333333333333333333333333333",
            runtimeCodehash: `0x${"44".repeat(32)}`,
            enabled: true,
            name: "BACKED BY FANS / FOUNDING SIX",
            engineCount: 6,
            engineNames: [
              "STACK",
              "CHORUS",
              "LOOM",
              "BLOOM",
              "MARQUEE",
              "AFTERIMAGE",
            ],
          },
        ],
        defaultRendererVersion: 1,
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
      screen.getAllByRole("radio", {
        name: /stack|chorus|loom|bloom|marquee|afterimage/i,
      }),
    ).toHaveLength(6);
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
    const firstSeed = first.container.querySelector("code")?.textContent;
    first.unmount();

    const second = renderWizard();
    await user.click(screen.getByRole("button", { name: /^art studio$/i }));
    const secondSeed = second.container.querySelector("code")?.textContent;
    expect(firstSeed).toMatch(/^[0-9a-f]{32}$/);
    expect(secondSeed).toMatch(/^[0-9a-f]{32}$/);
    expect(secondSeed).not.toBe(firstSeed);
  });

  it("keeps an art direction by advancing to price and period", async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole("button", { name: /^art studio$/i }));
    const keep = screen.getByRole("button", {
      name: /keep this direction/i,
    });
    await waitFor(() => expect(keep).toBeEnabled());
    await user.click(keep);

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

    expect(screen.getByText(/review both acknowledgements/i)).toBeVisible();
    expect(
      screen.getByRole("button", { name: /publish this membership/i }),
    ).toBeDisabled();
  });
});
