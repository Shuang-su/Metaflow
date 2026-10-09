export const DEVICE_SLOW_MS = 20_000;
export const DEVICE_DEADLINE_MS = 90_000;

export type DeviceStartup = {
  signal?: AbortSignal;
  onSlow?: () => void;
};

/** A slow adapter remains eligible; abandoned requests must never retain a GPU. */
export function waitForGraphicsDevice<T extends { destroy(): void }>(
  creating: Promise<T>,
  options: DeviceStartup = {},
): Promise<T> {
  return new Promise((resolve, reject) => {
    let pending = true;
    const cleanup = () => {
      clearTimeout(slow);
      clearTimeout(deadline);
      options.signal?.removeEventListener("abort", abort);
    };
    const fail = (error: unknown) => {
      if (!pending) return;
      pending = false;
      cleanup();
      reject(error);
    };
    const abort = () =>
      fail(
        options.signal?.reason ?? new DOMException("已取消启动", "AbortError"),
      );
    const slow = setTimeout(() => {
      if (pending) options.onSlow?.();
    }, DEVICE_SLOW_MS);
    const deadline = setTimeout(
      () =>
        fail(
          new Error(
            "浏览器的 WebGPU 图形设备持续未响应（90 秒）。可重新尝试，或返回 Viewer。",
          ),
        ),
      DEVICE_DEADLINE_MS,
    );
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
    creating.then((device) => {
      if (!pending) {
        device.destroy();
        return;
      }
      pending = false;
      cleanup();
      resolve(device);
    }, fail);
  });
}
