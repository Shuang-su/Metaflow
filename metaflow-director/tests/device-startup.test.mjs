import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
const out = await build({
  entryPoints: ["src/render/device-startup.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
});
const { waitForGraphicsDevice, DEVICE_SLOW_MS, DEVICE_DEADLINE_MS } =
  await import(
    "data:text/javascript;base64," +
      Buffer.from(out.outputFiles[0].text).toString("base64")
  );
function pendingDevice() {
  let resolve, reject;
  const creating = new Promise((r, j) => {
    resolve = r;
    reject = j;
  });
  const device = {
    destroyed: 0,
    destroy() {
      this.destroyed++;
    },
  };
  return { creating, resolve, reject, device };
}
test("slow startup is advisory and the same late device can still be adopted", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = pendingDevice();
  let slow = 0;
  const waiting = waitForGraphicsDevice(f.creating, { onSlow: () => slow++ });
  t.mock.timers.tick(DEVICE_SLOW_MS);
  assert.equal(slow, 1);
  f.resolve(f.device);
  assert.equal(await waiting, f.device);
  t.mock.timers.tick(DEVICE_DEADLINE_MS);
  assert.equal(slow, 1);
  assert.equal(f.device.destroyed, 0);
});
test("an abandoned slow request releases its late device and cannot call the old UI", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = pendingDevice(),
    controller = new AbortController();
  let slow = 0;
  const waiting = waitForGraphicsDevice(f.creating, {
    signal: controller.signal,
    onSlow: () => slow++,
  });
  controller.abort();
  await assert.rejects(waiting, { name: "AbortError" });
  f.resolve(f.device);
  await Promise.resolve();
  t.mock.timers.tick(DEVICE_DEADLINE_MS);
  assert.equal(slow, 0);
  assert.equal(f.device.destroyed, 1);
});
test("a persistent graphics stall terminates once and releases any eventual device", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = pendingDevice();
  const waiting = waitForGraphicsDevice(f.creating);
  t.mock.timers.tick(DEVICE_DEADLINE_MS);
  await assert.rejects(waiting, /90 秒/);
  f.resolve(f.device);
  await Promise.resolve();
  assert.equal(f.device.destroyed, 1);
});
test("a failed creation keeps its actual capability error and clears both timers", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = pendingDevice(),
    error = new Error("adapter unavailable");
  let slow = 0;
  const waiting = waitForGraphicsDevice(f.creating, { onSlow: () => slow++ });
  f.reject(error);
  await assert.rejects(waiting, (e) => e === error);
  t.mock.timers.tick(DEVICE_DEADLINE_MS);
  assert.equal(slow, 0);
});
test("cancelling after adoption does not destroy a device now owned by the runtime", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = pendingDevice(),
    controller = new AbortController();
  const waiting = waitForGraphicsDevice(f.creating, {
    signal: controller.signal,
  });
  f.resolve(f.device);
  await waiting;
  controller.abort();
  assert.equal(f.device.destroyed, 0);
});
test("an already cancelled request rejects and destroys its late result", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = pendingDevice(),
    controller = new AbortController();
  controller.abort();
  const waiting = waitForGraphicsDevice(f.creating, {
    signal: controller.signal,
  });
  await assert.rejects(waiting, { name: "AbortError" });
  f.resolve(f.device);
  await Promise.resolve();
  assert.equal(f.device.destroyed, 1);
});
