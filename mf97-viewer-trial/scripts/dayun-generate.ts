import { resolveRecordedPath } from "../../scripts/mf97/asset-config.mjs";
/** Explicit bounded navigation job. Analysis-only jobs cannot be mounted as Viewer navigation. */
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  init,
  exportNavMesh,
  getNavMeshPositionsAndIndices,
  Raw,
} from "../../mf79-viewer-trial/src/recast-runtime";
import {
  collisionSourceFile,
  sha,
} from "../../mf79-viewer-trial/scripts/source";
import {
  RecastTileBuilder,
  navigationTiles,
  TILE_GENERATOR,
} from "../../mf79-viewer-trial/src/tiles";
import { exposedVoxelMesh } from "../../mf79-viewer-trial/src/voxel-mesh";
import { RECAST_CONFIG } from "../../mf79-viewer-trial/src/recast-config";
import { BODY, stand } from "../../mf79-viewer-trial/src/native-motion";
import { SurfaceCatalogIndex } from "../../metaflow-viewer/src/navigation/layers";
import { validateDayunResume } from "../src/dayun-job";
import {
  createOfflineResources,
  offlineResourceOptions,
  MiB,
} from "../src/offline-resources";
const args = process.argv.slice(2),
  jobFile = args[args.indexOf("--job") + 1];
if (!args.includes("--job") || !jobFile)
  throw Error("Use --job with an explicit reviewed coverage/start/catalog job");
const job = JSON.parse(readFileSync(jobFile, "utf8"));
const limitIndex = args.indexOf("--max-new-tiles");
const maxNewTiles = limitIndex < 0 ? 20 : Number(args[limitIndex + 1]);
if (!Number.isSafeInteger(maxNewTiles) || maxNewTiles < 1 || maxNewTiles > 20)
  throw Error("--max-new-tiles must be an integer from 1 to 20");
if (
  typeof job.id !== "string" ||
  !/^[a-z0-9][a-z0-9._-]*$/.test(job.id) ||
  (job.analysisOnly !== undefined && typeof job.analysisOnly !== "boolean") ||
  !job.bounds ||
  !job.start ||
  !job.collisionSourceFile ||
  (!job.analysisOnly && !job.surfaceCatalogFile)
)
  throw Error("Incomplete bounded navigation job");
const resources = createOfflineResources({
  ...offlineResourceOptions(args),
  taskOutputBytes: 768 * MiB,
});
const halo = (RECAST_CONFIG.walkableRadius + 3) * RECAST_CONFIG.cs;
const tiles = navigationTiles(job.bounds, RECAST_CONFIG.cs, 512);
const geometryBounds = structuredClone(job.bounds);
// Geometry needs the full builder tile and its border. The output navigation
// scope remains the job's explicit scope; missing source cells stay unknown.
for (const axis of ["x", "z"] as const) {
  geometryBounds.max[axis] =
    Math.max(...tiles.map((tile) => tile.bounds.max[axis])) + halo;
  geometryBounds.min[axis] -= halo;
}
geometryBounds.min.y -= RECAST_CONFIG.ch;
geometryBounds.max.y += RECAST_CONFIG.ch;
const loaded = await collisionSourceFile(
  resolveRecordedPath(job.collisionSourceFile),
  geometryBounds,
);
const catalog = job.surfaceCatalogFile
  ? JSON.parse(
      readFileSync(resolveRecordedPath(job.surfaceCatalogFile), "utf8"),
    )
  : undefined;
