import { replayNativePolyline } from "../src/dayun-native-proof";
/** Geometry adjacency finds leads; only unchanged native walking can confirm a connection. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import {
  createOfflineResources,
  offlineResourceOptions,
  MiB,
} from "../src/offline-resources";
import { collisionSourceFile } from "../../mf79-viewer-trial/scripts/source";
import {
  BODY,
  stand,
  support,
} from "../../mf79-viewer-trial/src/native-motion";
const args = process.argv.slice(2),
  only = args[args.indexOf("--tile") + 1];
if (!args.includes("--tile") || !only)
  throw Error("Select --tile from the complete support inventory");
const offset = args.includes("--offset")
  ? Number(args[args.indexOf("--offset") + 1])
  : 0;
const batchSize = args.includes("--limit")
  ? Number(args[args.indexOf("--limit") + 1])
  : 24;
if (
  !Number.isSafeInteger(offset) ||
  offset < 0 ||
  !Number.isSafeInteger(batchSize) ||
  batchSize < 1
)
  throw Error("Invalid research batch range");
const resources = createOfflineResources({
  ...offlineResourceOptions(args),
  taskOutputBytes: 128 * MiB,
});
const hash = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const m = JSON.parse(
  readFileSync(
    resources.resolveOutput("dayun/support-index-v2/manifest.json"),
    "utf8",
  ),
);
const row = m.tiles.find((t: any) => t.id === only);
if (!row) throw Error("Support tile not indexed yet");
const compressed = readFileSync(resources.resolveOutput(row.file));
if (hash(compressed) !== row.hash) throw Error("Support index hash mismatch");
const buffer = gunzipSync(compressed),
  values = new Uint16Array(buffer.buffer, buffer.byteOffset, buffer.length / 2),
  count = values.length / 5;
const file = resolve(m.source, `tiles/${only}/walk.voxel.json`),
  json = readFileSync(file),
  meta = JSON.parse(json.toString()),
  bin = readFileSync(file.replace(/\.json$/, ".bin"));
if (`${hash(json)}:${hash(bin)}` !== row.sourceHash)
  throw Error("Collision source changed since index");
const queryBounds = structuredClone(row.coreBounds);
queryBounds.min.x -= BODY.radius * 2;
queryBounds.min.z -= BODY.radius * 2;
queryBounds.max.x += BODY.radius * 2;
queryBounds.max.z += BODY.radius * 2;
const loaded = await collisionSourceFile(
  resources.resolveOutput("dayun/collision-source.json"),
  queryBounds,
);
const collision = loaded.space.collision;
const r = row.resolution,
  { x0, x1, z0, z1 } = row.rawCore,
  width = x1 - x0,
  depth = z1 - z0;
const parent = new Int32Array(count),
  starts = new Int32Array(Math.max(0, width * depth)).fill(-1),
  ends = new Int32Array(starts.length);
const X = (i: number) => values[i],
  Z = (i: number) => values[count + i],
  Y = (i: number) => values[2 * count + i];
const eligible = (i: number) => values[3 * count + i] * r >= 1.7 - 1e-8;
const cell = (x: number, z: number) => x - x0 + (z - z0) * width;
for (let i = 0; i < count; i++) {
  parent[i] = i;
  const c = cell(X(i), Z(i));
  if (starts[c] < 0) starts[c] = i;
  ends[c] = i + 1;
}
const root = (i: number): number => {
  while (parent[i] !== i) {
    parent[i] = parent[parent[i]];
    i = parent[i];
  }
  return i;
};
function near(x: number, z: number, y: number): number[] {
  if (x < x0 || x >= x1 || z < z0 || z >= z1) return [];
  const c = cell(x, z),
    out: number[] = [];
  for (let j = starts[c]; j >= 0 && j < ends[c]; j++)
    if (eligible(j) && Math.abs(Y(j) - y) <= 3) out.push(j);
  return out;
}
const neighbors = (i: number) => {
  const out: number[] = [],
    x = X(i),
    z = Z(i),
    y = Y(i);
  for (let dz = -1; dz <= 1; dz++)
    for (let dx = -1; dx <= 1; dx++) {
      if (
        (!dx && !dz) ||
        (dx && dz && (!near(x + dx, z, y).length || !near(x, z + dz, y).length))
      )
        continue;
      out.push(...near(x + dx, z + dz, y));
    }
  return out;
};
for (let i = 0; i < count; i++) {
  if (!eligible(i)) continue;
  // All eight directions are represented; repeated components may wind or reverse heading.
  for (const j of neighbors(i))
    if (j > i) {
      const a = root(i),
        b = root(j);
      if (a !== b) parent[b] = a;
    }
}
const components = new Map<
  number,
  {
    count: number;
    low: number;
    high: number;
    stableLow?: number;
    stableHigh?: number;
    stableCount: number;
  }
>();
for (let i = 0; i < count; i++)
  if (eligible(i)) {
    const k = root(i),
      c = components.get(k);
    if (!c) components.set(k, { count: 1, low: i, high: i, stableCount: 0 });
    else {
      c.count++;
      if (Y(i) > Y(c.low)) c.low = i;
      if (Y(i) < Y(c.high)) c.high = i;
    }
  }
const world = (i: number) => ({
  x: -(meta.gridBounds.min[0] + (X(i) + 0.5) * r),
  y: -(meta.gridBounds.min[1] + Y(i) * r),
  z: meta.gridBounds.min[2] + (Z(i) + 0.5) * r,
});
// Extreme isolated voxels are poor camera stands. Prefer level, body-width endpoint
// neighborhoods, while keeping the full graph (including treads/ramps) unchanged.
for (let i = 0; i < count; i++)
  if (eligible(i)) {
    const x = X(i),
      z = Z(i),
      y = Y(i),
      c = components.get(root(i))!;
    if (
      ![
        [4, 0],
        [-4, 0],
        [0, 4],
        [0, -4],
      ].every(([dx, dz]) =>
        near(x + dx, z + dz, y).some((j) => Math.abs(Y(j) - y) <= 1),
      )
    )
      continue;
    c.stableCount++;
    if (c.stableLow === undefined || y > Y(c.stableLow)) c.stableLow = i;
    if (c.stableHigh === undefined || y < Y(c.stableHigh)) c.stableHigh = i;
  }
const candidates = [...components]
  .filter(
    ([, c]) =>
      c.stableLow !== undefined &&
      c.stableHigh !== undefined &&
      (Y(c.stableLow) - Y(c.stableHigh)) * r >= 2,
  )
  .map(
    ([id, c]) =>
      [id, { ...c, low: c.stableLow!, high: c.stableHigh! }] as const,
  )
  .sort((a, b) => b[1].count - a[1].count);
const proofs: any[] = [];
for (const [component, c] of candidates.slice(offset, offset + batchSize)) {
  // The bounded candidate batch is a research scheduler, not a runtime navigation retry limit.
  const first = stand(collision, world(c.low)),
    last = stand(collision, world(c.high));
  if (!first || !last) {
    proofs.push({
      component,
      count: c.count,
      from: world(c.low),
      to: world(c.high),
      status: "endpoint-clearance",
      nativeSupport: [world(c.low), world(c.high)].map((p) =>
        support(collision, { ...p, y: p.y + BODY.eye + BODY.hover }),
      ),
      body: BODY,
      sourceHash: row.sourceHash,
    });
    continue;
  }
  const prev = new Int32Array(count).fill(-1),
    queue = new Int32Array(c.count + 1);
  let read = 0,
    write = 1;
  queue[0] = c.low;
  prev[c.low] = c.low;
  while (read < write && prev[c.high] < 0) {
    const i = queue[read++];
    for (const j of neighbors(i))
      if (prev[j] < 0 && root(j) === component) {
        prev[j] = i;
        queue[write++] = j;
      }
  }
  if (prev[c.high] < 0) {
    proofs.push({ component, status: "graph-disconnected" });
    continue;
  }
  const indices = [c.high];
  while (indices.at(-1) !== c.low) indices.push(prev[indices.at(-1)!]);
  indices.reverse();
  const path = indices.map((i) => ({
    ...world(i),
    y: world(i).y + BODY.eye + BODY.hover,
  }));
  path[0] = first;
  path[path.length - 1] = last;
  const forward = replayNativePolyline(collision, path),
    reverse = replayNativePolyline(collision, [...path].reverse());
  const result = {
    component,
    count: c.count,
    rise: Math.abs(first.y - last.y),
    path,
    forward,
    reverse,
    status:
      forward.ok && reverse.ok
        ? "native-bidirectional-height-connection"
        : "native-walk-rejected",
    semantics:
      "A verified height connection is not a named floor or staircase until visual review",
    sourceHash: row.sourceHash,
  };
  proofs.push(result);
  console.log(
    JSON.stringify({
      component,
      rise: result.rise,
      points: path.length,
      forward: forward.reason,
      reverse: reverse.reason,
    }),
  );
  resources.assertCapacity(8 * MiB, "native connection evidence");
}
const result = {
  version: 2,
  endpointSelection:
    "level support at four 32cm offsets; native body check still required",
  tile: only,
  sourceHash: row.sourceHash,
  collisionFingerprint: loaded.sourceHash,
  nativeLoadedTiles: loaded.loadedTileIds,
  nativeCollision:
    "original TiledVoxelCollision aggregation over all intersecting source neighbors",
  supportIndexHash: row.hash,
  allHeight: true,
  allDirections: true,
  fullSceneSearch: false,
  scope: row.coreBounds,
  boundaryCrossings: "not covered by this per-tile discovery batch",
  adjacentCellMaxRise: 3 * r,
  nativeParametersUnchanged: true,
  automaticJump: false,
  components: components.size,
  candidates: candidates.length,
  batchOffset: offset,
  batchSize,
  examined: proofs.length,
  pending: Math.max(0, candidates.length - offset - proofs.length),
  verifiedBidirectional: proofs.filter(
    (p) => p.status === "native-bidirectional-height-connection",
  ).length,
  proofs,
};
resources.writeJsonAtomic(
  `dayun/connections-v2/${only}${offset ? `-from-${offset}` : ""}.json`,
  result,
);
console.log(JSON.stringify({ ...result, proofs: undefined }));

loaded.destroy();
