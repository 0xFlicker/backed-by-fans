import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getAddress, zeroAddress, type PublicClient } from "viem";
import { describe, expect, it, vi } from "vitest";

import type { TierManagementSnapshot } from "@/contracts/types";
import { RendererManagementControl } from "@/features/creator/RendererManagementControl";
import { resolveRendererAddress } from "@/features/creator-studio/renderer-address";
import { readCreatedRendererAddresses } from "@/features/renderer-registry/registry-read";
import type { ReadyDeployment } from "@/lib/config";

vi.mock("@/features/creator-studio/renderer-address", async (loadOriginal) => {
  const original =
    await loadOriginal<
      typeof import("@/features/creator-studio/renderer-address")
    >();
  return { ...original, resolveRendererAddress: vi.fn() };
});
vi.mock("@/features/renderer-registry/registry-read", () => ({
  readCreatedRendererAddresses: vi.fn(),
}));

const factory = getAddress("0x1111111111111111111111111111111111111111");
const currentRenderer = getAddress(
  "0x2222222222222222222222222222222222222222",
);
const defaultRenderer = getAddress(
  "0x3333333333333333333333333333333333333333",
);
const createdRenderer = getAddress(
  "0x4444444444444444444444444444444444444444",
);
const customRenderer = getAddress("0x5555555555555555555555555555555555555555");
const owner = getAddress("0x6666666666666666666666666666666666666666");
const schema = `0x${"ab".repeat(32)}` as const;
const art = {
  engine: 2,
  collectionSeed: 10n,
  palette: 1,
  intensity: 64,
  density: 56,
  symmetry: 2,
  typographyScale: 52,
  typographyStyle: 0,
  textVisibility: 1,
  imageFit: 0,
  focalX: 50,
  focalY: 50,
  grain: 36,
  mediaMix: 55,
  primary: 50,
  secondary: 50,
  tertiary: 50,
};
const media = {
  mime: 0,
  store: zeroAddress,
  length: 0,
  digest: `0x${"00".repeat(32)}` as const,
  runtimeCodehash: `0x${"00".repeat(32)}` as const,
};
const snapshot = {
  address: getAddress("0x7777777777777777777777777777777777777777"),
  creator: owner,
  pendingOwner: zeroAddress,
  factory,
  paymentToken: getAddress("0x8888888888888888888888888888888888888888"),
  renderer: currentRenderer,
  protocolDependencies: {
    chainId: 46_630,
    factory,
    paymentTokens: [],
    rendererSchema: schema,
    renderer: defaultRenderer,
    rendererName: "Original",
    rendererEngineCount: 1,
    rendererEngineNames: ["Stack"],
    previewHarness: getAddress("0x9999999999999999999999999999999999999999"),
    mediaStoreFactory: getAddress("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
    mediaStoreFactoryRuntimeCodehash: `0x${"cd".repeat(32)}`,
  },
  tierIdentity: `0x${"ef".repeat(32)}`,
  art,
  media,
  name: "Night Shift",
  symbol: "NIGHT",
  description: "For the people who stay late.",
  externalURI: "https://example.com/night",
  pricePerPeriod: 1n,
  periodDuration: 2_592_000n,
  rewardBps: 500,
  referralBps: 100,
  supplyCap: 0n,
  occupiedSupply: 1n,
  maxPrepaidPeriods: 12n,
  paused: false,
  creatorProceeds: 0n,
  totalMinted: 2n,
} as TierManagementSnapshot;
const deployment: ReadyDeployment = {
  status: "ready",
  chainId: 46_630,
  factoryAddress: factory,
  rendererAddress: defaultRenderer,
  previewHarnessAddress: snapshot.protocolDependencies.previewHarness,
  rendererRegistryAddress: getAddress(
    "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  ),
};
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>';
const tokenURI = `data:application/json;base64,${btoa(
  JSON.stringify({
    name: "Night Shift #7",
    description: snapshot.description,
    image: `data:image/svg+xml;base64,${btoa(svg)}`,
    external_url: snapshot.externalURI,
    attributes: [],
  }),
)}`;

function renderControl(readContract = vi.fn().mockResolvedValue(tokenURI)) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const onUpdate = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <RendererManagementControl
        canUpdate
        client={{ readContract } as unknown as PublicClient}
        deployment={deployment}
        onUpdate={onUpdate}
        owner={owner}
        snapshot={snapshot}
      />
    </QueryClientProvider>,
  );
  return { onUpdate, readContract };
}

describe("renderer management", () => {
  it("orders current, creator, original, and custom choices and previews current tier inputs", async () => {
    vi.mocked(readCreatedRendererAddresses).mockResolvedValue([
      createdRenderer,
    ]);
    vi.mocked(resolveRendererAddress).mockImplementation(
      async (_client, input) => ({
        chainId: input.canonicalChainId,
        address: getAddress(input.address),
        capturedBlock: 100n,
        runtimeCodeHash: `0x${"12".repeat(32)}`,
        schema,
        name: "Renderer",
        engines: ["Engine"],
      }),
    );
    const user = userEvent.setup();
    const { onUpdate, readContract } = renderControl();

    await waitFor(() => expect(screen.getAllByRole("radio")).toHaveLength(4));
    const labels = screen.getByRole("radiogroup", { name: "Artwork renderer" });
    expect(labels.textContent).toMatch(
      /Current.*Your renderer 1.*Original.*Custom/s,
    );
    expect(
      screen.getByText(/existing and future membership tokens/i),
    ).toBeVisible();

    await user.click(screen.getByRole("radio", { name: /Your renderer 1/i }));
    const update = screen.getByRole("button", {
      name: "Update artwork for every membership",
    });
    await waitFor(() => expect(update).toBeEnabled());
    await user.click(update);
    expect(onUpdate).toHaveBeenCalledWith(createdRenderer);

    const previewCall = readContract.mock.calls.at(-1)?.[0] as {
      functionName: string;
      args: readonly [
        { token: { art: typeof art; media: typeof media; tierName: string } },
      ];
    };
    expect(previewCall.functionName).toBe("previewTokenURI");
    expect(previewCall.args[0].token).toMatchObject({
      tierName: snapshot.name,
      art,
      media,
    });
  });

  it("keeps renderer choices usable after one preview RPC error", async () => {
    vi.mocked(readCreatedRendererAddresses).mockResolvedValue([]);
    vi.mocked(resolveRendererAddress).mockImplementation(
      async (_client, input) => ({
        chainId: input.canonicalChainId,
        address: getAddress(input.address),
        capturedBlock: 100n,
        runtimeCodeHash: `0x${"12".repeat(32)}`,
        schema,
        name: "Renderer",
        engines: ["Engine"],
      }),
    );
    const readContract = vi.fn(({ address }: { address: string }) =>
      address.toLowerCase() === currentRenderer.toLowerCase()
        ? Promise.reject(new Error("RPC unavailable"))
        : Promise.resolve(tokenURI),
    );
    const user = userEvent.setup();
    const { onUpdate } = renderControl(readContract);

    expect(
      await screen.findByText(/could not preview the membership/i),
    ).toBeVisible();
    await user.click(screen.getByRole("radio", { name: /Custom/i }));
    await user.type(
      screen.getByLabelText("Renderer contract address"),
      customRenderer,
    );
    const update = screen.getByRole("button", {
      name: "Update artwork for every membership",
    });
    await waitFor(() => expect(update).toBeEnabled());
    await user.click(update);
    expect(onUpdate).toHaveBeenCalledWith(customRenderer);
  });
});
