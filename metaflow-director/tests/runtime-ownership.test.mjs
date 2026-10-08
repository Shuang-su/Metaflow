import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
const out = await build({
  entryPoints: ["src/render/runtime.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  plugins: [
    {
      name: "headless-gpu-boundary",
      setup(b) {
        b.onResolve(
          { filter: /^\.\/(session|gpu-compositor|float-image)$/ },
          (args) => ({
            path: args.path,
            namespace: "mock",
          }),
        );
        b.onLoad({ filter: /.*/, namespace: "mock" }, (args) => ({
          contents: args.path.endsWith("session")
            ? "export class CandidateSession { static attach(scene) { return scene; } }"
            : args.path.endsWith("float-image")
              ? "export class FloatImage { texture={}; copy(){} destroy(){} }"
              : "export class SharedGpuCompositor { texture={}; upload(){} present(){} presentTexture(){this.restored=true;} destroy(){} snapshot(){return this.result;} }",
          loader: "js",
        }));
      },
    },
  ],
});
const { ResourceRuntime, isFastPreview } = await import(
  "data:text/javascript;base64," +
    Buffer.from(out.outputFiles[0].text).toString("base64")
);
function fixture(afterFirstBatch) {
  const prior = globalThis.document;
  globalThis.document = {
    createElement: () => ({ getContext: () => ({ fillRect() {} }) }),
  };
  let serial = Promise.resolve(),
    value = null,
    count = 0,
    batches = 0;
  const primary = {
    background: "#000000",
    device: { frameStart() {}, frameEnd() {}, submit() {} },
    scene: null,
    settled: () => serial,
    cancel() {
      count = 0;
      value = null;
    },
    advance(p, w, h, n) {
      const task = serial.then(async () => {
        await new Promise((r) => setTimeout(r, 2));
        if (value?.id !== p.id || value?.dof !== p.dof) {
          count = 0;
        }
        value = { id: p.id, w, h, dof: p.dof };
        count += n;
        if (batches++ === 0) afterFirstBatch?.();
      });
      serial = task.catch(() => {});
      return task;
    },
    apertureCount(p) {
      return value?.id === p.id && value?.dof === p.dof ? count : 0;
    },
    async previewFrame(p, w, h) {
      value = { id: p.id, w, h, dof: p.dof };
      count = 0;
      return { kind: "fast", id: p.id };
    },
    async peakingMask() {
      return { kind: "guide" };
    },
    async dispose() {},
    async pick() {
      return value;
    },
  };
  primary.scene = primary;
  const rt = new ResourceRuntime(
    primary,
    () => {},
    (e) => {
      throw e;
    },
  );
  globalThis.document = prior;
  rt.compose = async (s, gpu) => {
    assert.equal(
      value.id,
      s.pose.id,
      "capture must own the camera until composition",
    );
    assert.equal(
      value.w,
      s.width,
      "thumbnail/export dimensions must never mix",
    );
    if (gpu === rt.output)
      assert.equal(count, s.samples, "all samples must belong to this capture");
    const { dof, ...delivered } = value;
    gpu.result = { ...delivered, count };
  };
  const state = (id, samples, width) => ({
    pose: { id },
    project: { shots: [{}] },
    time: 0,
    video: false,
    width,
    height: width / 2,
    samples,
    playing: false,
  });
  return { rt, state };
}
test("completed original/composed previews restore without another aperture batch; changed state misses", async () => {
  const { rt, state } = fixture();
  const s = state("working", 8, 640);
  s.pose.dof = true;
  rt.request(s);
  await rt.scheduler.settled();
  rt.request({ ...s, original: true });
  await rt.scheduler.settled();
  const batches = rt.metrics.batches;
  rt.request(s);
  await rt.scheduler.settled();
  assert.equal(rt.metrics.batches, batches);
  assert.equal(rt.metrics.cacheHits, 1);
  assert.equal(rt.preview.restored, true);
  rt.request({ ...s, pose: { ...s.pose, id: "new-camera" } });
  await rt.scheduler.settled();
  assert(rt.metrics.batches > batches);
  await rt.dispose();
});
test("lowering the preview target rebuilds its exact sample prefix and retains both cached targets", async () => {
  const { rt, state } = fixture();
  const high = state("working", 16, 640);
  rt.request(high);
  await rt.scheduler.settled();
  assert.equal(rt.preview.result.count, 16);
  const low = { ...high, samples: 8 };
  rt.request(low);
  await rt.scheduler.settled();
  assert.equal(rt.preview.result.count, 8);
  const batches = rt.metrics.batches;
  rt.request(high);
  await rt.scheduler.settled();
  rt.request(low);
  await rt.scheduler.settled();
  assert.equal(rt.metrics.batches, batches);
  assert.equal(rt.metrics.cacheHits, 2);
  await rt.dispose();
});
test("capture never carries original comparison or optical guide into output", async () => {
  const { rt, state } = fixture();
  const s = state("output", 8, 640);
  s.pose.dof = true;
  const compose = rt.compose;
  rt.compose = (state, gpu, mask) => {
    assert.equal(state.original, false);
    assert.equal(state.peaking, false);
    assert.equal(state.adjusting, false);
    assert.equal(mask, undefined);
    return compose(state, gpu);
  };
  await rt.capture(
    { ...s, original: true, peaking: true, adjusting: true },
    new AbortController().signal,
  );
  assert.equal(rt.primary.pose, undefined);
  await rt.dispose();
});
test("Fast adjustment never contributes aperture samples or completes the final cache", async () => {
  const { rt, state } = fixture();
  const s = state("working", 8, 640);
  s.pose.dof = true;
  assert(isFastPreview({ ...s, adjusting: true }));
  assert(isFastPreview({ ...s, peaking: true }));
  assert(!isFastPreview({ ...s, adjusting: true, original: true }));
  assert(!isFastPreview({ ...s, adjusting: true, playing: true }));
  rt.request({ ...s, adjusting: true, peaking: true });
  await rt.scheduler.settled();
  assert.equal(rt.primary.apertureCount(s.pose), 0);
  assert.equal(rt.displayed.adjusting, true);
  const afterFast = rt.metrics.batches;
  rt.request(s);
  await rt.scheduler.settled();
  assert.equal(rt.primary.apertureCount(s.pose), 8);
  assert.equal(rt.metrics.batches, afterFast + 2);
  rt.request({ ...s, adjusting: true });
  await rt.scheduler.settled();
  const completed = rt.metrics.batches;
  rt.request(s);
  await rt.scheduler.settled();
  assert.equal(rt.metrics.batches, completed);
  assert.equal(rt.metrics.cacheHits, 1);
  await rt.dispose();
});
test("thumbnail and export started together retain exclusive state through final composition", async () => {
  const { rt, state } = fixture(),
    signal = new AbortController().signal;
  const [a, b] = await Promise.all([
    rt.capture(state("thumbnail", 4, 160), signal),
    rt.capture(state("export", 128, 1920), signal),
  ]);
  assert.deepEqual(a, { id: "thumbnail", w: 160, h: 80, count: 4 });
  assert.deepEqual(b, { id: "export", w: 1920, h: 960, count: 128 });
  await rt.dispose();
});
test("cancelled queued capture cannot reset another capture or poison the next export", async () => {
  const { rt, state } = fixture(),
    cancel = new AbortController();
  const a = rt.capture(state("first", 8, 640), new AbortController().signal);
  const b = rt.capture(state("cancelled", 4, 160), cancel.signal);
  const rejected = assert.rejects(b, { name: "AbortError" });
  cancel.abort();
  await a;
  await rejected;
  const c = await rt.capture(
    state("retry", 8, 1280),
    new AbortController().signal,
  );
  assert.equal(c.count, 8);
  assert.equal(c.id, "retry");
  await rt.dispose();
});

