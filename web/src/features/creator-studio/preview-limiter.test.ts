import { describe, expect, it, vi } from "vitest";

import { createPreviewLimiter } from "@/features/creator-studio/preview-limiter";

function waitUntilAborted(signal: AbortSignal, started: () => void) {
  started();
  return new Promise<never>((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), {
      once: true,
    });
  });
}

describe("contract preview limiter", () => {
  it("includes queue time in the deadline and releases timed-out slots", async () => {
    vi.useFakeTimers();
    const limiter = createPreviewLimiter({
      maxConcurrent: 2,
      timeoutMs: 1_000,
    });
    let started = 0;
    const hanging = () =>
      limiter.run((signal) =>
        waitUntilAborted(signal, () => {
          started += 1;
        }),
      );

    const first = hanging();
    const second = hanging();
    const queued = hanging();
    const settled = Promise.allSettled([first, second, queued]);
    await vi.advanceTimersByTimeAsync(0);
    expect(started).toBe(2);

    await vi.advanceTimersByTimeAsync(1_000);
    const results = await settled;
    expect(results).toHaveLength(3);
    for (const result of results) {
      expect(result.status).toBe("rejected");
      if (result.status === "rejected") {
        expect(result.reason).toEqual(
          expect.objectContaining({
            message: expect.stringMatching(/exceeded 1 seconds/i),
          }),
        );
      }
    }

    const recovered = limiter.run(async () => "ready");
    await expect(recovered).resolves.toBe("ready");
    vi.useRealTimers();
  });

  it("cancels a queued preview without consuming a slot", async () => {
    const limiter = createPreviewLimiter({
      maxConcurrent: 1,
      timeoutMs: 1_000,
    });
    let releaseFirst!: () => void;
    const first = limiter.run(
      () =>
        new Promise<void>((resolve) => {
          releaseFirst = resolve;
        }),
    );
    await Promise.resolve();
    const controller = new AbortController();
    let queuedStarted = false;
    const queued = limiter.run(async () => {
      queuedStarted = true;
    }, controller.signal);
    controller.abort(new Error("preview changed"));

    await expect(queued).rejects.toThrow("preview changed");
    expect(queuedStarted).toBe(false);
    releaseFirst();
    await first;
  });
});
