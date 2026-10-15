/** Research only: enumerate actual Detour tile polygons without a bounded
 * query buffer. Reciprocal links give leads, never floor IDs or walk proofs. */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { init, importNavMesh, NavMeshQuery, Detour } from "../../mf79-viewer-trial/src/recast-runtime";
import { sha } from "../../mf79-viewer-trial/scripts/source";
import { BODY } from "../../mf79-viewer-trial/src/native-motion";
import { RECAST_CONFIG } from "../../mf79-viewer-trial/src/recast-config";
import { createOfflineResources, offlineResourceOptions } from "../src/offline-resources";
import { collisionSourceFile } from "../../mf79-viewer-trial/scripts/source";
import { stand } from "../../mf79-viewer-trial/src/native-motion";
import { replayNativePolyline } from "../src/dayun-native-proof";

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
const proofFile = args.includes("--native-proof") ? option("--native-proof") : undefined,
  proofBytes = proofFile ? readFileSync(proofFile) : undefined,
  proof = proofBytes ? JSON.parse(proofBytes.toString()) : undefined;
if (proof && (proof.navigationFingerprint !== m.fingerprint || proof.sourceHash !== m.sourceHash ||
    proof.nativeParametersUnchanged !== true || proof.automaticJump !== false ||
    JSON.stringify(proof.body) !== JSON.stringify(BODY) || !Array.isArray(proof.proofs) ||
    new Set(proof.proofs.map((p: any) => p.id)).size !== proof.proofs.length))
  throw Error("Native probes must match this navigation, collision and original body");
