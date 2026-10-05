import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
async function source(entry) {
  const out = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
  });
  return import(
    "data:text/javascript;base64," +
      Buffer.from(out.outputFiles[0].text).toString("base64")
  );
}
const model = await source("src/core/model.ts"),
  control = await source("src/core/camera-controls.ts"),
  { AperturePreview } = await source("src/render/aperture-preview.ts");
const { FrameCache } = await source("src/render/frame-cache.ts");
test("frame cache bounds bytes and two entries, honors recent reuse and releases all GPU owners", () => {
  const freed = [],
    cache = new FrameCache(32, (v) => freed.push(v));
  cache.set("a", "a", 12);
  cache.set("b", "b", 12);
  assert.equal(cache.get("a"), "a");
  cache.set("c", "c", 12);
  assert.equal(cache.get("b"), null);
  assert.deepEqual(freed, ["b"]);
  cache.set("oversize", "too-big", 40);
  assert.equal(cache.get("oversize"), null);
  cache.clear();
  assert.deepEqual(freed, ["b", "too-big", "a", "c"]);
});
test("handoff preserves position/target without changing Director projection or aperture", () => {
  const initial = { position: [-2, 1, 5], target: [1, 0.25, -1] },
    p = model.poseFromCamera(initial, model.DEFAULT_POSE);
  const a = (p.yaw * Math.PI) / 180,
    b = (p.pitch * Math.PI) / 180;
  const position = [
    Math.sin(a) * Math.cos(b),
    Math.sin(b),
    Math.cos(a) * Math.cos(b),
  ].map((v, i) => p.target[i] + v * p.distance);
  initial.position.forEach((n, i) => assert(Math.abs(n - position[i]) < 1e-10));
  assert.equal(p.fov, model.DEFAULT_POSE.fov);
  assert.deepEqual(p.optics, model.DEFAULT_POSE.optics);
});
test("infinity focus and control changes do not recalibrate aperture", () => {
  const p = structuredClone(model.DEFAULT_POSE),
    q = { ...p, ...control.manualFocusPatch(p, 100) };
  assert(q.focusInfinity);
  assert.equal(q.focusPoint, null);
  assert.equal(q.optics.apertureScale, p.optics.apertureScale);
  const auto = control.changeControls(q, { focusMode: "auto" });
  assert.equal(auto.focusInfinity, false);
  assert.equal(auto.focus, auto.distance);
  assert.deepEqual(auto.optics, q.optics);
  const zoom = control.changeControls(p, { zoom: 500 });
  assert(zoom.fov < p.fov);
  assert.deepEqual(zoom.optics, p.optics);
});
test("timeline uses real dynamic keyframes, overlap and exact N/fps frame count", () => {
  const a = model.makeShot("same-scene", model.DEFAULT_POSE);
  a.duration = 1;
  a.keys[1].time = 1;
  a.keys[1].pose.yaw = 45;
  const b = structuredClone(a);
  b.id = "other";
  b.transition = { kind: "fade", duration: 0.25 };
  assert.equal(model.totalDuration([a, b]), 1.75);
  assert.equal(model.frameCount(1.75, 30), 53);
  const s = model.evaluate([a, b], 0.875);
  assert.equal(s.blend, 0.5);
  assert(s.previousPose.yaw > 0);
  assert.notEqual(model.poseAt(a, 0).yaw, model.poseAt(a, 0.5).yaw);
  for (const aspect of ["16:9", "9:16", "4:3", "4:5", "1:1"]) {
    const [w, h] = model.outputSize(aspect, 1080),
      [a, b] = aspect.split(":").map(Number);
    assert(Math.abs(w / h - a / b) < 0.002);
    assert.equal(w % 2, 0);
    assert.equal(h % 2, 0);
  }
});
test("continuous updates show completed batches and eventually the latest final state", async () => {
  let release;
  const seen = [];
  let count = 0,
    active = null,
    calls = 0;
  const scheduler = new AperturePreview({
    batch: async (s) => {
      if (active !== s) {
        active = s;
        count = 0;
      }
      if (calls++ === 0) await new Promise((r) => (release = r));
      count += 4;
      return { count, batchMs: 1 };
    },
    target: () => 8,
    count: () => 0,
    cancel() {},
    displayed: (s, n) => seen.push([s, n]),
    error: (e) => {
      throw e;
    },
  });
  scheduler.request("a");
  scheduler.request("b");
  release();
  await scheduler.settled();
  assert(seen.some(([s, n]) => s === "a" && n === 4));
  assert.deepEqual(seen.at(-1), ["b", 8]);
});

const { abortable } = await source("src/core/abortable.ts");
test("cancel interrupts a codec which never emits another packet", async () => {
  const controller = new AbortController();
  let closed = 0;
  const job = abortable(
    new Promise(() => {}),
    controller.signal,
    () => closed++,
  );
  controller.abort();
  await assert.rejects(job, { name: "AbortError" });
  assert.equal(closed, 1);
});
test("a stalled codec fails with an explicit timeout and releases its resources", async () => {
  let closed = 0;
  await assert.rejects(
    abortable(
      new Promise(() => {}),
      new AbortController().signal,
      () => closed++,
      5,
    ),
    /视频编码器/,
  );
  assert.equal(closed, 1);
});

test("shot drops insert before the target in both directions without losing keys", () => {
  const make = () =>
    ["a", "b", "c", "d"].map((id) => ({ id, keys: [{ id: id + "-key" }] }));
  const forward = make();
  model.moveShotBefore(forward, "a", "d");
  assert.deepEqual(
    forward.map((s) => s.id),
    ["b", "c", "a", "d"],
  );
  assert.equal(forward[2].keys[0].id, "a-key");
  model.moveShotBefore(forward, "d", "b");
  assert.deepEqual(
    forward.map((s) => s.id),
    ["d", "b", "c", "a"],
  );
  const copy = structuredClone(forward);
  model.moveShotBefore(forward, "missing", "a");
  model.moveShotBefore(forward, "a", "missing");
  model.moveShotBefore(forward, "c", "c");
  assert.deepEqual(forward, copy);
});
