import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
const out = await build({
  entryPoints: ["src/render/device-events.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
});
const { observeFailure } = await import(
  "data:text/javascript;base64," +
    Buffer.from(out.outputFiles[0].text).toString("base64")
);
function fixture() {
  let lose;
  const device = new EventTarget();
  device.lost = new Promise((r) => (lose = r));
  return { device, lose };
}
test("device loss reaches idle render owners immediately and is retained for late observers", async () => {
  const { device, lose } = fixture();
  const first = [],
    second = [];
  const a = observeFailure(device, (e) => first.push(e.message));
  const b = observeFailure(device, (e) => second.push(e.message));
  a();
  lose({ message: "power transition" });
  await Promise.resolve();
  assert.deepEqual(first, []);
  assert.deepEqual(second, ["摄影 GPU 已丢失：power transition"]);
  b();
  const late = [];
  const c = observeFailure(device, (e) => late.push(e.message));
  assert.deepEqual(late, second);
  c();
});
test("disposed owners receive neither delayed loss nor uncaptured GPU errors", async () => {
  const { device, lose } = fixture();
  const errors = [];
  const stop = observeFailure(device, (e) => errors.push(e.message));
  stop();
  const event = new Event("uncapturederror");
  event.error = { message: "validation" };
  device.dispatchEvent(event);
  lose({ message: "destroyed" });
  await Promise.resolve();
  assert.deepEqual(errors, []);
});
