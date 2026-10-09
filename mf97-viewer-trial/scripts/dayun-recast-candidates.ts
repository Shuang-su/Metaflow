/** Existing Detour connected-surface query supplies analysis leads, never floor IDs. */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { init, importNavMesh, NavMeshQuery, Detour } from "../../mf79-viewer-trial/src/recast-runtime";
import { sha } from "../../mf79-viewer-trial/scripts/source";
import { BODY } from "../../mf79-viewer-trial/src/native-motion";
import {
  createOfflineResources,
  offlineResourceOptions,
} from "../src/offline-resources";
const args = process.argv.slice(2);
const option = (name: string) => {
  const i = args.indexOf(name);
  if (i < 0 || !args[i + 1]) throw Error(`Missing ${name}`);
  return args[i + 1];
};
const minimumRise = args.includes("--minimum-rise")
  ? Number(option("--minimum-rise"))
  : 2;
if (!Number.isFinite(minimumRise) || minimumRise <= 0)
  throw Error("Invalid discovery height range");
const file = option("--manifest"),
  m = JSON.parse(readFileSync(file, "utf8"));
if (m.status !== "analysis-complete")
  throw Error("Requires analysis-only asset");
const bytes = readFileSync(resolve(dirname(file), "nav.bin"));
if (sha(bytes) !== m.navHash) throw Error("NavMesh fingerprint mismatch");
await init();
const nav = importNavMesh(bytes).navMesh,
  query = new NavMeshQuery(nav, { maxNodes: 65535 });
try {
  const center = {
    x: (m.bounds.min.x + m.bounds.max.x) / 2,
    y: (m.bounds.min.y + m.bounds.max.y) / 2,
    z: (m.bounds.min.z + m.bounds.max.z) / 2,
  };
  const half = {
    x: (m.bounds.max.x - m.bounds.min.x) / 2,
    y: (m.bounds.max.y - m.bounds.min.y) / 2,
    z: (m.bounds.max.z - m.bounds.min.z) / 2,
  };
  const found = query.queryPolygons(center, half, { maxPolys: 65535 });
  const incomplete = (status: number) =>
    !!(
      status &
      (Detour.DT_PARTIAL_RESULT |
        Detour.DT_BUFFER_TOO_SMALL |
        Detour.DT_OUT_OF_NODES)
    );
  if (!found.success || incomplete(found.status))
    throw Error("Navigation polygon query capacity failure");
  const point = (ref: number) => {
    const record = nav.getTileAndPolyByRef(ref);
    if (!record.success) throw Error(`Invalid navigation polygon ${ref}`);
    const { tile, poly } = record;
    const p = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < poly.vertCount(); i++) {
      const v = poly.verts(i) * 3;
      p.x += tile.verts(v);
      p.y += tile.verts(v + 1);
      p.z += tile.verts(v + 2);
    }
    p.x /= poly.vertCount();
    p.y /= poly.vertCount();
    p.z /= poly.vertCount();
    const precise = query.closestPointOnPoly(ref, p);
    return precise.success ? precise.closestPoint : p;
  };
  const unseen = new Set(found.polyRefs),
    groups: any[] = [],
    pairs: any[] = [];
  while (unseen.size) {
    const ref = unseen.values().next().value!,
      p = point(ref),
      around = query.findPolysAroundCircle(
        ref,
        p,
        Math.hypot(half.x, half.z) * 2 + 1,
        { maxPolys: 65535 },
      );
    if (!around.success || incomplete(around.status))
      throw Error("Connected surface query capacity failure");
    const reached = around.resultRefs.slice(0, around.resultCount);
    for (const r of reached) unseen.delete(r);
    unseen.delete(ref);
    const points = reached
      .map((r) => ({ ref: r, point: point(r) }))
      .sort((a, b) => a.point.y - b.point.y);
    if (!points.length) continue;
    const low = points[0],
      high = points.at(-1)!,
      rise = high.point.y - low.point.y;
    groups.push({ polygons: points.length, rise, low, high });
    if (rise >= minimumRise) {
      // Several endpoint choices avoid relying solely on an isolated extreme polygon.
      for (const fraction of [0, 0.05, 0.1]) {
        const a = points[Math.floor((points.length - 1) * fraction)],
          b = points[Math.floor((points.length - 1) * (1 - fraction))];
        if (b.point.y - a.point.y < minimumRise) continue;
        pairs.push({
          id: `detour-${ref}-${fraction}`,
          from: { ...a.point, y: a.point.y + BODY.eye + BODY.hover },
          to: { ...b.point, y: b.point.y + BODY.eye + BODY.hover },
          evidence: { navigation: m.fingerprint, polys: [a.ref, b.ref] },
          rise: b.point.y - a.point.y,
        });
      }
    }
  }
  const resources = createOfflineResources(offlineResourceOptions(args));
  resources.writeJsonAtomic(option("--output"), {
    navigationFingerprint: m.fingerprint,
    scope: m.bounds,
    discovery: "Detour findPolysAroundCircle; all locally present polygons",
    floorIdentity: false,
    minimumRise,
    groups,
    pairs,
  });
  console.log(
    JSON.stringify({
      polygons: found.polyRefs.length,
      groups: groups.length,
      pairs: pairs.length,
      largestRises: groups
        .map((g) => g.rise)
        .sort((a, b) => b - a)
        .slice(0, 10),
    }),
  );
} finally {
  query.destroy();
  nav.destroy();
}
