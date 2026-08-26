import { describe, expect, it } from "vitest";

import { classifyReadError, isFreshValidState } from "@/lib/read-state";

describe("read state", () => {
  it.each(["HTTP 429", "rate limit exceeded", "Too Many Requests"])(
    "classifies %s as rate-limited",
    (message) => {
      expect(classifyReadError(new Error(message))).toMatchObject({
        status: "rate-limited",
      });
    },
  );

  it("never maps an RPC failure to a value", () => {
    expect(classifyReadError(new Error("network unreachable"))).toEqual({
      status: "unavailable",
      label:
        "Onchain state is unavailable. No balance or membership value was assumed.",
    });
  });

  it("accepts only a fresh valid state as write-ready read data", () => {
    expect(
      isFreshValidState({ status: "valid", data: 4n, capturedBlock: 10n }),
    ).toBe(true);
    expect(
      isFreshValidState({
        status: "stale",
        data: 4n,
        capturedBlock: 10n,
        latestBlock: 40n,
        label: "stale",
      }),
    ).toBe(false);
  });
});
