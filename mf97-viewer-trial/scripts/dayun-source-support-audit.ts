/** Verifies both owner cores and each source's halos, without collapsing overlap heights. */
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
const read = (path: string) =>
  JSON.parse(readFileSync(resources.resolveOutput(path), "utf8"));
const core = read("dayun/support-index-v2/manifest.json"),
  halo = read("dayun/support-halo-index-v3/manifest.json"),
  source = read("dayun/collision-source.json");
const hash = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
if (
  !core.complete ||
  !halo.complete ||
  core.expectedTiles !== 293 ||
  halo.expectedTiles !== core.expectedTiles
)
  throw Error("Incomplete Dayun core/halo inventories");
const rows = source.tiles.map((descriptor: any) => {
  const a = core.tiles.find((t: any) => t.id === descriptor.id),
    b = halo.tiles.find((t: any) => t.id === descriptor.id);
  if (
    !a ||
    !b ||
    a.sourceHash !== b.sourceHash ||
    a.sourceHash !== `${descriptor.metadataHash}:${descriptor.binaryHash}`
  )
    throw Error("Source identity mismatch");
  const expectedColumns = a.dimensions[0] * a.dimensions[2];
  if (a.columns + b.columns !== expectedColumns)
    throw Error("A source column was omitted or counted twice");
  for (const row of [a, b]) {
    const bytes = readFileSync(resources.resolveOutput(row.file));
    if (
      hash(bytes) !== row.hash ||
      gunzipSync(bytes).length !== row.supportSpans * 10
    )
      throw Error("Damaged core/halo support data");
  }
  return {
    id: a.id,
    sourceHash: a.sourceHash,
    sourceColumns: expectedColumns,
    coreColumns: a.columns,
    haloColumns: b.columns,
    supportSpans: a.supportSpans + b.supportSpans,
    lowClearanceStrata: a.lowClearance + b.lowClearance,
    outputBytes: a.compressedBytes + b.compressedBytes,
    sourceGridBounds: descriptor.meta.gridBounds,
  };
});
const sum = (key: string) =>
  rows.reduce((n: number, row: any) => n + row[key], 0);
const report = {
  version: 1,
  sourceHash: source.sourceHash,
  expectedTiles: 293,
  verifiedTiles: rows.length,
  completeSourceColumnCoverage: true,
  sampleStride: 1,
  heightRange: "all original source heights",
  minimumRecordedClearance: core.minClearance,
  sourceColumnsIncludingOverlaps: sum("sourceColumns"),
  ownerCoreColumns: sum("coreColumns"),
  sourceHaloColumns: sum("haloColumns"),
  sourceSupportSpansIncludingOverlaps: sum("supportSpans"),
  lowClearanceStrata: sum("lowClearanceStrata"),
  outputBytes: sum("outputBytes"),
  knownCoverage:
    "Runtime takes the union of actual source grid bounds; the owner-core complement alone is NOT globally unknown",
  confirmedFloors: 0,
  confirmedConnections: 0,
  sourceModified: false,
  rows,
};
resources.writeJsonAtomic("dayun/source-support-audit.json", report);
console.log(JSON.stringify({ ...report, rows: undefined }));
