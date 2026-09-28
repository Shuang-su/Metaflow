import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  init,
  exportNavMesh,
  getNavMeshPositionsAndIndices,
} from "recast-navigation";
import { source, sha, cache, resources } from "./source";
import { RECAST_CONFIG } from "../src/recast-config";
import { BODY, stand } from "../src/native-motion";
import { RecastTileBuilder, navigationTiles } from "../src/tiles";
import { exposedVoxelMesh } from "../src/voxel-mesh";
await init();
for (const id of process.argv.slice(2)) {
  const s = source(id),
    dir = resolve(cache, id);
  mkdirSync(dir, { recursive: true });
  resources(dir);
  const key = {
    generator: "native-v1-integer-xyz",
    controllerHash: sha(
      readFileSync("../metaflow-viewer/src/cameras/walk-controller.ts"),
    ),
    sourceHash: s.sourceHash,
    bounds: s.bounds,
    transform: s.scene.transform,
    body: BODY,
    config: RECAST_CONFIG,
    tileCells: 512,
  };
  const fingerprint = sha(JSON.stringify(key));
  const file = resolve(dir, "manifest.json");
  let m: any = existsSync(file)
    ? JSON.parse(readFileSync(file, "utf8"))
    : { key, fingerprint, status: "building", tiles: [] };
  if (m.fingerprint !== fingerprint) throw Error("Cache fingerprint mismatch");
  const save = () => writeFileSync(file, JSON.stringify(m, null, 2));
  const builder = new RecastTileBuilder(s.bounds, RECAST_CONFIG, 512);
  try {
    for (const t of navigationTiles(s.bounds, 0.04, 512)) {
      const name = `tile-${t.x}-${t.z}`,
        old = m.tiles.find((r: any) => r.name === name);
      if (old) {
        if (old.hash) {
          const b = readFileSync(resolve(dir, name + ".bin"));
          if (sha(b) !== old.hash) throw Error("Damaged tile");
          builder.add(b);
        }
        continue;
      }
      (globalThis as any).gc?.();
      resources(dir);
      const begin = performance.now(),
        bounds = structuredClone(t.bounds),
        halo = 0.32;
      bounds.min.x -= halo;
      bounds.min.z -= halo;
      bounds.max.x += halo;
      bounds.max.z += halo;
      const g = exposedVoxelMesh(
        s.space,
        bounds,
        s.bounds.min,
        s.meta.voxelResolution,
        { boundary: "source" },
      );
      const b = builder.build(
        g.positions,
        g.indices,
        t,
        true,
        (x, y, z) => !!stand(s.space.collision, { x, y, z }),
      );
      if (b) {
        writeFileSync(resolve(dir, name + ".bin"), b);
        builder.add(b);
      }
      // Same source geometry provides route depth occlusion. No synthetic tile boundary faces.
      const pos = Buffer.from(g.positions.buffer),
        idx = Buffer.from(g.indices.buffer);
      writeFileSync(resolve(dir, name + "-positions.bin"), pos);
      writeFileSync(resolve(dir, name + "-indices.bin"), idx);
      m.tiles.push({
        name,
        x: t.x,
        z: t.z,
        bounds: t.bounds,
        hash: b ? sha(b) : null,
        bytes: b?.byteLength ?? 0,
        positionsHash: sha(pos),
        indicesHash: sha(idx),
        ms: performance.now() - begin,
        ...builder.lastDiagnostic,
      });
      save();
      console.log(
        id,
        name,
        m.tiles.at(-1).polygons,
        Math.round(performance.now() - begin),
        Math.round(process.memoryUsage().rss / 1024 ** 2),
      );
    }
    const nav = exportNavMesh(builder.mesh);
    writeFileSync(resolve(dir, "nav.bin"), nav);
    const [p, i] = getNavMeshPositionsAndIndices(builder.mesh),
      pos = Buffer.from(new Float32Array(p).buffer),
      idx = Buffer.from(new Uint32Array(i).buffer);
    writeFileSync(resolve(dir, "nav-positions.bin"), pos);
    writeFileSync(resolve(dir, "nav-indices.bin"), idx);
    writeFileSync(resolve(dir, "collision.bin"), s.binary);
    Object.assign(m, {
      status: "complete",
      scene: id,
      meta: s.meta,
      bounds: s.bounds,
      body: BODY,
      sourceHash: s.sourceHash,
      markerHash: s.markerHash,
      start: s.scene.start,
      markers: s.markers,
      navHash: sha(nav),
      collisionHash: sha(s.binary),
      display: { positionsHash: sha(pos), indicesHash: sha(idx) },
    });
    save();
    console.log("COMPLETE", id);
  } finally {
    builder.destroy();
  }
}
