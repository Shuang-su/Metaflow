/** Full-resolution, all-height sparse support inventory. No navigation/floor certification. */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { FlippedVoxelCollision } from "../../metaflow-viewer/src/collision/voxel-collision";
import { solidColumn, type VoxelSource } from "../src/ground/spans";
import {
  rawToWorldBounds,
  type CollisionSourceManifest,
  type CollisionSourceTile,
} from "../../mf79-viewer-trial/src/collision-source";
import {
  createOfflineResources,
  offlineResourceOptions,
  MiB,
} from "../src/offline-resources";
const args = process.argv.slice(2),
  argument = (name: string, fallback: string) =>
    args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const base = argument(
  "--source",
  "/Volumes/Prism/Metaflow/data/Shenzhen/250917 Dayun/tiled-voxel",
);
const indexPath = resolve(base, "voxel-tiles.json"),
  indexBytes = readFileSync(indexPath),
  input = JSON.parse(indexBytes.toString());
const hash = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
const resources = createOfflineResources({
  ...offlineResourceOptions(args),
  taskOutputBytes: 1536 * MiB,
});
const haloOnly = args.includes("--halo");
const only = argument("--tile", ""),
  threshold = 1.5,
  rows: any[] = [];
const output = haloOnly
    ? "dayun/support-halo-index-v3"
    : "dayun/support-index-v2",
  manifestFile = `${output}/manifest.json`;
const old = existsSync(resources.resolveOutput(manifestFile))
  ? JSON.parse(readFileSync(resources.resolveOutput(manifestFile), "utf8"))
  : null;
if (
  old &&
  (old.inputManifestHash !== hash(indexBytes) ||
    old.algorithm !==
      (haloOnly ? "all-source-halo-soa-v3" : "full-column-soa-v2") ||
    old.minClearance !== threshold)
)
  throw Error("Support index source/algorithm mismatch");
const selected = only
  ? input.tiles.filter((t: any) => t.id === only)
  : input.tiles;
