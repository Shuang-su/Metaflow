/** Work budget is a yield boundary, never a query verdict. A generator owns its progress. */
export class CooperativeWork {
  private current: Generator | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  paused = false;
  batches = 0;
  maxBatchMs = 0;
  constructor(
    private error: (error: unknown) => void,
    private now = () => performance.now(),
    private defer: (f: () => void) => ReturnType<typeof setTimeout> = (f) =>
      setTimeout(f, 0),
  ) {}
  get busy() {
    return !!this.current;
  }
  replace(work: Generator | undefined) {
    this.current = work;
    this.schedule();
  }
  setPaused(paused: boolean) {
    this.paused = paused;
    this.schedule();
  }
  private schedule() {
    if (this.timer !== undefined || this.paused || !this.current) return;
    this.timer = this.defer(() => this.batch());
  }
  private batch() {
    this.timer = undefined;
    if (this.paused || !this.current) return;
    const at = this.now();
    try {
      do {
        const task = this.current,
          r = task.next();
        if (r.done && this.current === task) {
          this.current = undefined;
          break;
        }
      } while (this.current && this.now() - at < 12);
    } catch (error) {
      this.current = undefined;
      this.error(error);
    }
    this.batches++;
    this.maxBatchMs = Math.max(this.maxBatchMs, this.now() - at);
    this.schedule();
  }
  dispose() {
    this.current?.return(undefined);
    this.current = undefined;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }
}
