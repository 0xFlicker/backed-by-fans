/** Runs one expensive task at a time and retains only the newest pending input. */
export class LatestTaskQueue<Input> {
  private active = false;
  private pending:
    { input: Input; runTask: (input: Input) => Promise<void> } | undefined;

  enqueue(input: Input, runTask: (input: Input) => Promise<void>) {
    this.pending = { input, runTask };
    void this.drain();
  }

  clear() {
    this.pending = undefined;
  }

  private async drain() {
    if (this.active) return;
    this.active = true;
    try {
      while (this.pending !== undefined) {
        const { input, runTask } = this.pending;
        this.pending = undefined;
        await runTask(input);
      }
    } finally {
      this.active = false;
      if (this.pending !== undefined) void this.drain();
    }
  }
}
