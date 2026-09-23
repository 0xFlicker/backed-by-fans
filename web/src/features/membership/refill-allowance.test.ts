import { describe, expect, it, vi } from "vitest";
import {
  applyRefillAllowance,
  refillAllowanceAmount,
  refillAllowanceSteps,
} from "./refill-allowance";

describe("refill allowance actions", () => {
  it("requires an explicit finite or unlimited choice", () => {
    expect(() => refillAllowanceAmount("", "2", 20n)).toThrow(/Choose/);
    expect(refillAllowanceAmount("finite", "2", 20n)).toBe(40n);
    expect(refillAllowanceAmount("unlimited", "", 20n)).toBe((1n << 256n) - 1n);
    expect(() => refillAllowanceAmount("finite", "2.5", 20n)).toThrow(/whole/);
    expect(() => refillAllowanceAmount("finite", "0", 20n)).toThrow();
    expect(() =>
      refillAllowanceAmount("finite", (1n << 256n).toString(), 20n),
    ).toThrow();
  });
  it("resets a nonzero allowance before setting another nonzero amount", () => {
    expect(refillAllowanceSteps(40n, 60n)).toEqual([0n, 60n]);
    expect(refillAllowanceSteps(40n, 20n)).toEqual([0n, 20n]);
    expect(refillAllowanceSteps(40n, 0n)).toEqual([0n]);
    expect(refillAllowanceSteps(0n, 20n)).toEqual([20n]);
    expect(refillAllowanceSteps(20n, 20n)).toEqual([]);
  });
  it("uses the supplied wallet action sequentially and stops after a failed reset", async () => {
    const write = vi.fn().mockResolvedValueOnce(false);
    expect(await applyRefillAllowance(40n, 60n, write)).toBe(false);
    expect(write.mock.calls).toEqual([[0n]]);
  });
  it("confirms reset and set independently, without changing enrollment", async () => {
    const write = vi.fn().mockResolvedValue(true);
    expect(await applyRefillAllowance(40n, 60n, write)).toBe(true);
    expect(write.mock.calls).toEqual([[0n], [60n]]);
    expect(await applyRefillAllowance(60n, 0n, write)).toBe(true);
  });
  it("propagates exceptional approval failure instead of reporting success", async () => {
    await expect(
      applyRefillAllowance(0n, 20n, async () => {
        throw new Error("Wallet rejected");
      }),
    ).rejects.toThrow("Wallet rejected");
  });
});
