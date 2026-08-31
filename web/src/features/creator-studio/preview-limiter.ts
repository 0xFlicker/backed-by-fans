type PreviewOperation<Value> = (signal: AbortSignal) => Promise<Value>;

type PreviewWaiter = {
  signal: AbortSignal;
  resolve: () => void;
  reject: (error: unknown) => void;
  onAbort: () => void;
};

export function createPreviewLimiter({
  maxConcurrent = 2,
  timeoutMs = 15_000,
}: {
  maxConcurrent?: number;
  timeoutMs?: number;
} = {}) {
  let active = 0;
  const waiters: PreviewWaiter[] = [];

  function acquire(signal: AbortSignal): Promise<void> {
    if (signal.aborted) return Promise.reject(signal.reason);
    if (active < maxConcurrent) {
      active += 1;
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      const waiter: PreviewWaiter = {
        signal,
        resolve,
        reject,
        onAbort: () => {
          const index = waiters.indexOf(waiter);
          if (index !== -1) waiters.splice(index, 1);
          reject(signal.reason);
        },
      };
      signal.addEventListener("abort", waiter.onAbort, { once: true });
      waiters.push(waiter);
    });
  }

  function release() {
    active = Math.max(0, active - 1);
    while (waiters.length > 0) {
      const waiter = waiters.shift()!;
      waiter.signal.removeEventListener("abort", waiter.onAbort);
      if (waiter.signal.aborted) continue;
      active += 1;
      waiter.resolve();
      break;
    }
  }

  async function run<Value>(
    operation: PreviewOperation<Value>,
    parentSignal?: AbortSignal,
  ): Promise<Value> {
    const controller = new AbortController();
    const deadlineError = new Error(
      `The contract preview exceeded ${Math.round(timeoutMs / 1_000)} seconds.`,
    );
    const abortFromParent = () => controller.abort(parentSignal?.reason);
    if (parentSignal?.aborted) abortFromParent();
    else
      parentSignal?.addEventListener("abort", abortFromParent, { once: true });
    const timeout = setTimeout(
      () => controller.abort(deadlineError),
      timeoutMs,
    );
    let acquired = false;

    try {
      await acquire(controller.signal);
      acquired = true;
      return await operation(controller.signal);
    } catch (error) {
      if (
        controller.signal.aborted &&
        controller.signal.reason === deadlineError
      ) {
        throw deadlineError;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      parentSignal?.removeEventListener("abort", abortFromParent);
      if (acquired) release();
    }
  }

  return { run };
}

export const previewLimiter = createPreviewLimiter();