if (catalog) new SurfaceCatalogIndex(catalog, loaded.sourceHash);
const key = {
  version: "dayun-tiled-native-v3",
  tileGenerator: TILE_GENERATOR,
  implementations: Object.fromEntries(
    [
      ["generator", new URL(import.meta.url)],
      [
        "recastRuntime",
        new URL(
          "../../mf79-viewer-trial/src/recast-runtime.ts",
          import.meta.url,
        ),
      ],
      [
        "recastDependencyLock",
        new URL("../../mf79-viewer-trial/package-lock.json", import.meta.url),
      ],
      ["jobValidation", new URL("../src/dayun-job.ts", import.meta.url)],
      [
        "tileBuilder",
        new URL("../../mf79-viewer-trial/src/tiles.ts", import.meta.url),
      ],
      [
        "tileRasterizer",
        new URL("../../mf79-viewer-trial/src/recast-tile.ts", import.meta.url),
      ],
      [
        "voxelMesh",
        new URL("../../mf79-viewer-trial/src/voxel-mesh.ts", import.meta.url),
      ],
      [
        "collisionAdapter",
        new URL(
          "../../mf79-viewer-trial/src/collision-source.ts",
          import.meta.url,
        ),
      ],
      [
        "tiledCollision",
        new URL(
          "../../metaflow-viewer/src/collision/tiled-voxel-collision.ts",
          import.meta.url,
        ),
      ],
      [
        "voxelCollision",
        new URL(
          "../../metaflow-viewer/src/collision/voxel-collision.ts",
          import.meta.url,
        ),
      ],
      [
        "nativeMotion",
        new URL(
          "../../mf79-viewer-trial/src/native-motion.ts",
          import.meta.url,
        ),
      ],
    ].map(([name, url]) => [name, sha(readFileSync(url))]),
  ),
  recastVersion: JSON.parse(
    readFileSync(
      new URL(
        "../../mf79-viewer-trial/node_modules/recast-navigation/package.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ).version,
  analysisOnly: !!job.analysisOnly,
  collisionSource: loaded.sourceHash,
  collisionManifest: sha(
    readFileSync(resolveRecordedPath(job.collisionSourceFile)),
  ),
  scope: job.bounds,
  geometryScope: geometryBounds,
  body: BODY,
  config: RECAST_CONFIG,
  catalogHash: catalog ? sha(JSON.stringify(catalog)) : null,
  start: job.start,
  markersHash: sha(JSON.stringify(job.markers ?? [])),
  controllerHash: sha(
    readFileSync(
      new URL(
        "../../metaflow-viewer/src/cameras/walk-controller.ts",
        import.meta.url,
      ),
    ),
  ),
};
const fingerprint = sha(JSON.stringify(key)),
  dir = `dayun/navigation/${job.id}`,
  manifestFile = `${dir}/manifest.json`;
const reuseIndex = args.indexOf("--reuse-manifest"), reuseFile = reuseIndex < 0 ? undefined : args[reuseIndex + 1];
if (reuseIndex >= 0 && !reuseFile) throw Error("Missing --reuse-manifest");
const reuse = reuseFile ? JSON.parse(readFileSync(reuseFile, "utf8")) : undefined;
const reusable = new Map<string, any>(), auditNames = new Set<string>();
if (reuse) {
  if (reuse.status !== "analysis-complete" || !job.analysisOnly ||
      sha(JSON.stringify(reuse.key)) !== reuse.fingerprint ||
      sha(readFileSync(resolve(dirname(reuseFile!), "nav.bin"))) !== reuse.navHash)
    throw Error("Invalid reuse navigation identity");
  for (const field of ["version", "tileGenerator", "recastVersion", "collisionSource", "collisionManifest", "body", "config", "catalogHash", "controllerHash"] as const)
    if (JSON.stringify(reuse.key[field]) !== JSON.stringify(key[field])) throw Error(`Reuse differs: ${field}`);
  // Only orchestration changed: every geometry/runtime implementation must match.
  for (const [name, hash] of Object.entries(key.implementations))
    if (name !== "generator" && reuse.key.implementations?.[name] !== hash) throw Error(`Reuse implementation differs: ${name}`);
  validateDayunResume(reuse, reuse.fingerprint, navigationTiles(reuse.bounds, RECAST_CONFIG.cs, 512));
  for (const tile of reuse.tiles) {
    const expected = tiles.find(t => t.x === tile.x && t.z === tile.z);
    if (!expected || JSON.stringify(expected.bounds) !== JSON.stringify(tile.bounds)) throw Error("Reuse tile bounds differ");
    reusable.set(tile.name, tile);
  }
  for (const x of [Math.min(...reuse.tiles.map((t: any) => t.x)), Math.max(...reuse.tiles.map((t: any) => t.x))])
    for (const z of [Math.min(...reuse.tiles.map((t: any) => t.z)), Math.max(...reuse.tiles.map((t: any) => t.z))])
      auditNames.add(`tile-${x}-${z}`);
}
const existing = existsSync(resources.resolveOutput(manifestFile))
  ? JSON.parse(readFileSync(resources.resolveOutput(manifestFile), "utf8"))
  : null;
if (existing) {
  if (sha(JSON.stringify(existing.key)) !== existing.fingerprint)
    throw Error("Navigation resume identity is corrupt");
  validateDayunResume(existing, fingerprint, tiles);
}
const m: any = existing ?? { key, fingerprint, status: "building", tiles: [] };
await init();
const builder = new RecastTileBuilder(job.bounds, RECAST_CONFIG, 512);
const runId = `${Date.now()}-${process.pid}`, startedWith = m.tiles.length;
let generated = 0;
const memory = () => {
  const module = Raw.Module as any;
  return { ...process.memoryUsage(), wasmBytes: module.HEAPU8?.buffer.byteLength ?? null,
    wrapperCacheEntries: Object.fromEntries(["rcCompactCell", "rcCompactSpan", "rcCompactHeightfield"].map(name => {
      const cache = module[name]?.__cache__;
      let count = 0;
      if (cache) for (const key in cache) if (Object.hasOwn(cache, key)) count++;
      return [name, cache ? count : null];
    })) };
};
try {
  for (const tile of tiles) {
    const name = `tile-${tile.x}-${tile.z}`,
      old = m.tiles.find((t: any) => t.name === name);
    if (old) {
      if (old.hash) {
        const b = readFileSync(resources.resolveOutput(`${dir}/${name}.bin`));
        if (sha(b) !== old.hash) throw Error("Corrupt navigation tile");
        builder.add(b);
      }
      continue;
    }
    const inherited = reusable.get(name);
    if (inherited && !auditNames.has(name)) {
      const bytes = inherited.hash ? readFileSync(resolve(dirname(reuseFile!), `${name}.bin`)) : null;
      if (bytes && sha(bytes) !== inherited.hash) throw Error("Corrupt reuse tile");
      if (bytes) { resources.writeFileAtomic(`${dir}/${name}.bin`, bytes, { replace: false }); builder.add(bytes); }
      m.tiles.push({ ...inherited, reuse: { fingerprint: reuse.fingerprint, hash: inherited.hash } });
      resources.writeJsonAtomic(manifestFile, m);
      continue;
    }
    if (generated >= maxNewTiles) break;
    resources.assertCapacity(64 * MiB, name);
    const bounds = structuredClone(tile.bounds);
    bounds.min.x -= halo;
    bounds.min.z -= halo;
    bounds.max.x += halo;
    bounds.max.z += halo;
    const geometry = exposedVoxelMesh(
      loaded.space,
      bounds,
      loaded.manifest.bounds.min,
      loaded.manifest.voxelResolution,
      { boundary: "source" },
    );
    const bytes = builder.build(
      geometry.positions,
      geometry.indices,
      tile,
      true,
      (x, y, z) => !!stand(loaded.space.collision, { x, y, z }),
    );
    const hash = bytes
      ? resources.writeFileAtomic(`${dir}/${name}.bin`, bytes, {
          replace: false,
        })
      : null;
    if (inherited && hash !== inherited.hash) throw Error(`Rebuilt reuse audit differs: ${name}`);
    if (bytes) builder.add(bytes);
    m.tiles.push({
      name,
      bounds: tile.bounds,
      x: tile.x,
      z: tile.z,
      hash,
      geometry: geometry.diagnostics,
      ...builder.lastDiagnostic,
      ...(inherited ? { rebuiltAudit: { fingerprint: reuse.fingerprint, hash: inherited.hash } } : {}),
    });
    generated++;
    m.lastRun = { runId, outcome: "running", startedWith, generated, maxNewTiles, memory: memory() };
    resources.writeJsonAtomic(manifestFile, m);
    console.log(JSON.stringify({ tile: m.tiles.at(-1), run: m.lastRun }));
  }
  if (m.tiles.length < tiles.length) {
    m.lastRun.outcome = "checkpointed";
    resources.writeJsonAtomic(manifestFile, m);
    console.log(JSON.stringify({ output: resources.resolveOutput(manifestFile), outcome: "checkpointed",
      generated, completedTiles: m.tiles.length, totalTiles: tiles.length, runId }));
  } else {
  const bytes = exportNavMesh(builder.mesh),
    navHash = resources.writeFileAtomic(`${dir}/nav.bin`, bytes, {
      replace: false,
    });
  const [positions, indices] = getNavMeshPositionsAndIndices(builder.mesh);
  const display = {
    positionsHash: resources.writeFileAtomic(
      `${dir}/nav-positions.bin`,
      Buffer.from(new Float32Array(positions).buffer),
    ),
    indicesHash: resources.writeFileAtomic(
      `${dir}/nav-indices.bin`,
      Buffer.from(new Uint32Array(indices).buffer),
    ),
  };
  Object.assign(m, {
    lastRun: { runId, outcome: "complete", startedWith, generated, maxNewTiles, memory: memory() },
    status: job.analysisOnly ? "analysis-complete" : "complete",
    usage: job.analysisOnly
      ? "offline-native-verification-only"
      : "viewer-navigation",
    scene: "dayun",
    bounds: job.bounds,
    body: BODY,
    sourceHash: loaded.sourceHash,
    collisionSource: loaded.manifest,
    surfaceCatalog: catalog,
    requireSurfaceCatalog: true,
    markers: job.markers ?? [],
    start: job.start,
    navHash,
    display,
    coverage: {
      completeScene: false,
      explicitScope: job.bounds,
      collisionTileIds: loaded.loadedTileIds,
    },
  });
  resources.writeJsonAtomic(manifestFile, m);
  console.log(
    JSON.stringify({ output: resources.resolveOutput(manifestFile), outcome: "complete", navHash, runId }),
  );
  }
} catch (error) {
  resources.writeJsonAtomic(`${dir}/runs/failed-${runId}.json`, {
    runId, outcome: "failed", fingerprint, startedWith, generated, maxNewTiles,
    error: error instanceof Error ? error.stack : String(error), memory: process.memoryUsage(),
  }, { recovery: true, replace: false });
  throw error;
} finally {
  builder.destroy();
  loaded.destroy();
}
