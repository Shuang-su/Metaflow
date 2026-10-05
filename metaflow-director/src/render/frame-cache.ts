/** Retain only complete frames. A resource runtime owns this bounded GPU cache. */
export class FrameCache<T> {
  private entries = new Map<string, { value: T; bytes: number }>();
  private bytes = 0;
  constructor(
    private budget: number,
    private release: (value: T) => void,
  ) {}
  get(key: string) {
    const entry = this.entries.get(key);
    if (!entry) return null;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }
  set(key: string, value: T, bytes: number) {
    const old = this.entries.get(key);
    if (old) {
      this.bytes -= old.bytes;
      this.release(old.value);
      this.entries.delete(key);
    }
    if (bytes > this.budget) {
      this.release(value);
      return;
    }
    this.entries.set(key, { value, bytes });
    this.bytes += bytes;
    while (this.entries.size > 2 || this.bytes > this.budget) {
      const first = this.entries.entries().next().value!;
      this.entries.delete(first[0]);
      this.bytes -= first[1].bytes;
      this.release(first[1].value);
    }
  }
  clear() {
    for (const entry of this.entries.values()) this.release(entry.value);
    this.entries.clear();
    this.bytes = 0;
  }
}
