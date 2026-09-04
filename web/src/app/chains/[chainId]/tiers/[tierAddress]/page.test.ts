import { beforeEach, describe, expect, it, vi } from "vitest";

const tier = "0x4444444444444444444444444444444444444444";
const readTierState = vi.hoisted(() => vi.fn());

vi.mock("@/lib/server-tier-state", () => ({
  readServerTierSupporterState: readTierState,
}));

import { generateMetadata } from "@/app/chains/[chainId]/tiers/[tierAddress]/page";

describe("membership page metadata", () => {
  beforeEach(() => {
    readTierState.mockReset();
  });

  it("describes the membership and uses its generated social card", async () => {
    readTierState.mockResolvedValue({
      status: "valid",
      capturedBlock: 123n,
      data: {
        name: "Genesis Fans",
        symbol: "FANS",
        description: "Membership for the earliest supporters.",
      },
    });

    const metadata = await generateMetadata({
      params: Promise.resolve({ chainId: "46630", tierAddress: tier }),
    });

    expect(metadata).toMatchObject({
      title: "Genesis Fans (FANS)",
      description: "Membership for the earliest supporters.",
      alternates: {
        canonical: `/chains/46630/tiers/${tier}`,
      },
      openGraph: {
        title: "Genesis Fans (FANS)",
        description: "Membership for the earliest supporters.",
        siteName: "Backed By Fans",
        type: "website",
      },
      twitter: {
        card: "summary_large_image",
        title: "Genesis Fans (FANS)",
        description: "Membership for the earliest supporters.",
      },
    });
    expect(readTierState).toHaveBeenCalledWith(46_630, tier);
  });

  it("keeps invalid membership links out of search results", async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({
        chainId: "46630",
        tierAddress: "not-an-address",
      }),
    });

    expect(metadata).toMatchObject({
      title: "Invalid membership link",
      robots: { index: false, follow: false },
    });
    expect(readTierState).not.toHaveBeenCalled();
  });
});
