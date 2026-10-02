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
  taskOutputBytes: 4 * MiB,
});
const m = JSON.parse(
  readFileSync(
    resources.resolveOutput("dayun/support-index-v2/manifest.json"),
    "utf8",
  ),
);
const source = JSON.parse(
  readFileSync(resources.resolveOutput("dayun/collision-source.json"), "utf8"),
);
const hash = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
if (
  !m.complete ||
  m.tiles.length !== m.expectedTiles ||
  source.tiles.length !== m.expectedTiles
)
  throw Error("Owner-core tile inventory not completed");
const rows = m.tiles.map((row: any) => {
  const descriptor = source.tiles.find((t: any) => t.id === row.id);
  if (!descriptor) throw Error("Missing source identity");
  if (row.sourceHash !== `${descriptor.metadataHash}:${descriptor.binaryHash}`)
    throw Error("Source descriptor/index mismatch");
  const bytes = readFileSync(resources.resolveOutput(row.file));
  if (hash(bytes) !== row.hash) throw Error("Support chunk hash mismatch");
  const packed = gunzipSync(bytes);
  if (packed.length !== row.supportSpans * 10)
    throw Error("Support encoding mismatch");
  const b = row.coreBounds,
    expected =
      Math.round((b.max.x - b.min.x) / row.resolution) *
      Math.round((b.max.z - b.min.z) / row.resolution);
  return {
    id: row.id,
    expectedCoreColumns: expected,
    indexedKnownColumns: row.columns,
    columnsOutsideOwnerGrid: expected - row.columns,
    supportSpans: row.supportSpans,
    lowClearanceStrata: row.lowClearance,
    multiSurfaceColumns: row.multiSurfaceColumns,
    outputBytes: bytes.length,
    sourceHash: row.sourceHash,
    hash: row.hash,
  };
});
const sum = (key: string) =>
  rows.reduce((n: number, row: any) => n + row[key], 0);
const report = {
  version: 1,
  scene: "dayun",
  sourceHash: source.sourceHash,
  expectedTiles: m.expectedTiles,
  indexedTiles: rows.length,
  allTileInventoryComplete: true,
  stride: 1,
  allSourceHeights: true,
  minClearance: m.minClearance,
  expectedCoreColumns: sum("expectedCoreColumns"),
  indexedKnownColumns: sum("indexedKnownColumns"),
  columnsOutsideOwnerGrid: sum("columnsOutsideOwnerGrid"),
  supportSpans: sum("supportSpans"),
  lowClearanceStrata: sum("lowClearanceStrata"),
  multiSurfaceColumns: sum("multiSurfaceColumns"),
  outputBytes: sum("outputBytes"),
  scanMilliseconds: m.tiles.reduce(
    (n: number, r: any) => n + r.milliseconds,
    0,
  ),
  peakRecordedRss: Math.max(...m.tiles.map((r: any) => r.rss)),
  sourceModified: false,
  confirmedFloors: 0,
  confirmedConnections: 0,
  warning:
    "Owner-core inventory is not complete source support coverage: neighboring halos may contain additional surfaces. Use source-support-audit.json for combined source coverage.",
  rows,
};
resources.writeJsonAtomic("dayun/support-index-v2/audit.json", report);
console.log(JSON.stringify({ ...report, rows: undefined }));
