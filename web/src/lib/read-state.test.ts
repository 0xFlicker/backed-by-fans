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

it("retains the cached snapshot when a refresh returns an RPC failure", async () => {
  const { QueryClient } = await import("@tanstack/react-query");
  const { retainSnapshotOnReadFailure } = await import("./read-state");
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const key = ["refresh-test"];
  const previous = { status: "valid", data: 42n, capturedBlock: 10n } as const;
  cache.setQueryData(key, previous);
  await expect(
    cache.fetchQuery({
      queryKey: key,
      queryFn: () =>
        retainSnapshotOnReadFailure(
          {
            status: "unavailable",
            reason: "rpc-unavailable",
            label: "RPC failed",
          },
          cache.getQueryData<{ status: string }>(key),
        ),
    }),
  ).rejects.toThrow("RPC failed");
  expect(cache.getQueryData(key)).toBe(previous);
  cache.clear();
});

it("does not hide an initial failure or a changed contract identity", async () => {
  const { retainSnapshotOnReadFailure } = await import("./read-state");
  const failure = { status: "unavailable", reason: "rpc-unavailable" };
  expect(retainSnapshotOnReadFailure(failure)).toBe(failure);
  const invalid = { status: "interface-mismatch" };
  expect(retainSnapshotOnReadFailure(invalid, { status: "valid" })).toBe(
    invalid,
  );
});
