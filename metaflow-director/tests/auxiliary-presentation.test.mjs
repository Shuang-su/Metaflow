import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

// Execute the real session method with only the engine/texture boundary mocked.
const exportsByPath = {
  "./device-events": "observeFailure observeProfile",
  "./srgb": "srgbToLinear",
  "./clipping": "clippingRange",
  "./precision-target": "setScenePrecision",
  "./aperture-gpu": "ApertureGpu",
  "./offscreen-surface": "OffscreenSurface",
  "./optics": "apertureDiameter apertureSample PROJECTED_KERNEL_VARIANCE",
  playcanvas:
    "Entity Vec3 GAMMA_NONE GAMMA_SRGB TONEMAP_NONE createGraphicsDevice",
  "@playcanvas/splat-transform": "WebPCodec",
  "@upstream/scene": "Scene",
  "@upstream/events": "Events",
  "@upstream/command-queue": "CommandQueue",
  "@upstream/scene-config": "getSceneConfig",
  "@upstream/io/read/file-systems": "MappedReadFileSystem",
};
const bundled = await build({
  entryPoints: ["src/render/session.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  plugins: [
    {
      name: "isolated-engine-boundary",
      setup(b) {
        b.onResolve({ filter: /.*/ }, (args) =>
          args.importer.endsWith("/render/session.ts") &&
          args.path !== "./device-startup"
            ? { path: args.path, namespace: "engine-stub" }
            : undefined,
        );
        b.onLoad({ filter: /.*/, namespace: "engine-stub" }, (args) => ({
          loader: "js",
          contents:
            args.path === "./float-image"
              ? "export class FloatImage { constructor(device,width,height){this.device=device;this.width=width;this.height=height;this.texture={};} copy(texture){this.device.events.push(['copy',texture]);} destroy(){} }"
              : (exportsByPath[args.path] ?? "")
                  .split(" ")
                  .filter(Boolean)
                  .map((name) => `export const ${name}=class {};`)
                  .join("\n") +
                (args.path === "playcanvas"
                  ? "\nexport class Color {constructor(...values){this.values=values;}}"
                  : ""),
        }));
      },
    },
  ],
});
const { CandidateSession } = await import(
  "data:text/javascript;base64," +
    Buffer.from(bundled.outputFiles[0].text).toString("base64")
);
function fixture(fail = false) {
  const session = new CandidateSession(),
    events = [];
  session.device = { events };
  session.scene = {
    camera: {
      colorTarget: { colorBuffer: "mask-texture" },
      clearPass: { setClearColor: () => events.push(["clear"]) },
    },
  };
  session.enqueue = (work) => work();
  session.apply = (pose, w, h, fast = false) =>
    events.push(["apply", pose, ...(fast ? [fast] : [])]);
  session.presentation = () => events.push(["retain-composed-image"]);
  session.frame = async (moving, signal, afterRender) => {
    afterRender();
    if (fail) throw new Error("GPU failure");
  };
  return { session, events };
}
test("optical guide copies its mask and retains the prior composed image in the same frame", async () => {
  const { session, events } = fixture(),
    pose = { dof: true, blur: 67, focus: 2 };
  await session.peakingMask(pose, 640, 360);
  assert.deepEqual(events.slice(2, 4), [
    ["copy", "mask-texture"],
    ["retain-composed-image"],
  ]);
  assert.deepEqual(session.scene.directorPeaking, [0, 0, 0, 0]);
  assert.deepEqual(events.at(-1), ["apply", { ...pose, dof: false }]);
  assert.deepEqual(pose, { dof: true, blur: 67, focus: 2 });
  assert.equal(session.apertureCount(pose, 640, 360), 0);
});
test("a failed guide frame still clears preview-only flags and restores the camera", async () => {
  const { session, events } = fixture(true),
    pose = { dof: true, focusInfinity: true };
  await assert.rejects(session.peakingMask(pose, 640, 360), /GPU failure/);
  assert.deepEqual(session.scene.directorPeaking, [0, 0, 0, 0]);
  assert.deepEqual(events.at(-1), ["apply", { ...pose, dof: false }]);
});
test("Fast renders once into a float image and retains the displayed frame without altering aperture", async () => {
  const { session, events } = fixture(),
    pose = { dof: true, blur: 40, focus: 2 };
  const texture = await session.previewFrame(pose, 640, 360);
  assert.deepEqual(events[0], ["apply", pose, true]);
  assert.deepEqual(events.slice(1, 3), [
    ["copy", "mask-texture"],
    ["retain-composed-image"],
  ]);
  assert.deepEqual(events.at(-1), ["apply", pose]);
  assert.equal(session.scene.lockedRenderMode, false);
  assert.equal(session.apertureCount(pose, 640, 360), 0);
  assert(texture);
});
test("cancelled Fast frame cannot be delivered and always clears its preview flag", async () => {
  const { session, events } = fixture(),
    pose = { dof: true, blur: 40 };
  session.frame = async (moving, signal, afterRender) => {
    afterRender();
    session.cancel();
  };
  await assert.rejects(session.previewFrame(pose, 640, 360), {
    name: "AbortError",
  });
  assert.equal(session.scene.lockedRenderMode, false);
  assert.deepEqual(events.at(-1), ["apply", pose]);
});
