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
  const badBounds = structuredClone(manifest);
  badBounds.tiles[0].dataBounds.max.x = NaN;
  await assert.rejects(
    () => loadCollisionSource(badBounds, async () => a.bytes),
    /Invalid collision source bounds/,
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
  assert.equal(
    replayNativePolyline(source.space.collision, points, (p) => p.x < 3.5)
      .reason,
    "known-coverage-missing",
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

for (const transform of ["identity", "flipXY"] as const)
  test(`overlapping free carve cannot erase native occupied geometry (${transform})`, async () => {
    const a = tile("solid", 0), b = tile("free", 0);
    b.bytes = new Uint32Array([0, 0, 0]).buffer;
    for (const item of [a, b]) {
      item.entry.dataBounds = rawToWorldBounds(item.entry.meta.gridBounds, transform);
      item.entry.coreBounds = item.entry.dataBounds;
    }
    const manifest = { version: 1 as const, kind: "tiled" as const, sourceHash: "overlap",
      transform, voxelResolution: 1, bounds: a.entry.dataBounds, tiles: [a.entry, b.entry] };
    const loader = async (name: string) => {
      const item = name.startsWith("solid.") ? a : b;
      return name.endsWith(".json") ? new TextEncoder().encode(JSON.stringify(item.entry.meta)).buffer : item.bytes;
    };
    const source = await loadCollisionSource(manifest, loader),
      reversed = await loadCollisionSource({ ...manifest, tiles: [...manifest.tiles].reverse() }, loader),
      single = await loadCollisionSource({ ...manifest, kind: "single", tiles: [a.entry] }, loader);
    const originalQueries = TiledVoxelCollision.fromColliders([
      decodeCollisionTile(a.entry, a.bytes, transform), decodeCollisionTile(b.entry, b.bytes, transform),
    ]);
    try {
      const point = transform === "identity" ? [1.5, 0.5, 1.5] as const : [-1.5, -0.5, 1.5] as const;
      // Preserve the original Viewer spawn predicate and actual ray/volume queries.
      assert.equal(source.space.collision.isFreeAt(...point), true);
      assert.equal(single.space.collision.isFreeAt(...point), false);
      assert.equal(source.space.occupiedAt!(...point), true);
      assert.equal(reversed.space.occupiedAt!(...point), true);
      const air = transform === "identity" ? [1.5, 2.5, 1.5] as const : [-1.5, -2.5, 1.5] as const;
      assert.equal(source.space.occupiedAt!(...air), false);
      assert.equal(source.space.known(20, 2, 20), false);
      assert.equal(source.space.occupiedAt!(20, 2, 20), false);
      const pushed = { x: 0, y: 0, z: 0 }, referencePush = { x: 0, y: 0, z: 0 };
      assert.equal(source.space.collision.queryCapsule(...point, 0.5, 0.2, pushed),
        originalQueries.queryCapsule(...point, 0.5, 0.2, referencePush));
      assert.deepEqual(pushed, referencePush);
      const meshes = [source, reversed, single].map(s => exposedVoxelMesh(s.space,
        manifest.bounds, manifest.bounds.min, 1, { boundary: "source" }));
      assert.equal(meshes[0].diagnostics.solids, 16);
      assert.deepEqual(meshes[0].positions, meshes[2].positions);
      assert.deepEqual(meshes[0].indices, meshes[2].indices);
      assert.deepEqual(meshes[1].positions, meshes[0].positions);
      assert.deepEqual(meshes[1].indices, meshes[0].indices);
      const origin = transform === "identity" ? { x: 1.5, y: 3, z: 1.5 } : { x: -1.5, y: -3, z: 1.5 };
      assert.deepEqual(source.space.collision.queryRay(origin.x, origin.y, origin.z,
        0, transform === "identity" ? -1 : 1, 0, 4),
      single.space.collision.queryRay(origin.x, origin.y, origin.z, 0, transform === "identity" ? -1 : 1, 0, 4));
    } finally { source.destroy(); reversed.destroy(); single.destroy(); originalQueries.destroy(); }
    assert.throws(() => source.space.occupiedAt!(0, 0, 0), /released/);
  });
