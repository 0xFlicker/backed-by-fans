import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { PeriodSelector } from "./PeriodSelector";
function Example() {
  const [value, onChange] = useState("1");
  return (
    <PeriodSelector
      value={value}
      onChange={onChange}
      periodDuration={30n}
      maxPrepaidPeriods={2n}
      paidSeconds={29n}
      periodLabel="30 days"
      priceLabel="0.1 WETH"
      summary={`${value} selected`}
    />
  );
}
describe("PeriodSelector", () => {
  it("supports typing and arrow keys while bounding step buttons by paid-time capacity", () => {
    render(<Example />);
    const input = screen.getByLabelText("Periods");
    expect(
      screen.getByRole("button", { name: "Decrease periods" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Increase periods" }));
    expect(input).toHaveValue("2");
    expect(
      screen.getByRole("button", { name: "Increase periods" }),
    ).toBeDisabled();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveValue("1");
    fireEvent.change(input, { target: { value: "99" } });
    expect(input).toHaveAttribute("aria-invalid", "true");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Increase periods" }));
    expect(input).toHaveValue("1");
  });
});
