import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getAddress } from "viem";
import { describe, expect, it, vi } from "vitest";

import { CopyableAddress } from "@/features/membership/RendererDetails";

const renderer = getAddress("0x6666666666666666666666666666666666666666");

describe("renderer details", () => {
  it("shows and copies the renderer address without an expanding disclosure", async () => {
    const user = userEvent.setup();
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);

    render(<CopyableAddress address={renderer} label="Renderer" />);

    expect(screen.getByText(renderer)).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "Copy renderer address" }),
    );

    expect(writeText).toHaveBeenCalledWith(renderer);
    expect(
      screen.getByRole("button", { name: "Renderer address copied" }),
    ).toBeVisible();
  });

  it("links the address to the configured explorer", () => {
    render(
      <CopyableAddress
        address={renderer}
        explorerUrl="https://explorer.example"
        label="Renderer"
      />,
    );

    expect(
      screen.getByRole("link", { name: "View on explorer" }),
    ).toHaveAttribute("href", `https://explorer.example/address/${renderer}`);
  });
});
