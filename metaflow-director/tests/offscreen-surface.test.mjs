import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
const built = await build({
  entryPoints: ["src/render/offscreen-surface.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
});
const { OffscreenSurface } = await import(
  "data:text/javascript;base64," +
    Buffer.from(built.outputFiles[0].text).toString("base64")
);
test("offscreen engine frames reuse a scratch surface and never acquire the visible swapchain", () => {
  let acquired = 0;
  const created = [],
    freed = [];
  const context = {
    getCurrentTexture() {
      acquired++;
      return "canvas";
    },
    getConfiguration() {
      assert.equal(this, context);
      return "configuration";
    },
  };
  const device = {
    width: 1280,
    height: 720,
    gpuContext: context,
    canvasConfig: {
      format: "bgra8unorm",
      usage: 17,
      viewFormats: ["bgra8unorm-srgb"],
    },
    wgpu: {
      createTexture(d) {
        const t = { d };
        created.push(t);
        return t;
      },
    },
    deferDestroy: (t) => freed.push(t),
  };
  const surface = new OffscreenSurface(device);
  for (let i = 0; i < 6; i++)
    surface.run(() => {
      assert.equal(device.gpuContext.getCurrentTexture(), created[0]);
      assert.equal(device.gpuContext.getConfiguration(), "configuration");
    });
  assert.equal(acquired, 0);
  assert.equal(created.length, 1);
  assert.equal(device.gpuContext, context);
  assert.deepEqual(created[0].d.viewFormats, ["bgra8unorm-srgb"]);
  assert.throws(
    () =>
      surface.run(() => {
        throw Error("render failed");
      }),
    /render failed/,
  );
  assert.equal(device.gpuContext, context);
  assert.equal(device.gpuContext.getCurrentTexture(), "canvas");
  assert.equal(acquired, 1);
  device.width = 390;
  surface.run(() => {});
  assert.equal(created.length, 2);
  assert.deepEqual(freed, [created[0]]);
  surface.destroy();
  assert.deepEqual(freed, created);
});
