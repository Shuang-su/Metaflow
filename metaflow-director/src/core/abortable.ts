/** Bound codec/muxer waits too; cancellation must not depend on another output packet. */
export function abortable<T>(
  operation: Promise<T>,
  signal: AbortSignal,
  cancel: () => void,
  timeoutMs = 60_000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (error: unknown, value?: T) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      if (error) reject(error);
      else resolve(value as T);
    };
    const onAbort = () => {
      finish(signal.reason ?? new DOMException("Aborted", "AbortError"));
      cancel();
    };
    const timer = setTimeout(() => {
      finish(
        new Error(
          "视频编码器 60 秒内没有完成当前操作。请重试或选择 WebM；未保存未完成文件。",
        ),
      );
      cancel();
    }, timeoutMs);
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
    operation.then(
      (value) => finish(null, value),
      (error) => finish(error),
    );
  });
}
