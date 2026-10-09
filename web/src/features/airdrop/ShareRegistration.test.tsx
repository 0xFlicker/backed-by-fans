import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ShareRegistration } from "./ShareRegistration";

const collection = "0x0000000000000000000000000000000000000004";
const copy = vi.fn();
beforeEach(() => {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: copy },
    configurable: true,
  });
  Object.defineProperty(navigator, "share", {
    value: undefined,
    configurable: true,
  });
  copy.mockResolvedValue(undefined);
});
function mount() {
  render(<ShareRegistration chainId={4663} collection={collection} />);
  fireEvent.click(
    screen.getByRole("button", { name: "Share registration link" }),
  );
}
describe("owner registration sharing", () => {
  it("uses native sharing when available", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", {
      value: share,
      configurable: true,
    });
    mount();
    await screen.findByText("Registration link shared.");
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({
        url: `${window.location.origin}/chains/4663/airdrop/register/${collection}`,
      }),
    );
    expect(copy).not.toHaveBeenCalled();
  });
  it("copies the full owner registration URL when native share is absent", async () => {
    mount();
    await screen.findByText("Registration link copied.");
    expect(copy).toHaveBeenCalledWith(
      `${window.location.origin}/chains/4663/airdrop/register/${collection}`,
    );
  });
  it("falls back to copying if native share is unavailable at runtime", async () => {
    Object.defineProperty(navigator, "share", {
      value: vi.fn().mockRejectedValue(new Error("Unavailable")),
      configurable: true,
    });
    mount();
    await screen.findByText("Registration link copied.");
  });
  it("does not copy after the user cancels the native share sheet", async () => {
    Object.defineProperty(navigator, "share", {
      value: vi
        .fn()
        .mockRejectedValue(new DOMException("Cancelled", "AbortError")),
      configurable: true,
    });
    mount();
    await screen.findByText("Sharing cancelled.");
    expect(copy).not.toHaveBeenCalled();
  });
  it("shows a usable registration link if the clipboard is denied", async () => {
    copy.mockRejectedValueOnce(new Error("Denied"));
    mount();
    await screen.findByText(/Could not copy the link/);
    expect(
      screen.getByRole("link", { name: "Owner registration" }),
    ).toHaveAttribute("href", `/chains/4663/airdrop/register/${collection}`);
  });
});
