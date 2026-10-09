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
const { viewPose, thumbnailKey, thumbnailSize } = await source(
  "src/core/view-state.ts",
);
const { timelineLayout } = await source("src/core/timeline-layout.ts");
const { PROJECTED_KERNEL_VARIANCE } = await source("src/render/optics.ts");
test("inserting and removing camera positions preserves views and evenly timed endpoints", () => {
  const shot = model.makeShot("resource", model.DEFAULT_POSE);
  shot.duration = 3;
  shot.keys[1].time = 3;
  shot.keys[0].pose.yaw = 10;
  shot.keys[1].pose.yaw = 50;
  const before = structuredClone(shot);
  const middle = model.insertCameraPosition(shot, 0);
  assert.deepEqual(shot, before);
  assert.deepEqual(
    middle.shot.keys.map((k) => k.time),
    [0, 1.5, 3],
  );
  assert.deepEqual(
    middle.shot.keys.map((k) => k.pose.yaw),
    [10, 30, 50],
  );
  assert.equal(middle.time, 1.5);
  const end = model.insertCameraPosition(shot, 3, {
    ...shot.keys[1].pose,
    yaw: 80,
  });
  assert.deepEqual(
    end.shot.keys.map((k) => k.pose.yaw),
    [10, 80, 80],
  );
  assert.equal(end.time, 3);
  assert.equal(end.shot.keys[0].id, shot.keys[0].id);
  assert.equal(end.shot.keys[1].id, shot.keys[1].id);
  for (const t of [0, 1.5, 3]) {
    const removed = model.removeCameraPosition(middle.shot, t);
    assert.deepEqual(
      removed.shot.keys.map((k) => k.time),
      [0, 3],
    );
    assert.equal(removed.shot.keys.length, 2);
  }
  assert.deepEqual(model.removeCameraPosition(shot, 0).shot, shot);
});
test("fast aperture calibration matches the measured moment of the pinned radial profile", () => {
  // Independent numerical integration of the rendered profile, not its formula.
  const steps = 100000;
  let mass = 0,
    radialMoment = 0;
  for (let i = 0; i < steps; i++) {
    const r = (i + 0.5) / steps;
    const density = (Math.exp(-4 * r * r) - Math.exp(-4)) / (1 - Math.exp(-4));
    mass += r * density;
    radialMoment += r * r * r * density;
  }
  // One axis contributes half the radial moment; projected axes are sqrt(8λ).
  const measured = (4 * radialMoment) / mass;
  assert(Math.abs(measured - PROJECTED_KERNEL_VARIANCE) < 1e-9);
  for (const radius of [0.001, 0.1, 1, 100, 10000]) {
    const covariance = (radius * radius) / (4 * PROJECTED_KERNEL_VARIANCE);
    assert(
      Math.abs((covariance * measured) / ((radius * radius) / 4) - 1) < 1e-9,
    );
  }
});
test("filmstrip layout matches observed desktop and compact origins and preserves short clip seeking", () => {
  const shot = model.makeShot("resource", model.DEFAULT_POSE);
  shot.duration = 3;
  shot.keys[1].time = 3;
  const desktop = timelineLayout([shot], 1280);
  assert.equal(desktop.clips[0].left, 52);
  assert.equal(desktop.position(0), 33);
  assert(Math.abs(desktop.position(3) - (52 + 258.42857 + 19)) < 0.01);
  assert(desktop.position(14) > desktop.position(6));
  assert(Math.abs(desktop.clips[0].width - 258.42857) < 0.01);
  const compact = timelineLayout([shot], 390);
  assert.equal(compact.clips[0].left, 38);
  assert.equal(compact.position(0), 19);
  const short = model.resizeShot(shot, 0.25),
    second = structuredClone(short);
  second.id = "second";
  const layout = timelineLayout([short, second], 390);
  assert.equal(layout.clips[0].width, 40);
  assert.equal(layout.clips[1].left, 118);
  for (const clip of layout.clips) {
    for (const fraction of [0, 0.2, 0.5, 0.8, 1]) {
      const time = clip.start + fraction * clip.shot.duration;
      assert(
        Math.abs(layout.timeAt(layout.position(time, clip.shot.id)) - time) <
          1e-10,
      );
    }
  }
});
test("controls resolve the displayed timeline and temporary camera without rewriting saved positions", () => {
  const project = model.createProject();
  const shot = model.makeShot("resource", model.DEFAULT_POSE);
  shot.duration = 1;
  shot.keys[1].time = 1;
  shot.keys[1].pose.yaw = 40;
  shot.keys[1].pose.focus = 8;
  project.shots = [shot];
  const saved = structuredClone(project);
  const working = { ...model.DEFAULT_POSE, yaw: -20 };
  assert.equal(
    viewPose(working, project, 0.5, true).yaw,
    model.poseAt(shot, 0.5).yaw,
  );
  assert.equal(viewPose(working, project, 0.5, false), working);
  const flat = { ...working, yaw: 0, dof: false };
  assert.equal(viewPose(working, project, 0.5, true, flat), flat);
  const editing = structuredClone(viewPose(working, project, 0.5, true));
  editing.roll = 25;
  assert.deepEqual(project, saved);
});
test("thumbnail identity changes with camera and crop and fits horizontal and portrait renders", () => {
  const project = model.createProject();
  const key = model.makeShot("resource", model.DEFAULT_POSE).keys[0];
  const before = thumbnailKey(project, key);
  project.aspect = "9:16";
  assert.notEqual(thumbnailKey(project, key), before);
  const portrait = thumbnailSize(project.aspect);
  assert(portrait[0] < portrait[1]);
  assert(Math.abs(portrait[0] / portrait[1] - 9 / 16) < 0.02);
  assert.deepEqual(thumbnailSize("16:9"), [160, 90]);
  const changed = structuredClone(key);
  changed.pose.focus *= 2;
  assert.notEqual(thumbnailKey(project, changed), thumbnailKey(project, key));
});
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

const { isSelectionView } = await source("src/render/selection-view.ts");
test("re-entered interest selection rejects old flat batches and closes on a working view", async () => {
  const flat = structuredClone(model.DEFAULT_POSE),
    working = { ...flat, yaw: 30 },
    size = [960, 540],
    events = [];
  let releaseOld,
    ready = false;
  const scheduler = new AperturePreview({
    target: () => 4,
    count: () => 0,
    batch: async (s) => {
      if (s.viewRevision === 1) await new Promise((r) => (releaseOld = r));
      return { count: 4, batchMs: 1 };
    },
    cancel() {},
    displayed: (s) => {
      ready = isSelectionView(s, flat, 2, size);
      events.push([s.viewRevision, s.pose.yaw, ready]);
    },
    error: (e) => {
      throw e;
    },
  });
  const frame = (pose, viewRevision) => ({
    pose,
    viewRevision,
    width: 960,
    height: 540,
    video: false,
  });
  scheduler.request(frame(flat, 1)); // Exit/re-enter while the old GPU batch runs.
  scheduler.request(frame(working, 2));
  releaseOld();
  await scheduler.settled();
  assert.deepEqual(events, [
    [1, flat.yaw, false],
    [2, 30, false],
  ]);
  scheduler.request(frame(flat, 2));
  await scheduler.settled();
  assert.equal(ready, true);
  scheduler.request(frame(working, 2));
  await scheduler.settled();
  assert.equal(
    ready,
    false,
    "a later different displayed camera must close picking",
  );
  assert.equal(
    isSelectionView({ ...frame(flat, 2), width: 540 }, flat, 2, size),
    false,
  );
});
