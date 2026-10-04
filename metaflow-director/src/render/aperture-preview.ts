/** Latest-state mailbox. Pose updates never abort an in-flight four-sample batch.
 * Scene identity/cancel does. Timer and callbacks are injectable for regression. */
export class AperturePreview<T> {
  private latest: { state: T; sequence: number; at: number } | null = null;
  private sequence = 0;
  private identity = 0;
  private running = false;
  private wake: (() => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private completion: Promise<void> = Promise.resolve();
  constructor(
    private io: {
      batch: (
        state: T,
        display: boolean,
      ) => Promise<{ count: number; batchMs: number }>;
      target: (state: T) => number;
      count?: (state: T) => number;
      cancel: () => void;
      displayed: (
        state: T,
        count: number,
        info: {
          sequence: number;
          inputAt: number;
          displayAt: number;
          batchMs: number;
        },
      ) => void;
      error: (error: unknown) => void;
      now?: () => number;
    },
  ) {}
  private now() {
    return this.io.now?.() ?? performance.now();
  }
  request(state: T) {
    this.latest = {
      state: structuredClone(state),
      sequence: ++this.sequence,
      at: this.now(),
    };
    this.wake?.();
    if (!this.running) this.completion = this.run();
  }
  cancel() {
    this.identity++;
    this.latest = null;
    this.io.cancel();
    this.wake?.();
  }
  async settled() {
    do {
      await this.completion;
    } while (this.running);
  }
  private async run() {
    this.running = true;
    let active = -1,
      count = 0;
    try {
      while (this.latest) {
        const request = this.latest,
          identity = this.identity,
          target = this.io.target(request.state);
        if (active !== request.sequence) {
          active = request.sequence;
          count = this.io.count?.(request.state) ?? 0;
        }
        if (count >= target) {
          this.latest = null;
          this.io.displayed(request.state, count, {
            sequence: request.sequence,
            inputAt: request.at,
            displayAt: this.now(),
            batchMs: 0,
          });
          continue;
        }
        if (count >= 4) {
          const remaining = 120 - (this.now() - request.at);
          if (remaining > 0) {
            await new Promise<void>((resolve) => {
              const done = () => {
                if (this.timer) clearTimeout(this.timer);
                this.timer = null;
                this.wake = null;
                resolve();
              };
              this.wake = done;
              this.timer = setTimeout(done, remaining);
            });
            continue;
          }
        }
        const next = count + 4,
          display = next === 4 || (next & (next - 1)) === 0 || next === target;
        const result = await this.io.batch(request.state, display);
        if (identity !== this.identity) continue;
        count = result.count;
        // Completed current-scene batches remain useful even with newer input.
        if (display)
          this.io.displayed(request.state, count, {
            sequence: request.sequence,
            inputAt: request.at,
            displayAt: this.now(),
            batchMs: result.batchMs,
          });
        if (this.latest?.sequence === request.sequence && count >= target)
          this.latest = null;
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    } catch (e) {
      if ((e as any)?.name !== "AbortError") {
        this.latest = null;
        this.io.error(e);
      }
    } finally {
      this.running = false;
      // A new scene request may have arrived while a cancelled batch unwound.
      if (this.latest) this.completion = this.run();
    }
  }
}
