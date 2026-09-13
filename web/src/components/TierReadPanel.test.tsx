import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { Address } from "viem";
import { TierReadPanel } from "./TierReadPanel";

const mocks = vi.hoisted(() => ({
  account: { address: undefined as Address | undefined, chainId: 31337 },
  read: vi.fn(),
  client: {},
}));
vi.mock("@/lib/use-hydrated-account", () => ({
  useHydratedAccount: () => mocks.account,
}));
vi.mock("@/lib/use-wallet-public-client", () => ({
  useWalletPublicClient: () => mocks.client,
}));
vi.mock("@/lib/config", () => ({
  publicConfig: {},
  getDeployment: () => ({ status: "ready" }),
}));
vi.mock("@/features/membership/membership-read", () => ({
  readTierSupporterState: mocks.read,
}));
vi.mock("@/features/membership/MembershipExperience", () => ({
  MembershipExperience: ({
    snapshot,
    onSelectPosition,
  }: {
    snapshot: { wallet: Address; tokenId: bigint };
    onSelectPosition: (id: bigint) => void;
  }) => (
    <div>
      <p>
        {snapshot.wallet}:{snapshot.tokenId.toString()}
      </p>
      <button onClick={() => onSelectPosition(0n)}>Join again</button>
    </div>
  ),
}));

it("binds a URL position after connection and clears it when wallets switch", async () => {
  const first = "0x1111111111111111111111111111111111111111";
  const second = "0x2222222222222222222222222222222222222222";
  mocks.read.mockImplementation(async (_client, input) => ({
    status: "valid",
    capturedBlock: 1n,
    data: input,
  }));
  const queries = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = () => (
    <QueryClientProvider client={queries}>
      <TierReadPanel
        chainId={31337}
        tierAddress="0x3333333333333333333333333333333333333333"
        initialTokenId={7n}
      />
    </QueryClientProvider>
  );
  const mounted = render(view());
  mocks.account.address = first;
  mounted.rerender(view());
  await screen.findByText(`${first}:7`);
  mocks.account.address = second;
  mounted.rerender(view());
  await screen.findByText(`${second}:0`);
  await waitFor(() =>
    expect(mocks.read).toHaveBeenCalledWith(
      mocks.client,
      expect.objectContaining({ wallet: second, tokenId: 0n }),
    ),
  );
  expect(mocks.read).not.toHaveBeenCalledWith(
    mocks.client,
    expect.objectContaining({ wallet: second, tokenId: 7n }),
  );
});

it("opens the sole membership but preserves an explicit new membership choice", async () => {
  const wallet = "0x1111111111111111111111111111111111111111";
  mocks.account.address = wallet;
  mocks.read.mockImplementation(async (_client, input) => ({
    status: "valid",
    capturedBlock: 1n,
    data: { ...input, ownerPage: { balance: 1n, tokenIds: [9n] } },
  }));
  const queries = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queries}>
      <TierReadPanel
        chainId={31337}
        tierAddress="0x3333333333333333333333333333333333333333"
      />
    </QueryClientProvider>,
  );
  await screen.findByText(`${wallet}:9`);
  fireEvent.click(screen.getByRole("button", { name: "Join again" }));
  await screen.findByText(`${wallet}:0`);
  await queries.invalidateQueries();
  await waitFor(() => expect(screen.getByText(`${wallet}:0`)).toBeVisible());
});
