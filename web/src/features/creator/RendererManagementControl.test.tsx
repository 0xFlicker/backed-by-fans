import { render, screen } from "@testing-library/react";
import { getAddress } from "viem";
import { describe, expect, it } from "vitest";

import type { TierManagementSnapshot } from "@/contracts/types";
import { RendererManagementControl } from "@/features/creator/RendererManagementControl";

const tier = getAddress("0x7777777777777777777777777777777777777777");
const renderer = getAddress("0x2222222222222222222222222222222222222222");
const snapshot = {
  address: tier,
  renderer,
  protocolDependencies: { chainId: 46_630 },
} as TierManagementSnapshot;

describe("renderer management entry", () => {
  it("links the owner to the dedicated full Art Studio", () => {
    render(<RendererManagementControl canUpdate snapshot={snapshot} />);

    expect(screen.getByRole("link", { name: "Edit artwork" })).toHaveAttribute(
      "href",
      `/chains/46630/tiers/${tier}/manage/artwork`,
    );
    expect(screen.getByText("Current renderer")).toBeInTheDocument();
  });

  it("does not offer the edit action to a wallet without owner permission", () => {
    render(<RendererManagementControl canUpdate={false} snapshot={snapshot} />);

    expect(screen.queryByRole("link", { name: "Edit artwork" })).toBeNull();
    expect(
      screen.getByText("Connect the creator wallet to edit artwork."),
    ).toBeInTheDocument();
  });
});