test("an export arriving after thumbnail projection cannot reset it before readback", async () => {
  let startExport, exported;
  const { rt, state } = fixture(() => {
    exported = startExport();
  });
  const signal = new AbortController().signal;
  startExport = () => rt.capture(state("export", 128, 1920), signal);
  const thumbnail = await rt.capture(state("thumbnail", 4, 160), signal);
  assert.equal(thumbnail.id, "thumbnail");
  assert.equal((await exported).id, "export");
  await rt.dispose();
});

test("preview requests wait until export readback and keep only the latest state", async () => {
  let rt, state;
  ({ rt, state } = fixture(() => {
    rt.request(state("old-preview", 128, 960));
    rt.request(state("latest-preview", 128, 960));
  }));
  const seen = [];
  rt.scheduler.request = (s) => seen.push(s.pose.id);
  const result = await rt.capture(
    state("export", 128, 1920),
    new AbortController().signal,
  );
  assert.equal(result.id, "export");
  assert.deepEqual(seen, ["latest-preview"]);
  await rt.dispose();
});
test("disposal cancels the active capture and drains queued work before destroying resources", async () => {
  let disposed;
  const { rt, state } = fixture(() => {
    disposed = rt.dispose();
  });
  const capture = rt.capture(
    state("export", 128, 1920),
    new AbortController().signal,
  );
  const queued = rt.capture(
    state("queued", 4, 160),
    new AbortController().signal,
  );
  await Promise.all([
    assert.rejects(capture, { name: "AbortError" }),
    assert.rejects(queued, { name: "AbortError" }),
  ]);
  await disposed;
  assert.equal(rt.disposed, true);
});

test("a newer visible preview supersedes an older tab-hide stop waiting for capture", async () => {
  let stopping,
    active = false;
  const { rt, state } = fixture(() => {
    stopping = rt.stop();
    rt.request(state("visible-again", 128, 960));
  });
  const cancel = rt.scheduler.cancel.bind(rt.scheduler);
  rt.scheduler.cancel = () => {
    active = false;
    cancel();
  };
  rt.scheduler.request = () => {
    active = true;
  };
  await rt.capture(state("thumbnail", 4, 160), new AbortController().signal);
  await stopping;
  assert.equal(
    active,
    true,
    "the old stop must not cancel the new visible request",
  );
  await rt.dispose();
});
