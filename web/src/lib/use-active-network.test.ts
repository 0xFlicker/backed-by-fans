import { renderHook } from "@testing-library/react";
import { robinhood, robinhoodTestnet } from "viem/chains";
import { beforeEach, describe, expect, it, vi } from "vitest";

let activeChainId: number = robinhoodTestnet.id;
let connectedChainId: number | undefined;
const usePublicClient = vi.fn(({ chainId }: { chainId: number }) => ({
  chainId,
}));

vi.mock("wagmi", () => ({
  useAccount: () => ({
    chainId: connectedChainId,
    isConnected: connectedChainId !== undefined,
  }),
  useChainId: () => activeChainId,
  usePublicClient: (input: { chainId: number }) => usePublicClient(input),
}));

import { useActiveNetwork } from "@/lib/use-active-network";

describe("useActiveNetwork", () => {
  beforeEach(() => {
    activeChainId = robinhoodTestnet.id;
    connectedChainId = undefined;
    usePublicClient.mockClear();
  });

  it("keeps supported wallet reads on the active chain", () => {
    activeChainId = robinhood.id;

    const { result } = renderHook(() => useActiveNetwork());

    expect(result.current.chainId).toBe(robinhood.id);
    expect(result.current.clientChainId).toBe(robinhood.id);
    expect(usePublicClient).toHaveBeenCalledWith({ chainId: robinhood.id });
  });

  it("uses the default client without treating an unsupported wallet as supported", () => {
    connectedChainId = 1;

    const { result } = renderHook(() => useActiveNetwork());

    expect(result.current.chain).toBeUndefined();
    expect(result.current.clientChainId).toBe(robinhoodTestnet.id);
    expect(result.current.deployment).toMatchObject({
      status: "unavailable",
      reason: "unsupported-chain",
    });
    expect(usePublicClient).toHaveBeenCalledWith({
      chainId: robinhoodTestnet.id,
    });
  });

  it("uses a connected wallet's unsupported chain instead of stale selection", () => {
    activeChainId = robinhoodTestnet.id;
    connectedChainId = 1;

    const { result } = renderHook(() => useActiveNetwork());

    expect(result.current.chainId).toBe(1);
    expect(result.current.deployment).toMatchObject({
      status: "unavailable",
      reason: "unsupported-chain",
    });
  });
});
