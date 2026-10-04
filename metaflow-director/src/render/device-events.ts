/** A shared GPU has one observer hub. Disposed sessions leave no listener or
 * unresolved device.lost closure retaining their models, UI or frame buffers. */
const failures = new WeakMap<
  object,
  {
    listeners: Set<(e: Error) => void>;
    lost?: Error;
    handler: (e: any) => void;
  }
>();
export function observeFailure(device: any, listener: (e: Error) => void) {
  let hub = failures.get(device);
  if (!hub) {
    const listeners = new Set<(e: Error) => void>();
    hub = {
      listeners,
      handler: (event: any) => {
        const e = new Error(`摄影 GPU 错误：${event.error.message}`);
        listeners.forEach((fn) => fn(e));
      },
    };
    failures.set(device, hub);
    const stable = hub;
    void device.lost.then((info: any) => {
      stable.lost = new Error(`摄影 GPU 已丢失：${info.message}`);
      stable.listeners.forEach((fn) => fn(stable.lost!));
    });
  }
  if (!hub.listeners.size)
    device.addEventListener("uncapturederror", hub.handler);
  hub.listeners.add(listener);
  if (hub.lost) listener(hub.lost);
  const stable = hub;
  return () => {
    stable.listeners.delete(listener);
    if (!stable.listeners.size)
      device.removeEventListener("uncapturederror", stable.handler);
  };
}
const profiles = new WeakMap<
  object,
  {
    original: any;
    wrapper: any;
    listeners: Set<
      (version: number, timings: number[] | null, span?: number) => void
    >;
  }
>();
export function observeProfile(
  profiler: any,
  listener: (version: number, timings: number[] | null, span?: number) => void,
) {
  let hub = profiles.get(profiler);
  if (!hub) {
    const listeners = new Set<typeof listener>(),
      original = profiler.report;
    const wrapper = function (
      version: number,
      timings: number[] | null,
      span?: number,
    ) {
      original.call(profiler, version, timings, span);
      listeners.forEach((fn) => fn(version, timings, span));
    };
    hub = { listeners, original, wrapper };
    profiles.set(profiler, hub);
  }
  profiler.report = hub.wrapper;
  hub.listeners.add(listener);
  const stable = hub;
  return () => {
    stable.listeners.delete(listener);
    if (!stable.listeners.size && profiler.report === stable.wrapper)
      profiler.report = stable.original;
  };
}
