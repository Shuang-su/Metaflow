/** Own a shared render session through projection, accumulation and readback. */
export class OperationQueue {
  private tail: Promise<void> = Promise.resolve();
  private pending = 0;
  get busy() {
    return this.pending > 0;
  }
  run<T>(work: () => Promise<T>): Promise<T> {
    this.pending++;
    const result = this.tail.then(work).finally(() => {
      this.pending--;
    });
    this.tail = result.then(
      () => {},
      () => {},
    );
    return result;
  }
  async settled() {
    while (this.busy) await this.tail;
  }
}
