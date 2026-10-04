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
        b.onResolve({ filter: /^\.\/(session|gpu-compositor)$/ }, (args) => ({
          path: args.path,
          namespace: "mock",
        }));
        b.onLoad({ filter: /.*/, namespace: "mock" }, (args) => ({
          contents: args.path.endsWith("session")
            ? "export class CandidateSession { static attach(scene) { return scene; } }"
            : "export class SharedGpuCompositor { upload(){} present(){} destroy(){} snapshot(){return this.result;} }",
          loader: "js",
        }));
      },
    },
  ],
});
const { ResourceRuntime } = await import(
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
    device: {},
    scene: null,
    settled: () => serial,
    cancel() {
      count = 0;
      value = null;
    },
    advance(p, w, h, n) {
      const task = serial.then(async () => {
        await new Promise((r) => setTimeout(r, 2));
        if (value?.id !== p.id) {
          count = 0;
        }
        value = { id: p.id, w, h };
        count += n;
        if (batches++ === 0) afterFirstBatch?.();
      });
      serial = task.catch(() => {});
      return task;
    },
    apertureCount() {
      return count;
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
    assert.equal(count, s.samples, "all samples must belong to this capture");
    gpu.result = { ...value, count };
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