const resources = createOfflineResources(offlineResourceOptions(args));
const boundarySource = args.includes("--boundary-source") ? option("--boundary-source") : undefined;
const boundaryEdges: { ref: number; side: string; axis: "x" | "z"; sign: number; a: any; b: any }[] = [];
const boundaryMargin = (RECAST_CONFIG.walkableRadius + 3) * RECAST_CONFIG.cs;
await init();
const nav = importNavMesh(bytes).navMesh,
  query = new NavMeshQuery(nav, { maxNodes: 65535 }),
  nodes = new Map<number, { point: { x: number; y: number; z: number }; links: Set<number>;
    bounds: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } }>();
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
      const p = { x: 0, y: 0, z: 0 },
        bounds = { min: { x: Infinity, y: Infinity, z: Infinity }, max: { x: -Infinity, y: -Infinity, z: -Infinity } };
      for (let vi = 0; vi < poly.vertCount(); vi++) {
        const v = poly.verts(vi) * 3;
        p.x += tile.verts(v); p.y += tile.verts(v + 1); p.z += tile.verts(v + 2);
        for (const [axis, offset] of [["x", 0], ["y", 1], ["z", 2]] as const) {
          bounds.min[axis] = Math.min(bounds.min[axis], tile.verts(v + offset));
          bounds.max[axis] = Math.max(bounds.max[axis], tile.verts(v + offset));
        }
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
      nodes.set(ref, { point: precise.closestPoint, links, bounds });
      if (boundarySource) for (let edge = 0; edge < poly.vertCount(); edge++) {
        const vertex = (index: number) => {
          const vi = poly.verts(index % poly.vertCount()) * 3;
          return { x: tile.verts(vi), y: tile.verts(vi + 1), z: tile.verts(vi + 2) };
        };
        const a = vertex(edge), b = vertex(edge + 1);
        for (const axis of ["x", "z"] as const) for (const side of ["min", "max"] as const)
          if ([a, b].every(p => Math.abs(p[axis] - m.bounds[side][axis]) < 0.001))
            boundaryEdges.push({ ref, side: side + axis.toUpperCase(), axis, sign: side === "max" ? 1 : -1, a, b });
      }
    }
    resources.assertCapacity(0, "Detour tile enumeration");
  }
  if (loadedTiles !== m.tiles.filter((t: any) => t.hash).length ||
      totalPolygons !== m.tiles.reduce((n: number, t: any) => n + (t.polygons ?? 0), 0))
    throw Error("Detour polygon/tile inventory differs from generation manifest");
  const unseen = new Set(nodes.keys()), groups: any[] = [], pairs: any[] = [],
    membership = new Map<number, number>();
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
    const bounds = { min: { x: Infinity, y: Infinity, z: Infinity }, max: { x: -Infinity, y: -Infinity, z: -Infinity } };
    for (const ref of reached) {
      membership.set(ref, seed);
      for (const axis of ["x", "y", "z"] as const) {
        bounds.min[axis] = Math.min(bounds.min[axis], nodes.get(ref)!.bounds.min[axis]);
        bounds.max[axis] = Math.max(bounds.max[axis], nodes.get(ref)!.bounds.max[axis]);
      }
    }
    const touchesScope = [];
    for (const axis of ["x", "y", "z"] as const) {
      const margin = axis === "y" ? RECAST_CONFIG.ch : boundaryMargin;
      if (bounds.min[axis] <= m.bounds.min[axis] + margin) touchesScope.push(`min${axis.toUpperCase()}`);
      if (bounds.max[axis] >= m.bounds.max[axis] - margin) touchesScope.push(`max${axis.toUpperCase()}`);
    }
    groups.push({ seed, polygons: reached.length, rise, low, high, bounds, touchesScope });
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
  const probes = proof?.proofs.map((pair: any) => {
    const [a, b] = pair.associations ?? [],
      aGroup = a ? membership.get(a.ref) : undefined, bGroup = b ? membership.get(b.ref) : undefined;
    const raw = (from: any, to: any) => {
      if (!from || !to) return { reason: "association-missing" };
      if (!nodes.has(from.ref) || !nodes.has(to.ref)) throw Error("Native probe reference absent from navigation");
      const result = query.findPath(from.ref, to.ref, from.point, to.point, { maxPathPolys: 32768 });
      try {
        const lastRef = result.polys.size ? result.polys.get(result.polys.size - 1) : null,
          closest = lastRef ? query.closestPointOnPoly(lastRef, to.point) : null;
        return { success: result.success, status: result.status,
          partial: !!(result.status & Detour.DT_PARTIAL_RESULT),
          outOfNodes: !!(result.status & Detour.DT_OUT_OF_NODES),
          bufferTooSmall: !!(result.status & Detour.DT_BUFFER_TOO_SMALL),
          polygons: result.polys.size, lastRef, reachedRequestedRef: lastRef === to.ref,
          closestToGoal: closest?.success ? closest.closestPoint : null };
      } finally { result.polys.destroy(); }
    };
    return { id: pair.id, from: a ?? null, to: b ?? null,
      fromGroup: groups.find(g => g.seed === aGroup) ?? null,
      toGroup: groups.find(g => g.seed === bGroup) ?? null,
      sameReciprocalGroup: aGroup !== undefined && aGroup === bGroup,
      forward: raw(a, b), reverse: raw(b, a),
      nativeReason: pair.reason,
      allFourGrounded: ["forward", "reverse", "returnAlongForward", "returnAlongReverse"].every(name =>
        pair[name]?.ok === true && Array.isArray(pair[name].trace) && pair[name].trace.length > 0 &&
        pair[name].trace.every((p: any) => p.grounded && p.collision === "active")) };
  });
  let frontier: any;
  if (boundarySource) {
    const scope = structuredClone(m.bounds);
    for (const axis of ["x", "z"] as const) { scope.min[axis] -= 2; scope.max[axis] += 2; }
    const loaded = await collisionSourceFile(boundarySource, scope);
    try {
      if (loaded.sourceHash !== m.sourceHash) throw Error("Boundary source differs from navigation");
      const samples: any[] = [];
      for (const edge of boundaryEdges) {
        const count = Math.max(1, Math.ceil(Math.hypot(edge.b.x - edge.a.x, edge.b.z - edge.a.z) / 0.4));
        for (let i = 0; i < count; i++) {
          const t = (i + 0.5) / count, p = { x: 0, y: 0, z: 0 };
          for (const axis of ["x", "y", "z"] as const) p[axis] = edge.a[axis] + t * (edge.b[axis] - edge.a[axis]);
          const inside = { ...p, [edge.axis]: p[edge.axis] - edge.sign * 0.64 },
            outside = { ...p, [edge.axis]: p[edge.axis] + edge.sign * 0.64 };
          const known = [inside, outside].every(q => [-BODY.radius, 0, BODY.radius].every(dx =>
            [-BODY.radius, 0, BODY.radius].every(dz =>
              [0, BODY.height + BODY.hover].every(dy => loaded.space.known(q.x + dx, q.y + dy, q.z + dz)))));
          const a = known ? stand(loaded.space.collision, inside) : null,
            b = known ? stand(loaded.space.collision, outside) : null;
          samples.push({ ref: edge.ref, component: membership.get(edge.ref), side: edge.side, point: p,
            inside, outside, from: a, to: b, status: !known ? "unknown-source" :
              a && b ? "native-standing-supported" : "native-standing-rejected" });
        }
      }
      const requested = new Set(probes?.flatMap((p: any) => [p.fromGroup?.seed, p.toGroup?.seed]) ?? []), trials: any[] = [];
      for (const side of ["maxX", "maxZ"]) for (const component of requested) {
        const candidates = samples.filter(s => s.side === side && s.component === component && s.from && s.to)
          .sort((a, b) => Math.abs(a.from.y - a.to.y) - Math.abs(b.from.y - b.to.y) || a.ref - b.ref);
        // One explicitly reported short corridor per component/side; all perimeter samples remain in the report.
        const sample = candidates[0];
        if (!sample) continue;
        const known = (p: any) => loaded.space.known(p.x, p.y, p.z);
        const forward = replayNativePolyline(loaded.space.collision, [sample.from, sample.to], known),
          reverse = replayNativePolyline(loaded.space.collision, [sample.to, sample.from], known);
        trials.push({ ...sample, forward, reverse, allGrounded: [forward, reverse].every(r => r.ok &&
          r.trace.length > 0 && r.trace.every(t => t.grounded && t.collision === "active")) });
      }
      frontier = { scope, loadedTileIds: loaded.loadedTileIds, sampleSpacing: 0.4, inset: 0.64,
        perimeterEdges: boundaryEdges.length, samples, trials,
        semantics: "Complete traversable scope-edge inventory, sampled native standing; selected short two-way crossings are not floor connections" };
      console.log(JSON.stringify({ perimeterEdges: boundaryEdges.length, samples: samples.length,
        counts: Object.fromEntries(["unknown-source", "native-standing-supported", "native-standing-rejected"].map(status =>
          [status, samples.filter(s => s.status === status).length])),
        trials: trials.map(t => ({ side: t.side, component: t.component, allGrounded: t.allGrounded })) }));
    } finally { loaded.destroy(); }
  }
  const result = { version: 1, usage: "analysis-only", navigationFingerprint: m.fingerprint,
    sourceHash: m.sourceHash, implementationHash: sha(readFileSync(new URL(import.meta.url))),
    scope: m.bounds, discovery: "Complete Detour tile inventory; reciprocal polygon links",
    floorIdentity: false, minimumRise, boundaryMargin, loadedTiles, totalPolygons,
    eligiblePolygons: nodes.size, excludedPolygons, oneWayLinks, groups, pairs, ...(frontier ? { frontier } : {}),
    ...(proofBytes ? { nativeProbeSource: { file: proofFile, sha256: sha(proofBytes) },
      queryLimits: { maxNodes: 65535, maxPathPolys: 32768 }, probes } : {}) };
  resources.writeJsonAtomic(option("--output"), result, { replace: false });
  console.log(JSON.stringify({ ...result, frontier: frontier ? { perimeterEdges: frontier.perimeterEdges, samples: frontier.samples.length } : undefined, probes: probes?.map((p: any) => ({ id: p.id,
    sameReciprocalGroup: p.sameReciprocalGroup, fromGroup: p.fromGroup?.seed, toGroup: p.toGroup?.seed,
    forward: p.forward, reverse: p.reverse, allFourGrounded: p.allFourGrounded })), groups: groups.length, pairs: pairs.length,
    largestRises: groups.map(g => g.rise).sort((a, b) => b - a).slice(0, 10) }));
} finally { query.destroy(); nav.destroy(); }