if (!selected.length) throw Error("Unknown tile");
const descriptors: CollisionSourceTile[] = [];
for (const tile of selected) {
  const start = performance.now(),
    file = resolve(base, tile.url),
    metadataBytes = readFileSync(file),
    meta = JSON.parse(metadataBytes.toString());
  const binary = readFileSync(file.replace(/\.json$/, ".bin")),
    binaryHash = hash(binary),
    metadataHash = hash(metadataBytes);
  const descriptor: CollisionSourceTile = {
    id: tile.id,
    coreBounds: rawToWorldBounds(tile.coreBounds, "flipXY"),
    dataBounds: rawToWorldBounds(meta.gridBounds, "flipXY"),
    meta,
    metadataHash,
    binaryHash,
    binaryBytes: binary.length,
    binaryUrl: `/repository-data/Shenzhen/250917%20Dayun/tiled-voxel/${tile.url.replace(/\.json$/, ".bin")}`,
  };
  descriptors.push(descriptor);
  const previous = old?.tiles.find((r: any) => r.id === tile.id);
  if (previous && previous.sourceHash === `${metadataHash}:${binaryHash}`) {
    const bytes = readFileSync(resources.resolveOutput(previous.file));
    if (hash(bytes) !== previous.hash)
      throw Error(`Interrupted/corrupt support tile: ${tile.id}`);
    rows.push(previous);
    console.log(JSON.stringify({ id: tile.id, resumed: true }));
    continue;
  }
  if (previous) throw Error(`Changed source tile: ${tile.id}`);
  resources.assertCapacity(32 * MiB, `support tile ${tile.id}`);
  const words = new Uint32Array(
      binary.buffer,
      binary.byteOffset,
      binary.length / 4,
    ),
    n = meta.nodeWordCount ?? meta.nodeCount;
  const collision = new FlippedVoxelCollision(
      meta,
      words.subarray(0, n),
      words.subarray(n),
    ),
    r = collision.voxelResolution;
  const source: VoxelSource = {
    collision,
    min: meta.gridBounds.min,
    max: meta.gridBounds.max,
    flipXY: true,
  };
  const x0 = Math.max(
      0,
      Math.round((tile.coreBounds.min[0] - source.min[0]) / r),
    ),
    x1 = Math.min(
      collision.numVoxelsX,
      Math.round((tile.coreBounds.max[0] - source.min[0]) / r),
    );
  const z0 = Math.max(
      0,
      Math.round((tile.coreBounds.min[2] - source.min[2]) / r),
    ),
    z1 = Math.min(
      collision.numVoxelsZ,
      Math.round((tile.coreBounds.max[2] - source.min[2]) / r),
    );
  if (
    Math.max(collision.numVoxelsX, collision.numVoxelsY, collision.numVoxelsZ) >
    65535
  )
    throw Error("Index encoding capacity exceeded");
  let packed = new Uint16Array(5 * 65536),
    cursor = 0,
    columns = 0,
    multi = 0,
    allSolidRuns = 0,
    lowClearance = 0;
  const histogram = new Map<number, number>();
  for (
    let iz = haloOnly ? 0 : z0;
    iz < (haloOnly ? collision.numVoxelsZ : z1);
    iz++
  )
    for (
      let ix = haloOnly ? 0 : x0;
      ix < (haloOnly ? collision.numVoxelsX : x1);
      ix++
    ) {
      if (haloOnly && ix >= x0 && ix < x1 && iz >= z0 && iz < z1) continue;
      columns++;
      const runs = solidColumn(source, ix, iz);
      allSolidRuns += runs.length;
      let inColumn = 0;
      for (let k = 0; k < runs.length; k++) {
        const [lo, hi] = runs[k],
          clearance = lo - (runs[k - 1]?.[1] ?? 0);
        if (clearance * r + 1e-8 < threshold) {
          lowClearance++;
          continue;
        }
        if (cursor + 5 > packed.length) {
          const larger = new Uint16Array(packed.length * 2);
          larger.set(packed);
          packed = larger;
        }
        packed.set([ix, iz, lo, clearance, hi - lo], cursor);
        cursor += 5;
        inColumn++;
        const bucket = Math.floor(-(source.min[1] + lo * r) / 0.5);
        histogram.set(bucket, (histogram.get(bucket) ?? 0) + 1);
      }
      if (inColumn > 1) multi++;
    }
  const count = cursor / 5,
    soa = new Uint16Array(cursor);
  for (let i = 0; i < count; i++)
    for (let k = 0; k < 5; k++) soa[k * count + i] = packed[5 * i + k];
  const bytes = Buffer.from(soa.buffer),
    compressed = gzipSync(bytes, { level: 6 });
  if (!gunzipSync(compressed).equals(bytes))
    throw Error("Support data roundtrip mismatch");
  const fileOut = `${output}/tiles/${tile.id}.u16.gz`,
    digest = resources.writeFileAtomic(fileOut, compressed, { replace: false });
  const row = {
    id: tile.id,
    file: fileOut,
    hash: digest,
    sourceHash: `${metadataHash}:${binaryHash}`,
    coreBounds: descriptor.coreBounds,
    dataBounds: descriptor.dataBounds,
    rawGridMin: source.min,
    resolution: r,
    dimensions: [
      collision.numVoxelsX,
      collision.numVoxelsY,
      collision.numVoxelsZ,
    ],
    rawCore: { x0, x1, z0, z1 },
    columns,
    supportSpans: cursor / 5,
    multiSurfaceColumns: multi,
    allSolidRuns,
    lowClearance,
    heightHistogramAnalysisOnly: [...histogram].sort((a, b) => a[0] - b[0]),
    packedBytes: bytes.length,
    compressedBytes: compressed.length,
    milliseconds: performance.now() - start,
    rss: process.memoryUsage().rss,
  };
  rows.push(row);
  const merged = [
    ...(old?.tiles ?? []).filter((r: any) => !rows.some((v) => v.id === r.id)),
    ...rows,
  ];
  resources.writeJsonAtomic(manifestFile, {
    version: 1,
    algorithm: haloOnly ? "all-source-halo-soa-v3" : "full-column-soa-v2",
    source: base,
    inputManifestHash: hash(indexBytes),
    expectedTiles: input.tiles.length,
    complete: merged.length === input.tiles.length,
    tiles: merged,
    minClearance: threshold,
    stride: 1,
    encoding:
      "uint16-le arrays ix[N],iz[N],rawSupportY[N],clearanceCells[N],thicknessCells[N]; flipped world X/Y",
    coverage: haloOnly
      ? "every metadata X/Z column outside its owner core, every source Y stratum; combined with core index covers all source columns"
      : "every core X/Z column inside its owner metadata grid, every source Y stratum; low-clearance strata counted separately",
    confirmedFloors: 0,
    confirmedConnections: 0,
  });
  console.log(
    JSON.stringify({
      ...row,
      heightHistogramAnalysisOnly: undefined,
      coreBounds: undefined,
      dataBounds: undefined,
    }),
  );
  (globalThis as any).gc?.();
}
if (!only) {
  const sourceHash = hash(
    JSON.stringify({
      manifestHash: hash(indexBytes),
      tiles: descriptors.map((t) => [t.id, t.metadataHash, t.binaryHash]),
      transform: "flipXY",
    }),
  );
  const collisionSource: CollisionSourceManifest = {
    version: 1,
    kind: "tiled",
    sourceHash,
    transform: "flipXY",
    voxelResolution: input.voxelResolution,
    bounds: rawToWorldBounds(input.fullBounds, "flipXY"),
    tiles: descriptors,
  };
  resources.writeJsonAtomic("dayun/collision-source.json", collisionSource, {
    replace: false,
  });
  console.log(
    JSON.stringify({
      complete: true,
      expectedTiles: input.tiles.length,
      scannedTiles: rows.length,
      sourceHash,
      resources: resources.snapshot(),
    }),
  );
}
