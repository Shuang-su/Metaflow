/** Lightweight localization over the full support inventory; no floor identity inference. */
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import {
  createOfflineResources,
  offlineResourceOptions,
  MiB,
} from "../src/offline-resources";
const resources = createOfflineResources({
  ...offlineResourceOptions(),
  taskOutputBytes: 32 * MiB,
});
const m = JSON.parse(
  readFileSync(
    resources.resolveOutput("dayun/support-index-v2/manifest.json"),
    "utf8",
  ),
);
const manifest = JSON.parse(
  readFileSync(resources.resolveOutput("dayun/collision-source.json"), "utf8"),
);
const tiles = [...m.tiles]
  .sort((a, b) => b.multiSurfaceColumns - a.multiSurfaceColumns)
  .slice(0, 12);
const rows: any[] = [];
for (const row of tiles) {
  const compressed = readFileSync(resources.resolveOutput(row.file));
  if (createHash("sha256").update(compressed).digest("hex") !== row.hash)
    throw Error("Support inventory hash mismatch");
  const buf = gunzipSync(compressed),
    v = new Uint16Array(buf.buffer, buf.byteOffset, buf.length / 2),
    n = v.length / 5;
  const { x0, z0 } = row.rawCore,
    r = row.resolution,
    blockCells = Math.round(8 / r),
    blocks = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    if (v[3 * n + i] * r < 1.7 - 1e-9) continue;
    const key = `${Math.floor((v[i] - x0) / blockCells)},${Math.floor((v[n + i] - z0) / blockCells)}`;
    let list = blocks.get(key);
    if (!list) blocks.set(key, (list = []));
    list.push(i);
  }
  const tileLeads: any[] = [];
  for (const [key, list] of blocks) {
    const [bx, bz] = key.split(",").map(Number),
      hist = new Map<number, number>();
    for (const i of list)
      hist.set(v[2 * n + i], (hist.get(v[2 * n + i]) ?? 0) + 1);
    const heights = [...hist.keys()]
      .map((y) => ({
        y,
        count: [-2, -1, 0, 1, 2].reduce(
          (s, d) => s + (hist.get(y + d) ?? 0),
          0,
        ),
      }))
      .sort((a, b) => b.count - a.count);
    const peaks: typeof heights = [];
    for (const peak of heights) {
      if (peaks.every((p) => Math.abs(p.y - peak.y) > 4)) peaks.push(peak);
      if (peaks.length === 8) break;
    }
    let best: any = null;
    for (let a = 0; a < peaks.length; a++)
      for (let b = a + 1; b < peaks.length; b++) {
        if (Math.abs(peaks[a].y - peaks[b].y) * r < 2) continue;
        const lower = Math.max(peaks[a].y, peaks[b].y),
          upper = Math.min(peaks[a].y, peaks[b].y),
          size = blockCells * blockCells;
        const lows = new Int32Array(size).fill(-1),
          highs = new Int32Array(size).fill(-1);
        for (const i of list) {
          const cell =
            v[i] -
            x0 -
            bx * blockCells +
            (v[n + i] - z0 - bz * blockCells) * blockCells;
          if (Math.abs(v[2 * n + i] - lower) <= 2) lows[cell] = i;
          if (Math.abs(v[2 * n + i] - upper) <= 2) highs[cell] = i;
        }
        const seen = new Uint8Array(size),
          queue = new Int32Array(size);
        let largest: number[] = [];
        for (let seed = 0; seed < size; seed++) {
          if (seen[seed] || lows[seed] < 0 || highs[seed] < 0) continue;
          let read = 0,
            write = 1;
          queue[0] = seed;
          seen[seed] = 1;
          while (read < write) {
            const c = queue[read++],
              x = c % blockCells,
              z = Math.floor(c / blockCells);
            for (const next of [
              x ? c - 1 : -1,
              x + 1 < blockCells ? c + 1 : -1,
              z ? c - blockCells : -1,
              z + 1 < blockCells ? c + blockCells : -1,
            ])
              if (
                next >= 0 &&
                !seen[next] &&
                lows[next] >= 0 &&
                highs[next] >= 0
              ) {
                seen[next] = 1;
                queue[write++] = next;
              }
          }
          if (write > largest.length)
            largest = Array.from(queue.subarray(0, write));
        }
        if (
          largest.length < 1000 ||
          (best && best.overlapCells >= largest.length)
        )
          continue;
        const cx =
            largest.reduce((s, c) => s + (c % blockCells), 0) / largest.length,
          cz =
            largest.reduce((s, c) => s + Math.floor(c / blockCells), 0) /
            largest.length;
        const center = largest.reduce((a, b) =>
          Math.hypot((a % blockCells) - cx, Math.floor(a / blockCells) - cz) <
          Math.hypot((b % blockCells) - cx, Math.floor(b / blockCells) - cz)
            ? a
            : b,
        );
        const world = (i: number) => ({
          x: -(row.rawGridMin[0] + (v[i] + 0.5) * r),
          y: -(row.rawGridMin[1] + v[2 * n + i] * r),
          z: row.rawGridMin[2] + (v[n + i] + 0.5) * r,
        });
        best = {
          block: [bx, bz],
          overlapCells: largest.length,
          connectedOverlapArea: largest.length * r * r,
          lowerSupport: world(lows[center]),
          upperSupport: world(highs[center]),
          heightSeparation: (lower - upper) * r,
          nearHorizontalBandTolerance: 2 * r,
          minimumRecordedClearance: 1.7,
          lowerClearance: v[3 * n + lows[center]] * r,
          upperClearance: v[3 * n + highs[center]] * r,
          evidence: {
            index: row.file,
            indexHash: row.hash,
            sourceHash: row.sourceHash,
          },
        };
      }
    if (best) tileLeads.push(best);
  }
  tileLeads.sort((a, b) => b.connectedOverlapArea - a.connectedOverlapArea);
  rows.push({
    tile: row.id,
    multiSurfaceColumns: row.multiSurfaceColumns,
    leads: tileLeads.slice(0, 5),
  });
  console.log(
    JSON.stringify({
      tile: row.id,
      leads: tileLeads.length,
      best: tileLeads[0],
    }),
  );
  resources.assertCapacity(2 * MiB, "overlapping support evidence");
  global.gc?.();
}
const best = rows
  .filter((r) => r.leads.length)
  .sort(
    (a, b) => b.leads[0].connectedOverlapArea - a.leads[0].connectedOverlapArea,
  );
resources.writeJsonAtomic("dayun/overlapping-support-leads.json", {
  version: 1,
  sourceHash: manifest.sourceHash,
  fullInventoryTiles: m.expectedTiles ?? 293,
  screenedTiles: tiles.map((t) => t.id),
  selection:
    "Top 12 owner-core tiles by multi-support columns; all their indexed samples checked",
  semantics:
    "Same X/Z overlap with clearance is geometric evidence only; near-horizontal bands are candidate analysis, never floor identity or walking proof",
  confirmedFloors: 0,
  confirmedConnections: 0,
  bestTiles: best.slice(0, 3),
  rows,
});
console.log(
  JSON.stringify({
    bestTiles: best.slice(0, 3).map((r) => ({ tile: r.tile, ...r.leads[0] })),
  }),
);
