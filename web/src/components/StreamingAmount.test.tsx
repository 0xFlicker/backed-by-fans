import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StreamingAmount } from "./StreamingAmount";
import { ACCOUNTING_SCALE as Q } from "@/lib/streaming-amount";
const stream = {
  raw: 10n,
  fractional: 0n,
  rate: Q,
  asOf: 100n,
  nextBoundary: 0n,
  complete: true,
};
const format = (n: bigint) => `${n} ETH`;
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
const visible = (container: HTMLElement) =>
  container.querySelector('[aria-hidden="true"]')?.textContent;
it("streams digits while the accessible amount stays pinned", () => {
  const { container } = render(
    <StreamingAmount
      identity="wallet:a"
      streams={[stream]}
      format={format}
      refresh={() => {}}
    />,
  );
  act(() => vi.advanceTimersByTime(2100));
  expect(visible(container)).toBe("12 ETH");
  expect(container.querySelector(".sr-only")?.textContent).toBe("10 ETH");
});
it("does not reset the stale cutoff when the same block is read again", () => {
  const { container, rerender } = render(
    <StreamingAmount
      identity="a"
      streams={[stream]}
      format={format}
      refresh={() => {}}
    />,
  );
  act(() => vi.advanceTimersByTime(20000));
  rerender(
    <StreamingAmount
      identity="a"
      streams={[{ ...stream }]}
      format={format}
      refresh={() => {}}
    />,
  );
  act(() => vi.advanceTimersByTime(20000));
  expect(visible(container)).toBe("40 ETH");
});
it("repins downward and resets when identity changes", () => {
  const { container, rerender } = render(
    <StreamingAmount
      identity="a"
      streams={[stream]}
      format={format}
      refresh={() => {}}
    />,
  );
  act(() => vi.advanceTimersByTime(5000));
  rerender(
    <StreamingAmount
      identity="b"
      streams={[{ ...stream, raw: 0n }]}
      format={format}
      refresh={() => {}}
    />,
  );
  expect(visible(container)).toBe("0 ETH");
  rerender(
    <StreamingAmount
      identity="b"
      streams={[{ ...stream, raw: 1n, asOf: 110n }]}
      format={format}
      refresh={() => {}}
    />,
  );
  expect(visible(container)).toBe("1 ETH");
});
it("freezes each aggregate contribution at its own boundary and refreshes once", () => {
  const refresh = vi.fn();
  const { container } = render(
    <StreamingAmount
      identity="a"
      streams={[{ ...stream, nextBoundary: 102n }, stream]}
      format={format}
      refresh={refresh}
    />,
  );
  act(() => vi.advanceTimersByTime(5000));
  expect(visible(container)).toBe("27 ETH");
  expect(refresh).toHaveBeenCalledTimes(1);
});
it("shares one timer and releases it on unmount", () => {
  const { unmount } = render(
    <>
      <StreamingAmount
        identity="a"
        streams={[stream]}
        format={format}
        refresh={() => {}}
      />
      <StreamingAmount
        identity="b"
        streams={[stream]}
        format={format}
        refresh={() => {}}
      />
    </>,
  );
  expect(vi.getTimerCount()).toBe(1);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
it("pauses the shared clock while hidden and refreshes on return", () => {
  let hidden = false;
  const property = vi
    .spyOn(document, "hidden", "get")
    .mockImplementation(() => hidden);
  const refresh = vi.fn();
  render(
    <StreamingAmount
      identity="a"
      streams={[stream]}
      format={format}
      refresh={refresh}
    />,
  );
  act(() => {
    hidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(vi.getTimerCount()).toBe(0);
  act(() => vi.advanceTimersByTime(60000));
  act(() => {
    hidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(refresh).toHaveBeenCalledTimes(1);
  property.mockRestore();
});
it("keeps leading digits mounted when fractional precision changes", () => {
  const props = { identity: "a", streams: [stream], refresh: () => {} };
  const { container, rerender } = render(
    <StreamingAmount {...props} format={() => "0.00000999 ETH"} />,
  );
  const before = [...container.querySelectorAll(".streaming-digit")];
  rerender(<StreamingAmount {...props} format={() => "0.00001 ETH"} />);
  const after = [...container.querySelectorAll(".streaming-digit")];
  expect(visible(container)).toBe("0.0000100 ETH");
  expect(after[0]).toBe(before[0]);
  expect(after[1]).toBe(before[1]);
  expect(after[0].querySelector(".streaming-digit-roll")).toBeNull();
  expect(after[1].querySelector(".streaming-digit-roll")).toBeNull();
  expect(after.at(-1)?.querySelector(".streaming-digit-roll")).not.toBeNull();
});
