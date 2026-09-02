import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getAddress, type PublicClient } from "viem";
import { describe, expect, it, vi } from "vitest";

import { ExpiredMembershipSyncControl } from "@/features/creator/ExpiredMembershipSyncControl";

vi.mock("@/lib/direct-read", () => ({
  multicall3Address: "0xca11bde05977b3631167028862be2a173976ca11",
  verifyMulticall3: vi.fn().mockResolvedValue("verified"),
}));

const tier = getAddress("0x1111111111111111111111111111111111111111");
const owner = getAddress("0x2222222222222222222222222222222222222222");
const other = getAddress("0x3333333333333333333333333333333333333333");
const success = (result: unknown) => ({ status: "success" as const, result });

function props(client: PublicClient) {
  return {
    account: owner,
    canSync: true,
    capturedBlock: 90n,
    client,
    owner,
    tier,
    totalMinted: 101n,
    walletChainId: 46630,
    onSync: vi.fn().mockResolvedValue(91n),
  };
}

describe("expired membership sync control", () => {
  it("submits one hundred IDs, rescans, and offers the next batch", async () => {
    const user = userEvent.setup();
    const client = {
      multicall: vi
        .fn()
        .mockImplementationOnce(({ contracts }: { contracts: unknown[] }) =>
          Promise.resolve(
            Array.from({ length: contracts.length / 2 }, () => [
              success(true),
              success(false),
            ]).flat(),
          ),
        )
        .mockResolvedValueOnce([success(true), success(false)])
        .mockImplementationOnce(({ contracts }: { contracts: unknown[] }) =>
          Promise.resolve(
            Array.from({ length: contracts.length / 2 }, () => [
              success(false),
              success(false),
            ]).flat(),
          ),
        )
        .mockResolvedValueOnce([success(true), success(false)]),
    } as unknown as PublicClient;
    const input = props(client);
    const view = render(<ExpiredMembershipSyncControl {...input} />);

    await user.click(
      screen.getByRole("button", { name: "Scan for expired memberships" }),
    );

    expect(
      await screen.findByText(/Scanned 101 memberships at block 90/),
    ).toHaveTextContent("found 101 expired");
    const sync = screen.getByRole("button", {
      name: "Sync next 100 expired memberships",
    });
    await user.click(sync);
    expect(input.onSync).toHaveBeenCalledOnce();
    expect(input.onSync).toHaveBeenCalledWith(
      Array.from({ length: 100 }, (_, index) => BigInt(index + 1)),
    );

    view.rerender(
      <ExpiredMembershipSyncControl {...input} capturedBlock={91n} />,
    );
    const finalSync = await screen.findByRole("button", {
      name: "Sync next 1 expired membership",
    });
    await user.click(finalSync);
    expect(input.onSync).toHaveBeenCalledTimes(2);
    expect(input.onSync).toHaveBeenLastCalledWith([101n]);
  });

  it("discards results when the connected account changes", async () => {
    const user = userEvent.setup();
    const client = {
      multicall: vi.fn().mockResolvedValue([success(true), success(false)]),
    } as unknown as PublicClient;
    const input = { ...props(client), totalMinted: 1n };
    const view = render(<ExpiredMembershipSyncControl {...input} />);
    await user.click(
      screen.getByRole("button", { name: "Scan for expired memberships" }),
    );
    expect(
      await screen.findByRole("button", {
        name: "Sync next 1 expired membership",
      }),
    ).toBeVisible();

    view.rerender(
      <ExpiredMembershipSyncControl
        {...input}
        account={other}
        canSync={false}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /Sync next/ }),
    ).not.toBeInTheDocument();

    view.rerender(<ExpiredMembershipSyncControl {...input} />);
    expect(
      screen.queryByRole("button", { name: /Sync next/ }),
    ).not.toBeInTheDocument();
  });

  it("discards an in-flight scan that resolves after account scope changes", async () => {
    const user = userEvent.setup();
    let resolveRead!: (results: ReturnType<typeof success>[]) => void;
    const multicall = vi.fn(
      () =>
        new Promise<ReturnType<typeof success>[]>((resolve) => {
          resolveRead = resolve;
        }),
    );
    const client = { multicall } as unknown as PublicClient;
    const input = { ...props(client), totalMinted: 1n };
    const view = render(<ExpiredMembershipSyncControl {...input} />);
    await user.click(
      screen.getByRole("button", { name: "Scan for expired memberships" }),
    );
    await vi.waitFor(() => expect(multicall).toHaveBeenCalledOnce());

    view.rerender(
      <ExpiredMembershipSyncControl
        {...input}
        account={other}
        canSync={false}
      />,
    );
    await act(async () => {
      resolveRead([success(true), success(false)]);
      await Promise.resolve();
    });
    expect(
      screen.queryByRole("button", { name: /Sync next/ }),
    ).not.toBeInTheDocument();

    view.rerender(<ExpiredMembershipSyncControl {...input} />);
    expect(
      screen.queryByRole("button", { name: /Sync next/ }),
    ).not.toBeInTheDocument();
  });

  it("discards results when the connected wallet changes chain", async () => {
    const user = userEvent.setup();
    const client = {
      multicall: vi.fn().mockResolvedValue([success(true), success(false)]),
    } as unknown as PublicClient;
    const input = { ...props(client), totalMinted: 1n };
    const view = render(<ExpiredMembershipSyncControl {...input} />);
    await user.click(
      screen.getByRole("button", { name: "Scan for expired memberships" }),
    );
    expect(
      await screen.findByRole("button", {
        name: "Sync next 1 expired membership",
      }),
    ).toBeVisible();

    view.rerender(
      <ExpiredMembershipSyncControl {...input} walletChainId={4663} />,
    );
    expect(
      screen.queryByRole("button", { name: /Sync next/ }),
    ).not.toBeInTheDocument();
  });

  it("does not continue scanning when account scope changes during wallet confirmation", async () => {
    const user = userEvent.setup();
    let resolveSync!: (blockNumber: bigint | undefined) => void;
    const onSync = vi.fn(
      () =>
        new Promise<bigint | undefined>((resolve) => {
          resolveSync = resolve;
        }),
    );
    const client = {
      multicall: vi.fn().mockResolvedValue([success(true), success(false)]),
    } as unknown as PublicClient;
    const input = { ...props(client), totalMinted: 1n, onSync };
    const view = render(<ExpiredMembershipSyncControl {...input} />);
    await user.click(
      screen.getByRole("button", { name: "Scan for expired memberships" }),
    );
    await user.click(
      await screen.findByRole("button", {
        name: "Sync next 1 expired membership",
      }),
    );
    expect(onSync).toHaveBeenCalledOnce();

    view.rerender(
      <ExpiredMembershipSyncControl
        {...input}
        account={other}
        canSync={false}
        capturedBlock={91n}
      />,
    );
    await act(async () => {
      resolveSync(91n);
      await Promise.resolve();
    });
    await new Promise((resolve) => window.setTimeout(resolve, 10));

    expect(client.multicall).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole("button", { name: /Sync next/ }),
    ).not.toBeInTheDocument();
  });

  it("does not carry successful continuation into a batched identity change", async () => {
    const user = userEvent.setup();
    let resolveSync!: (blockNumber: bigint | undefined) => void;
    const onSync = vi.fn(
      () =>
        new Promise<bigint | undefined>((resolve) => {
          resolveSync = resolve;
        }),
    );
    const client = {
      multicall: vi.fn().mockResolvedValue([success(true), success(false)]),
    } as unknown as PublicClient;
    const input = { ...props(client), totalMinted: 1n, onSync };
    const view = render(<ExpiredMembershipSyncControl {...input} />);
    await user.click(
      screen.getByRole("button", { name: "Scan for expired memberships" }),
    );
    await user.click(
      await screen.findByRole("button", {
        name: "Sync next 1 expired membership",
      }),
    );

    await act(async () => {
      resolveSync(91n);
      await Promise.resolve();
      view.rerender(
        <ExpiredMembershipSyncControl
          {...input}
          account={other}
          canSync={false}
          capturedBlock={91n}
        />,
      );
    });
    await new Promise((resolve) => window.setTimeout(resolve, 10));

    expect(client.multicall).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole("button", { name: /Sync next/ }),
    ).not.toBeInTheDocument();
  });

  it("aborts and explains an RPC scan failure", async () => {
    const user = userEvent.setup();
    const client = {
      multicall: vi.fn().mockRejectedValue(new Error("RPC unavailable")),
    } as unknown as PublicClient;
    render(<ExpiredMembershipSyncControl {...props(client)} />);

    await user.click(
      screen.getByRole("button", { name: "Scan for expired memberships" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /scan was discarded/i,
    );
  });
});
