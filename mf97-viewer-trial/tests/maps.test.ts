import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mapTiles, sliceModifier } from "../src/maps/model";
import {
  validateMapManifest,
  GaussianMapAssets,
} from "../../metaflow-viewer/src/navigation/map-assets";

const layer = {
  id: "floor-0",
  label: "展览层",
  supportRange: [-0.3, 0.5] as [number, number],
  sliceRange: [-0.8, 2.5] as [number, number],
  bounds: { minX: -10, minZ: -4, maxX: 18, maxZ: 12 },
};
const transform = [1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1];
const job = {
  scene: "fixture",
  assetUrl: "/fixture/lod-meta.json",
  transform,
  lod: 2,
  gaussianHash: "g",
  collisionHash: "c",
  layers: [layer],
  tileMetres: 10,
  pixels: 100,
};
const manifest = () => ({
  version: 1 as const,
  scene: job.scene,
  source: { gaussianHash: "g", collisionHash: "c", transform },
  layers: [
    {
      ...layer,
      tiles: mapTiles(job).map((t) => ({
        ...t,
        url: `${t.id}.webp`,
        sha256: "a".repeat(64),
        status: "ready" as const,
      })),
    },
  ],
  coverage: { expected: 6, ready: 6, status: "complete" as const },
});

test("map tiles cover the entire layer with edge-sized tiles and no overlaps", () => {
  const tiles = mapTiles(job);
  assert.equal(tiles.length, 6);
  assert.equal(
    tiles.reduce(
      (sum, t) =>
        sum + (t.bounds.maxX - t.bounds.minX) * (t.bounds.maxZ - t.bounds.minZ),
      0,
    ),
    28 * 16,
  );
  assert.equal(tiles.at(-1).width, 80);
  assert.equal(tiles.at(-1).height, 60);
});
test("world-space slice changes splat data and not the camera clipping planes", () => {
  const shader = sliceModifier(-0.8, 2.5);
  assert.match(shader.glsl, /originalCenter.y < -0.8/);
  assert.match(shader.wgsl, /color\).a = 0.0/);
  assert.throws(() => sliceModifier(2, 1));
});
test("map cache validates source identity, coverage, bounds and tile hashes", () => {
  assert.equal(
    validateMapManifest(manifest(), { collisionHash: "c" }).coverage.ready,
    6,
  );
  assert.throws(
    () => validateMapManifest(manifest(), { collisionHash: "wrong" }),
    /版本不一致/,
  );
  const missing = manifest();
  missing.layers[0].tiles[0].status = "missing" as any;
  assert.throws(() => validateMapManifest(missing), /覆盖记录/);
  const outside = manifest();
  outside.layers[0].tiles[0].bounds.minX = -11;
  assert.throws(() => validateMapManifest(outside), /超出/);
  const overlap = manifest();
  overlap.layers[0].tiles[1].bounds = { ...overlap.layers[0].tiles[0].bounds };
  assert.throws(() => validateMapManifest(overlap), /重叠/);
  const gap = manifest();
  gap.layers[0].tiles[0].bounds.maxX -= 1;
  assert.throws(() => validateMapManifest(gap), /缺口/);
});
test("map source binding rejects Gaussian and transform changes independently of collision hash", () => {
  assert.equal(validateMapManifest(manifest(), { collisionHash: "c", gaussianHash: "g", transform }).scene, "fixture");
  assert.throws(() => validateMapManifest(manifest(), { collisionHash: "c", gaussianHash: "old" }), /高斯资产版本/);
  const wrongTransform = [...transform];
  wrongTransform[12] = 0.01;
  assert.throws(() => validateMapManifest(manifest(), { collisionHash: "c", transform: wrongTransform }), /坐标变换不一致/);
  const rounding = [...transform];
  rounding[0] += 1e-10;
  assert.equal(validateMapManifest(manifest(), { transform: rounding }).scene, "fixture");
  for (const invalid of [[], [NaN, ...transform.slice(1)]])
    assert.throws(() => validateMapManifest(manifest(), { transform: invalid }), /坐标变换格式/);
});
test("map layer suggestion preserves identity and refuses ambiguous overlapping heights", () => {
  const loader = new GaussianMapAssets({
    fetch: async () => {
      throw new Error("not called");
    },
  });
  loader.manifest = validateMapManifest(manifest());
  assert.equal(loader.suggestLayer(0), "floor-0");
  assert.equal(loader.suggestLayer(5), null);
  loader.manifest.layers.push({
    ...layer,
    id: "overlapping-bridge",
    tiles: [],
  });
  assert.equal(loader.suggestLayer(0), null);
  assert.equal(
    loader.suggestLayer(0, "overlapping-bridge"),
    "overlapping-bridge",
  );
  loader.destroy();
});

test("late map manifests cannot overwrite a newer load", async () => {
  let release: (response: Response) => void;
  const delayed = new Promise<Response>((resolve) => {
    release = resolve;
  });
  const loader = new GaussianMapAssets({
    fetch: async (url) =>
      String(url).endsWith("old.json")
        ? delayed
        : new Response(JSON.stringify({ ...manifest(), scene: "new" })),
  });
  const first = loader.load("http://localhost/old.json");
  await loader.load("http://localhost/new.json");
  release(new Response(JSON.stringify({ ...manifest(), scene: "old" })));
  await first;
  assert.equal(loader.manifest.scene, "new");
  loader.destroy();
});

test("destroy releases an image whose decode completes after cancellation", async () => {
  const data = new Uint8Array([1, 3, 7]),
    sha = createHash("sha256").update(data).digest("hex");
  const m = manifest();
  m.layers[0].tiles = [
    {
      ...m.layers[0].tiles[0],
      width: 100,
      height: 100,
      bounds: { ...layer.bounds },
      sha256: sha,
    },
  ];
  m.coverage = { expected: 1, ready: 1, status: "complete" };
  let release: (image: ImageBitmap) => void, decoding: () => void;
  const started = new Promise<void>((resolve) => {
    decoding = resolve;
  });
  const original = globalThis.createImageBitmap;
  globalThis.createImageBitmap = (() => {
    decoding();
    return new Promise((resolve) => {
      release = resolve;
    });
  }) as typeof createImageBitmap;
  let closed = 0;
  const loader = new GaussianMapAssets({
    fetch: async (url) =>
      String(url).endsWith("manifest.json")
        ? new Response(JSON.stringify(m))
        : new Response(data),
  });
  try {
    await loader.load("http://localhost/manifest.json");
    const loading = loader.selectLayer("floor-0");
    await started;
    loader.destroy();
    release({ width: 100, height: 100, close: () => closed++ } as ImageBitmap);
    await loading;
    assert.equal(closed, 1);
    assert.equal(loader.tiles.length, 0);
  } finally {
    globalThis.createImageBitmap = original;
    loader.destroy();
  }
});
