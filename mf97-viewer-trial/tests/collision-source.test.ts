import test from "node:test";
import assert from "node:assert/strict";
import {
  loadCollisionSource,
  rawToWorldBounds,
  decodeCollisionTile,
  type CollisionSourceTile,
} from "../../mf79-viewer-trial/src/collision-source";
import { TiledVoxelCollision } from "../../metaflow-viewer/src/collision/tiled-voxel-collision";
import { exposedVoxelMesh } from "../../mf79-viewer-trial/src/voxel-mesh";
import { replayNativePolyline } from "../src/dayun-native-proof";
function tile(id: string, offset: number) {
  let low = 0,
    high = 0;
  for (let z = 0; z < 4; z++)
    for (let x = 0; x < 4; x++) {
      const bit = z * 16 + x;
      if (bit < 32) low |= 1 << bit;
      else high |= 1 << (bit - 32);
    }
  const bytes = new Uint32Array([0, low >>> 0, high >>> 0]).buffer;
  const meta = {
    version: "1.1",
    gridBounds: { min: [offset, 0, 0], max: [offset + 4, 4, 4] },
    gaussianBounds: { min: [offset, 0, 0], max: [offset + 4, 4, 4] },
    voxelResolution: 1,
    leafSize: 4,
    treeDepth: 0,
    nodeCount: 1,
    leafDataCount: 2,
    numInteriorNodes: 0,
    numMixedLeaves: 1,
  };
  const bounds = rawToWorldBounds(meta.gridBounds, "identity");
  const entry: CollisionSourceTile = {
    id,
    meta,
    coreBounds: bounds,
    dataBounds: bounds,
    binaryUrl: id + ".bin",
    binaryHash: "checked-by-loader",
    metadataHash: "meta",
    binaryBytes: bytes.byteLength,
  };
  return { bytes, entry };
}
test("single and tiled inputs use the same native collision query results, and retain unknown gaps", async () => {
  const a = tile("a", 0),
    b = tile("b", 8);
  const manifest = {
    version: 1 as const,
    kind: "tiled" as const,
    sourceHash: "frozen",
    transform: "identity" as const,
    voxelResolution: 1,
    bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 12, y: 4, z: 4 } },
    tiles: [a.entry, b.entry],
  };
  const loaded = await loadCollisionSource(manifest, async (name, hash) => {
    const item = name.startsWith("a.") ? a : b;
    assert.equal(hash, name.endsWith(".json") ? "meta" : "checked-by-loader");
    return name.endsWith(".json")
      ? new TextEncoder().encode(JSON.stringify(item.entry.meta)).buffer
      : item.bytes;
  });
  const original = TiledVoxelCollision.fromColliders([
    decodeCollisionTile(a.entry, a.bytes, "identity"),
    decodeCollisionTile(b.entry, b.bytes, "identity"),
  ]);
  for (const x of [0.5, 3.5, 5.5, 8.5, 11.5]) {
    assert.deepEqual(
      loaded.space.collision.queryRay(x, 3, 0.5, 0, -1, 0, 4),
      original.queryRay(x, 3, 0.5, 0, -1, 0, 4),
    );
    assert.equal(
      loaded.space.collision.isFreeAt(x, 2, 0.5),
      original.isFreeAt(x, 2, 0.5),
    );
  }
  assert.equal(loaded.space.known(5.5, 2, 0.5), false);
  assert.equal(loaded.space.known(8.5, 2, 0.5), true);
  await assert.rejects(
    () => loadCollisionSource(manifest, async () => a.bytes, { maxBytes: 1 }),
    /partition/,
  );
  await assert.rejects(
    () =>
      loadCollisionSource(manifest, async (name) =>
        name.endsWith(".json")
          ? new TextEncoder().encode(
              JSON.stringify((name.startsWith("a.") ? a : b).entry.meta),
            ).buffer
          : new ArrayBuffer(0),
      ),
    /size mismatch/,
  );
  loaded.destroy();
  original.destroy();
});
test("flipXY bounds and native collision transform agree without changing original metadata", () => {
  const { entry, bytes } = tile("flip", 4),
    b = rawToWorldBounds(entry.meta.gridBounds, "flipXY");
  assert.deepEqual(b, {
    min: { x: -8, y: -4, z: 0 },
    max: { x: -4, y: -0, z: 4 },
  });
  const c = decodeCollisionTile(entry, bytes, "flipXY");
  assert.equal(c.isFreeAt(-5.5, -2, 0.5), true);
  assert.equal(c.isFreeAt(-5.5, -0.5, 0.5), false);
});
test("source-boundary extraction never builds a wall against missing coverage", () => {
  const bounds = { min: { x: 0, y: 0, z: 0 }, max: { x: 2, y: 2, z: 2 } };
  const collision = { isFreeAt: () => false } as any;
  const mesh = exposedVoxelMesh(
    {
      bounds,
      collision,
      known: (x, y, z) => x >= 0 && x < 1 && y >= 0 && y < 2 && z >= 0 && z < 2,
    },
    bounds,
    bounds.min,
    1,
    { boundary: "source" },
  );
  assert.equal(mesh.indices.length, 0);
});

test("adjacent tiled source preserves a real native walk across the seam", async () => {
  const { proveRoute } =
    await import("../../mf79-viewer-trial/src/native-motion");
  const a = tile("a", 0),
    b = tile("b", 4);
  const source = await loadCollisionSource(
    {
      version: 1,
      kind: "tiled",
      sourceHash: "pair",
      transform: "identity",
      voxelResolution: 1,
      bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 8, y: 4, z: 4 } },
      tiles: [a.entry, b.entry],
    },
    async (name) => {
      const item = name.startsWith("a.") ? a : b;
      return name.endsWith(".json")
        ? new TextEncoder().encode(JSON.stringify(item.entry.meta)).buffer
        : item.bytes;
    },
  );
  const points = [
    { x: 3, y: 2.5, z: 2 },
    { x: 5, y: 2.5, z: 2 },
  ];
  for (const path of [points, [...points].reverse()]) {
    const iterator = proveRoute(source.space.collision, path[0], path);
    let result = iterator.next();
    while (!result.done) result = iterator.next();
    assert.equal(result.value.ok, true);
    assert.equal(result.value.state.collision, "active");
    const proof = replayNativePolyline(source.space.collision, path);
    assert.equal(proof.ok, true);
    assert.equal(proof.state.grounded, true);
    assert.ok(proof.input.length > 30);
  }
  // Merely reaching the correct X/Z on another height cannot certify a connection.
  const wrongFloor = [points[0], { ...points[1], y: points[1].y + 1 }];
  assert.equal(
    replayNativePolyline(source.space.collision, wrongFloor).ok,
    false,
  );
  source.destroy();
});

test("inline lattice changes cannot reuse the frozen metadata hash", async () => {
  const a = tile("a", 0),
    changed = structuredClone(a.entry);
  changed.meta.gridBounds.min[0] = 0.1;
  await assert.rejects(
    () =>
      loadCollisionSource(
        {
          version: 1,
          kind: "single",
          sourceHash: "one",
          transform: "identity",
          voxelResolution: 1,
          bounds: a.entry.dataBounds,
          tiles: [changed],
        },
        async (name) =>
          name.endsWith(".json")
            ? new TextEncoder().encode(JSON.stringify(a.entry.meta)).buffer
            : a.bytes,
      ),
    /metadata mismatch/,
  );
});
