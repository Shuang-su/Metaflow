import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
const output = await build({
  entryPoints: ["src/resource.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
});
const { loadResource } = await import(
  "data:text/javascript;base64," +
    Buffer.from(output.outputFiles[0].text).toString("base64")
);
const index = JSON.parse(await readFile("../data/index.json"));
const resources = index.resources.filter(
  (r) => r.category?.includes("acg") && /\.(sog|ply)$/i.test(r.files.model),
);
test("all eligible resources initialize from either JSON format when storage is unavailable", async () => {
  const original = globalThis.fetch;
  let requests = [];
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    get() {
      throw Error("disabled");
    },
  });
  globalThis.fetch = async (url) => {
    requests.push(url);
    if (url === "/data/index.json") return Response.json(index);
    if (String(url).endsWith(".json"))
      return new Response(
        await readFile("../" + decodeURIComponent(url).slice(1)),
      );
    return new Response(new Uint8Array([1, 2, 3]));
  };
  try {
    for (const r of resources) {
      requests = [];
      const scene = await loadResource(
        r.route + "/director",
        new AbortController().signal,
        () => {},
      );
      const raw = JSON.parse(await readFile("../data/" + r.files.settings)),
        camera = raw.camera ?? raw.cameras[0].initial;
      assert.equal(scene.cameraSource, "settings");
      assert.deepEqual(scene.pose.target, camera.target);
      assert.deepEqual(scene.pose.focusPoint, camera.target);
      assert.equal(scene.pose.controls.focusMode, "manual");
      assert.equal(scene.assets.length, r.files.environment ? 2 : 1);
      assert.equal(requests.length, r.files.environment ? 4 : 3);
    }
  } finally {
    globalThis.fetch = original;
    delete globalThis.sessionStorage;
  }
});
test("declared environment failure never resolves a partial photography scene", async () => {
  const r = resources.find((r) => r.files.environment),
    original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (url === "/data/index.json") return Response.json(index);
    if (String(url).endsWith(".json"))
      return new Response(
        await readFile("../" + decodeURIComponent(url).slice(1)),
      );
    if (decodeURIComponent(url).endsWith(r.files.environment))
      return new Response("", { status: 503 });
    return new Response(new Uint8Array([1]));
  };
  try {
    await assert.rejects(
      () =>
        loadResource(
          r.route + "/director",
          new AbortController().signal,
          () => {},
        ),
      /环境模型未能完整加载/,
    );
  } finally {
    globalThis.fetch = original;
  }
});
