import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { init, importNavMesh } from "recast-navigation";
import { source, cache, sha } from "./source";
import { NativePlanner } from "../src/planner";
import { NativeDriver } from "../src/native-motion";
import {
  routeLength,
  inRegion,
} from "../../metaflow-viewer/src/navigation/contracts";
await init();
const [id, ...args] = process.argv.slice(2),
  radius = args.includes("--radius=3") ? 3 : 2;
const requested = args.filter((v) => !v.startsWith("--")).map(Number),
  s = source(id);
const m = JSON.parse(readFileSync(resolve(cache, id, "manifest.json"), "utf8"));
const bytes = readFileSync(resolve(cache, id, "nav.bin"));
assert.equal(sha(bytes), m.navHash);
const mesh = importNavMesh(bytes).navMesh,
  p = new NativePlanner(mesh, s.space, m.fingerprint);
const d = new NativeDriver(s.space.collision, s.scene.start);
for (let i = 0; i < 120; i++) d.step(0, 0);
const drain = <T>(g: Generator<unknown, T>) => {
  let n = g.next();
  while (!n.done) n = g.next();
  return n.value;
};
const rows: any[] = [];
for (let index = 0; index < s.markers.length; index++) {
  if (requested.length && !requested.includes(index + 1)) continue;
  const xyz = s.markers[index].camera.initial.position,
    goal = {
      index,
      radius,
      camera: { x: xyz[0], y: xyz[1], z: xyz[2] },
    } as const;
  const begin = performance.now(),
    all = drain(p.candidates(goal)),
    region = p.regions(goal, all, undefined, p.associate(d.state));
  const candidateMs = performance.now() - begin;
  let first: any = null;
  for (const solution of p.solutions(
    d.state,
    goal,
    region.candidates,
    region.regions,
  ))
    if (solution) {
      first = solution;
      break;
    }
  const row: any = {
    index: index + 1,
    status: first
      ? "native-replay-passed"
      : region.ambiguous
        ? "ambiguous"
        : "no-verified-route",
    candidateMs,
    totalMs: performance.now() - begin,
    candidateCount: all.length,
  };
  if (first) {
    row.points = first.path.points;
    row.polys = first.path.polys;
    row.endpoint = first.path.points.at(-1);
    row.entry = first.path.entry;
    row.remaining = routeLength(row.points);
    row.proof = first.proof;
    row.regions = region.regions;
    assert.ok(
      Math.hypot(
        row.endpoint.x - goal.camera.x,
        row.endpoint.z - goal.camera.z,
      ) <=
        radius + 1e-8,
    );
    assert.ok(
      region.regions.some((r) => inRegion(row.endpoint, row.endpoint.y, r)),
    );
  }
  rows.push(row);
  console.log(
    id,
    radius,
    row.index,
    row.status,
    Math.round(row.totalMs),
    row.remaining,
  );
  writeFileSync(
    `docs/region-audit-${id}${radius === 3 ? "-radius-3" : ""}${requested.length ? "-selected" : ""}.json`,
    JSON.stringify(
      {
        asset: m.fingerprint,
        sourceHash: s.sourceHash,
        markerHash: s.markerHash,
        body: m.body,
        radius,
        start: d.state,
        rows,
      },
      null,
      2,
    ),
  );
}
p.destroy();
mesh.destroy();
assert.equal(rows.filter((r) => r.status !== "native-replay-passed").length, 0);
