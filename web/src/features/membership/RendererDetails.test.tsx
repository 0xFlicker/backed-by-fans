import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getAddress } from "viem";
import { describe, expect, it, vi } from "vitest";

import { RendererDetails } from "@/features/membership/RendererDetails";

const renderer = getAddress("0x6666666666666666666666666666666666666666");

describe("renderer details", () => {
  it("reveals and copies the renderer address with clear feedback", async () => {
    const user = userEvent.setup();
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);

    render(<RendererDetails chainId={46_630} renderer={renderer} />);

    await user.click(screen.getByText("Reuse this artwork"));

    expect(screen.getByText(renderer)).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "Copy renderer address" }),
    );

    expect(writeText).toHaveBeenCalledWith(renderer);
    expect(
      screen.getByRole("button", { name: "Renderer address copied" }),
    ).toBeVisible();
  });

  it("explains same-testnet address sharing without registry or listing language", async () => {
    const user = userEvent.setup();
    render(<RendererDetails chainId={46_630} renderer={renderer} />);

    await user.click(screen.getByText("Reuse this artwork"));

    expect(screen.getByText(/Robinhood Chain Testnet/i)).toBeVisible();
    expect(screen.getByText(/same network/i)).toBeVisible();
    expect(screen.queryByText(/registry|listing|submit/i)).toBeNull();
  });
});
