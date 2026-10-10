/** Research only: enumerate actual Detour tile polygons without a bounded
 * query buffer. Reciprocal links give leads, never floor IDs or walk proofs. */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { init, importNavMesh, NavMeshQuery } from "../../mf79-viewer-trial/src/recast-runtime";
import { sha } from "../../mf79-viewer-trial/scripts/source";
import { BODY } from "../../mf79-viewer-trial/src/native-motion";
import { createOfflineResources, offlineResourceOptions } from "../src/offline-resources";

const args = process.argv.slice(2);
const option = (name: string) => {
  const i = args.indexOf(name);
  if (i < 0 || !args[i + 1]) throw Error(`Missing ${name}`);
  return args[i + 1];
};
const file = option("--manifest"),
  m = JSON.parse(readFileSync(file, "utf8")),
  bytes = readFileSync(resolve(dirname(file), "nav.bin"));
if (m.status !== "analysis-complete" || m.usage !== "offline-native-verification-only")
  throw Error("Requires bounded analysis-only navigation");
if (sha(bytes) !== m.navHash || sha(JSON.stringify(m.key)) !== m.fingerprint)
  throw Error("Navigation identity mismatch");
const minimumRise = args.includes("--minimum-rise") ? Number(option("--minimum-rise")) : 2;
if (!Number.isFinite(minimumRise) || minimumRise <= 0) throw Error("Invalid minimum rise");
const resources = createOfflineResources(offlineResourceOptions(args));
await init();
const nav = importNavMesh(bytes).navMesh,
  query = new NavMeshQuery(nav),
  nodes = new Map<number, { point: { x: number; y: number; z: number }; links: Set<number> }>();
try {
  let totalPolygons = 0, excludedPolygons = 0, loadedTiles = 0;
  for (let ti = 0; ti < nav.getMaxTiles(); ti++) {
    const tile = nav.getTile(ti), header = tile.header();
    if (!header) continue;
    loadedTiles++;
    for (let pi = 0; pi < header.polyCount(); pi++) {
      totalPolygons++;
      const poly = tile.polys(pi);
      if (!poly.flags() || poly.getType() !== 0) { excludedPolygons++; continue; }
      const ref = nav.encodePolyId(tile.salt(), ti, pi);
      if (!nav.isValidPolyRef(ref) || nodes.has(ref)) throw Error("Invalid/duplicate polygon reference");
      const p = { x: 0, y: 0, z: 0 };
      for (let vi = 0; vi < poly.vertCount(); vi++) {
        const v = poly.verts(vi) * 3;
        p.x += tile.verts(v); p.y += tile.verts(v + 1); p.z += tile.verts(v + 2);
      }
      p.x /= poly.vertCount(); p.y /= poly.vertCount(); p.z /= poly.vertCount();
      const precise = query.closestPointOnPoly(ref, p);
      if (!precise.success) throw Error("Polygon representative query failed");
      const links = new Set<number>(), seenLinks = new Set<number>();
      for (let li = poly.firstLink(); li !== 4294967295 && li !== -1;) {
        if (seenLinks.has(li) || li < 0 || li >= header.maxLinkCount()) throw Error("Corrupt Detour link chain");
        seenLinks.add(li);
        const link = tile.links(li), next = link.ref();
        if (next) {
          if (!nav.isValidPolyRef(next)) throw Error("Invalid Detour neighbour");
          links.add(next);
        }
        li = link.next();
      }
      nodes.set(ref, { point: precise.closestPoint, links });
    }
    resources.assertCapacity(0, "Detour tile enumeration");
  }
  if (loadedTiles !== m.tiles.filter((t: any) => t.hash).length ||
      totalPolygons !== m.tiles.reduce((n: number, t: any) => n + (t.polygons ?? 0), 0))
    throw Error("Detour polygon/tile inventory differs from generation manifest");
  const unseen = new Set(nodes.keys()), groups: any[] = [], pairs: any[] = [];
  let oneWayLinks = 0;
  for (const [ref, node] of nodes)
    for (const next of node.links)
      if (nodes.has(next) && !nodes.get(next)!.links.has(ref)) oneWayLinks++;
  while (unseen.size) {
    const seed = unseen.values().next().value!, stack = [seed], reached: number[] = [];
    unseen.delete(seed);
    while (stack.length) {
      const ref = stack.pop()!;
      reached.push(ref);
      for (const next of nodes.get(ref)!.links)
        if (unseen.has(next) && nodes.get(next)!.links.has(ref)) {
          unseen.delete(next); stack.push(next);
        }
    }
    reached.sort((a, b) => nodes.get(a)!.point.y - nodes.get(b)!.point.y || a - b);
    const entry = (ref: number) => ({ ref, point: nodes.get(ref)!.point });
    const low = entry(reached[0]), high = entry(reached.at(-1)!);
    const rise = high.point.y - low.point.y;
    groups.push({ seed, polygons: reached.length, rise, low, high });
    if (rise >= minimumRise)
      for (const fraction of [0, 0.05, 0.1]) {
        const a = entry(reached[Math.floor((reached.length - 1) * fraction)]),
          b = entry(reached[Math.floor((reached.length - 1) * (1 - fraction))]);
        if (b.point.y - a.point.y < minimumRise) continue;
        pairs.push({ id: `reciprocal-${seed}-${fraction}`,
          from: { ...a.point, y: a.point.y + BODY.eye + BODY.hover },
          to: { ...b.point, y: b.point.y + BODY.eye + BODY.hover },
          evidence: { navigation: m.fingerprint, polys: [a.ref, b.ref], componentPolygons: reached.length },
          rise: b.point.y - a.point.y });
      }
  }
  const result = { version: 1, usage: "analysis-only", navigationFingerprint: m.fingerprint,
    sourceHash: m.sourceHash, implementationHash: sha(readFileSync(new URL(import.meta.url))),
    scope: m.bounds, discovery: "Complete Detour tile inventory; reciprocal polygon links",
    floorIdentity: false, minimumRise, loadedTiles, totalPolygons,
    eligiblePolygons: nodes.size, excludedPolygons, oneWayLinks, groups, pairs };
  resources.writeJsonAtomic(option("--output"), result, { replace: false });
  console.log(JSON.stringify({ ...result, groups: groups.length, pairs: pairs.length,
    largestRises: groups.map(g => g.rise).sort((a, b) => b - a).slice(0, 10) }));
} finally { query.destroy(); nav.destroy(); }
