import { useState } from "react";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  RendererAddressInput,
  type RendererAddressInputProps,
} from "@/features/creator-studio/RendererAddressInput";

const rendererAddress = "0x1111111111111111111111111111111111111111";

const idleProps = {
  address: "",
  decision: "pending",
  onAddressChange: vi.fn(),
  onApprove: vi.fn(),
  onPreview: vi.fn(),
  onReject: vi.fn(),
  preview: { status: "idle" },
} satisfies RendererAddressInputProps;

function AddressHarness({
  onPreview = vi.fn(),
}: {
  onPreview?: RendererAddressInputProps["onPreview"];
}) {
  const [address, setAddress] = useState("");

  return (
    <RendererAddressInput
      {...idleProps}
      address={address}
      onAddressChange={setAddress}
      onPreview={onPreview}
    />
  );
}

describe("RendererAddressInput", () => {
  it("accepts a renderer address directly without offering a chain selector", async () => {
    const user = userEvent.setup();
    const onPreview = vi.fn();
    render(<AddressHarness onPreview={onPreview} />);

    const input = screen.getByRole("textbox", { name: "Renderer address" });
    await user.type(input, rendererAddress);

    expect(input).toHaveValue(rendererAddress);
    await user.click(screen.getByRole("button", { name: "Preview renderer" }));
    expect(onPreview).toHaveBeenCalledOnce();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByText(/choose (a )?(chain|network)/i)).toBeNull();
  });

  it("announces representative preview loading and withholds approval", () => {
    render(
      <RendererAddressInput
        {...idleProps}
        address={rendererAddress}
        preview={{ status: "loading" }}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Making representative previews",
    );
    expect(screen.getByRole("button", { name: "Previewing…" })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Use this renderer" }),
    ).not.toBeInTheDocument();
  });

  it("shows an actionable failure and optional technical detail without approval", async () => {
    const user = userEvent.setup();
    render(
      <RendererAddressInput
        {...idleProps}
        address={rendererAddress}
        preview={{
          status: "error",
          message: "This address did not return all of the required artwork.",
          detail: "Token 42 expired preview reverted.",
        }}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "This address did not return all of the required artwork.",
    );
    await user.click(screen.getByText("Technical details"));
    expect(
      screen.getByText("Token 42 expired preview reverted."),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Use this renderer" }),
    ).not.toBeInTheDocument();
  });

  it("reports the complete representative set and supports explicit approval or rejection", async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    const onReject = vi.fn();
    render(
      <RendererAddressInput
        {...idleProps}
        address={rendererAddress}
        onApprove={onApprove}
        onReject={onReject}
        preview={{
          status: "ready",
          rendererName: "Moonlit Memberships",
          completed: 6,
          total: 6,
        }}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "6 of 6 representative previews are ready",
    );
    expect(screen.getByText("Moonlit Memberships")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Use this renderer" }));
    await user.click(screen.getByRole("button", { name: "Reject renderer" }));

    expect(onApprove).toHaveBeenCalledOnce();
    expect(onReject).toHaveBeenCalledOnce();
  });

  it("shows the current approval decision", () => {
    const view = render(
      <RendererAddressInput
        {...idleProps}
        address={rendererAddress}
        decision="approved"
        preview={{ status: "ready", completed: 6, total: 6 }}
      />,
    );

    expect(screen.getByText("Renderer approved.")).toBeVisible();

    view.rerender(
      <RendererAddressInput
        {...idleProps}
        address={rendererAddress}
        decision="rejected"
        preview={{ status: "ready", completed: 6, total: 6 }}
      />,
    );
    expect(screen.getByText("Renderer rejected.")).toBeVisible();
  });

  it("copies the entered address and confirms the copy", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    render(<RendererAddressInput {...idleProps} address={rendererAddress} />);

    await user.click(screen.getByRole("button", { name: "Copy address" }));

    expect(writeText).toHaveBeenCalledWith(rendererAddress);
    expect(screen.getByText("Address copied.")).toBeVisible();
  });
});
