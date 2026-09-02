import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getAddress } from "viem";
import { describe, expect, it, vi } from "vitest";

import { PaymentTokenPicker } from "@/features/creator/PaymentTokenPicker";
import type { AcceptedPaymentTokenReadState } from "@/lib/payment-token-read";
import { tokenMultiplierScale } from "@/lib/token-amount";

const factory = getAddress("0x1111111111111111111111111111111111111111");
const heldStock = getAddress("0x2222222222222222222222222222222222222222");
const unheldDollar = getAddress("0x3333333333333333333333333333333333333333");
const disabled = getAddress("0x4444444444444444444444444444444444444444");

const state: AcceptedPaymentTokenReadState = {
  status: "partial",
  capturedBlock: 100n,
  failures: [
    {
      address: getAddress("0x5555555555555555555555555555555555555555"),
      registryIndex: 3,
      operation: "metadata",
      label: "Unable to read metadata.",
    },
  ],
  data: [
    {
      chainId: 46_630 as const,
      factory,
      address: heldStock,
      registryIndex: 1,
      listed: true,
      enabled: true,
      name: "AMD Stock Token",
      symbol: "AMD",
      decimals: 18,
      scaledUI: true,
      uiMultiplier: 2n * tokenMultiplierScale,
      newUIMultiplier: 2n * tokenMultiplierScale,
      effectiveAt: 0n,
      walletRawBalance: 25_000_000_000_000_000n,
      readBlock: 100n,
    },
    {
      chainId: 46_630,
      factory,
      address: unheldDollar,
      registryIndex: 0,
      listed: true,
      enabled: true,
      name: "Global Dollar",
      symbol: "USDG",
      decimals: 6,
      scaledUI: false,
      uiMultiplier: tokenMultiplierScale,
      newUIMultiplier: tokenMultiplierScale,
      effectiveAt: 0n,
      walletRawBalance: 0n,
      readBlock: 100n,
    },
    {
      chainId: 46_630,
      factory,
      address: disabled,
      registryIndex: 2,
      listed: true,
      enabled: false,
      name: "Disabled Token",
      symbol: "OFF",
      decimals: 18,
      scaledUI: false,
      uiMultiplier: tokenMultiplierScale,
      newUIMultiplier: tokenMultiplierScale,
      effectiveAt: 0n,
      walletRawBalance: 1n,
      readBlock: 100n,
    },
  ],
};

describe("payment-token picker", () => {
  it("renders every enabled launch token as a normal choice", () => {
    const symbols = ["USDG", "AMD", "NFLX", "PLTR", "AMZN", "TSLA"] as const;
    const launchTokens = symbols.map((symbol, index) => ({
      chainId: 46_630 as const,
      factory,
      address: getAddress(`0x${(index + 16).toString(16).padStart(40, "0")}`),
      registryIndex: index,
      listed: true,
      enabled: true,
      name: symbol === "USDG" ? "Global Dollar" : symbol,
      symbol,
      decimals: symbol === "USDG" ? 6 : 18,
      scaledUI: symbol !== "USDG",
      uiMultiplier: tokenMultiplierScale,
      newUIMultiplier: tokenMultiplierScale,
      effectiveAt: 0n,
      walletRawBalance: 0n,
      readBlock: 100n,
    }));
    const launchState: AcceptedPaymentTokenReadState = {
      status: "valid",
      capturedBlock: 100n,
      failures: [],
      data: launchTokens,
    };

    render(
      <PaymentTokenPicker
        onRetry={vi.fn()}
        onSelect={vi.fn()}
        selected={launchTokens[0].address}
        state={launchState}
      />,
    );

    expect(screen.getAllByRole("radio")).toHaveLength(6);
    for (const symbol of symbols) {
      expect(
        screen.getByRole("radio", { name: new RegExp(symbol, "i") }),
      ).toBeVisible();
    }
  });

  it("shows enabled held-first choices with live display balances and no address entry", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onRetry = vi.fn();
    render(
      <PaymentTokenPicker
        onRetry={onRetry}
        onSelect={onSelect}
        selected={unheldDollar}
        state={state}
      />,
    );

    const choices = screen.getAllByRole("radio");
    expect(choices).toHaveLength(2);
    expect(choices[0]).toHaveAccessibleName(/AMD.*AMD Stock Token/i);
    expect(choices[1]).toHaveAccessibleName(/USDG.*Global Dollar/i);
    expect(screen.getByText("0.05 AMD")).toBeVisible();
    expect(screen.queryByText("Disabled Token")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(choices[1]).toBeChecked();

    await user.click(choices[0]);
    expect(onSelect).toHaveBeenCalledWith(heldStock);
    expect(
      screen.getByText("One payment token could not be loaded."),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
