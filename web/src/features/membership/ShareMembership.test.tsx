import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getAddress } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ShareMembership } from "@/features/membership/ShareMembership";

const tier = getAddress("0x2222222222222222222222222222222222222222");
const referrer = getAddress("0x1111111111111111111111111111111111111111");

describe("share membership", () => {
  beforeEach(() => {
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
      configurable: true,
      value: function showModal(this: HTMLDialogElement) {
        this.setAttribute("open", "");
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, "close", {
      configurable: true,
      value: function close(this: HTMLDialogElement) {
        this.removeAttribute("open");
      },
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
    Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
    Reflect.deleteProperty(navigator, "share");
    vi.restoreAllMocks();
  });

  it("opens a dialog and copies the canonical link for a disconnected visitor", async () => {
    const user = userEvent.setup();
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);

    render(
      <ShareMembership chainId={46_630} name="Genesis Fans" tier={tier} />,
    );

    await user.click(screen.getByRole("button", { name: "Share" }));

    const dialog = screen.getByRole("dialog", { name: "Genesis Fans" });
    const expectedUrl = `http://localhost:3000/chains/46630/tiers/${tier}`;
    expect(dialog).toHaveAttribute("open");
    expect(screen.getByText(expectedUrl)).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Share with another app" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Copy share link" }));

    expect(writeText).toHaveBeenCalledWith(expectedUrl);
    expect(screen.getByText("Link copied.")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Share link copied" }),
    ).toBeVisible();
  });

  it("includes the connected wallet and opens the native share sheet", async () => {
    const user = userEvent.setup();
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: share,
    });

    render(
      <ShareMembership
        chainId={46_630}
        name="Genesis Fans"
        referrer={referrer}
        tier={tier}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Share" }));
    const expectedUrl = `http://localhost:3000/chains/46630/tiers/${tier}?ref=${referrer}`;
    await user.click(
      screen.getByRole("button", { name: "Share with another app" }),
    );

    expect(share).toHaveBeenCalledWith({
      title: "Genesis Fans",
      text: "Join Genesis Fans on Backed By Fans.",
      url: expectedUrl,
    });
    expect(screen.getByRole("dialog", { hidden: true })).not.toHaveAttribute(
      "open",
    );
  });
});
