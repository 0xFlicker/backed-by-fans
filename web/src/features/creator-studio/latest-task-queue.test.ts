import { describe, expect, it } from "vitest";

import { LatestTaskQueue } from "@/features/creator-studio/latest-task-queue";

describe("latest expensive task queue", () => {
  it("serializes work and coalesces pending edits to the latest input", async () => {
    const started: number[] = [];
    const completed: number[] = [];
    const releases: (() => void)[] = [];
    let active = 0;
    let maximumActive = 0;
    const queue = new LatestTaskQueue<number>();
    const runTask = async (value: number) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      started.push(value);
      await new Promise<void>((resolve) => releases.push(resolve));
      completed.push(value);
      active -= 1;
    };

    queue.enqueue(1, runTask);
    queue.enqueue(2, runTask);
    queue.enqueue(3, runTask);
    await Promise.resolve();
    expect(started).toEqual([1]);

    releases.shift()?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(started).toEqual([1, 3]);
    releases.shift()?.();
    await Promise.resolve();

    expect(completed).toEqual([1, 3]);
    expect(maximumActive).toBe(1);
  });

  it("drops pending work when its owner is cleared", async () => {
    let release!: () => void;
    const started: number[] = [];
    const queue = new LatestTaskQueue<number>();
    const runTask = async (value: number) => {
      started.push(value);
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    };

    queue.enqueue(1, runTask);
    queue.enqueue(2, runTask);
    queue.clear();
    await Promise.resolve();
    release();
    await Promise.resolve();
    expect(started).toEqual([1]);
  });
});
