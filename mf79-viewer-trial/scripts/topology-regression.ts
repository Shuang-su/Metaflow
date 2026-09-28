import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { init, importNavMesh } from "recast-navigation";
import { source, cache } from "./source";
import { NativePlanner } from "../src/planner";
import { NativeDriver, horizontal } from "../src/native-motion";
import type { Route } from "../../metaflow-viewer/src/navigation/contracts";
const drain = <T>(g: Generator<unknown, T>): T => {
  let r = g.next();
  while (!r.done) r = g.next();
  return r.value;
};
const distance = (p: { x: number; y: number; z: number }[]) =>
  p.slice(1).reduce((n, v, i) => n + horizontal(p[i], v), 0);
await init();
const s = source("apms-2026"),
  mesh = importNavMesh(readFileSync(`${cache}/apms-2026/nav.bin`)).navMesh,
  p = new NativePlanner(mesh, s.space, "captured-42"),
  f = JSON.parse(readFileSync("tests/fixtures/captured-apms-42.json", "utf8")),
  driver = new NativeDriver(s.space.collision, f.position);
for (let i = 0; i < 120; i++) driver.step(0, 0);
const stateBefore = driver.state,
  old = p.straight(f.nativePoint, f.end, f.polys);
let route: Route = {
    points: old.points,
    polys: old.polys,
    asset: p.asset,
    revision: 1,
  },
  native = { point: f.nativePoint, ref: f.polys[0], eye: f.position };
const repaired = drain(p.maintain(driver.state, route, native));
assert.ok(repaired);
assert.deepEqual(
  driver.state,
  stateBefore,
  "navigation never moves the actual driver",
);
const before = distance(old.points),
  after = distance(repaired.route.points);
assert.ok(
  before > 50 && after < 27,
  `distant obsolete passage remained: ${before} -> ${after}`,
);
assert.equal(p.topologyChanges, 1);
assert.deepEqual(
  repaired.route.points.at(-1),
  f.end,
  "same confirmed destination",
);
assert.equal(drain(p.verify(driver.state, repaired.route.points)).ok, true);
route = repaired.route;
native = repaired.native;
const checks = p.topologyChecks;
for (let i = 0; i < 30; i++) {
  for (let j = 0; j < 6; j++) driver.step(0, 0);
  const next = drain(p.maintain(driver.state, route, native));
  assert.ok(next);
  route = next.route;
  native = next.native;
}
assert.equal(
  p.topologyChecks,
  checks,
  "stationary observation does not repeat topology searches",
);
// Fault injection: a backend claiming a wall-crossing line is complete must not
// displace the old usable corridor. The original native controller rejects it.
const unsafe = new NativePlanner(mesh, s.space, "unsafe-shortcut-probe");
const underlying = unsafe.path.bind(unsafe);
unsafe.path = (start, end, query = unsafe.query) =>
  query === unsafe.query
    ? {
        reason: "complete",
        points: [start.point, end.point],
        polys: [...f.polys],
      }
    : underlying(start, end, query);
const refused = drain(
  unsafe.maintain(
    driver.state,
    {
      points: old.points,
      polys: old.polys,
      asset: unsafe.asset,
      revision: 1,
    },
    { point: f.nativePoint, ref: f.polys[0], eye: f.position },
  ),
);
assert.ok(refused, "retain the old corridor after an unsafe optimisation");
assert.equal(unsafe.topologyChanges, 0);
assert.equal(unsafe.lastTopologyCheck?.reason, "native-motion-blocked");
assert.ok(distance(refused.route.points) > 50);
const unsafeProof = unsafe.lastTopologyCheck;
unsafe.destroy();
writeFileSync(
  "docs/topology-apms-42.json",
  JSON.stringify(
    {
      before,
      after,
      checks: p.topologyChecks,
      changes: p.topologyChanges,
      stateBefore,
      lastCheck: p.lastTopologyCheck,
      unsafeProof,
      route,
      note: "Captured route repaired through complete native Detour query and native walking proof; original driver unchanged; stationary repeats suppressed.",
    },
    null,
    2,
  ),
);
console.log({
  before,
  after,
  checks: p.topologyChecks,
  changes: p.topologyChanges,
});
p.destroy();
mesh.destroy();
