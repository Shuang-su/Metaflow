import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { init, importNavMesh } from "recast-navigation";
import { cache, source, sha } from "./source";
import { NativePlanner } from "../src/planner";
import { NativeDriver, horizontal } from "../src/native-motion";
import type { Route } from "../../metaflow-viewer/src/navigation/contracts";
const drain = <T>(g: Generator<unknown, T>): T => {
  let r = g.next();
  while (!r.done) r = g.next();
  return r.value;
};
await init();
const s = source("apms-2026"),
  dir = resolve(cache, "apms-2026"),
  m = JSON.parse(readFileSync(resolve(dir, "manifest.json"), "utf8"));
const bytes = readFileSync(resolve(dir, "nav.bin"));
assert.equal(sha(bytes), m.navHash);
const mesh = importNavMesh(bytes).navMesh,
  planner = new NativePlanner(mesh, s.space, m.fingerprint);
const d = new NativeDriver(s.space.collision, {
  x: 9.197836623265532,
  y: 1.34,
  z: -7.872404712151348,
});
for (let i = 0; i < 120; i++) d.step(0, 0);
let native = planner.associate(d.state)!;
const camera = s.markers[34].camera.initial.position,
  goal = {
    index: 34,
    radius: 2 as const,
    camera: { x: camera[0], y: camera[1], z: camera[2] },
  };
const candidates = drain(planner.candidates(goal)),
  region = planner.regions(goal, candidates, undefined, native),
  end = region.candidates[0];
const path = planner.path(native, end);
assert.equal(path.reason, "complete");
let route: Route = {
  points: path.points,
  polys: path.polys,
  asset: m.fingerprint,
  revision: 1,
};
const rows: any[] = [];
// Second user capture: a simple (non-repeating) but obsolete U-shaped corridor.
const capturedRefs = [
  5444567, 5444540, 5444566, 5445026, 5445034, 5445032, 5445028, 5444450,
  5444519, 5444504, 5444465, 5444601, 5444674, 5444665, 5444645, 5444194,
  5444193, 5444190, 5444181, 5442621, 5442643, 5442637, 5442622, 5442633,
  5442852, 5442851, 5442842, 5441997, 5441995, 5442008, 5442030, 5442034,
  5442033, 5442029, 5441939, 5441944, 5441948, 5441950, 5441897, 5441898,
  5441899, 5441900, 5441901, 5441929, 5441951, 5441928, 5443842, 5443830,
  5443821, 5441959, 5441941, 5443844, 5442905, 5442974, 5444571, 5444548,
  5447841, 5448231,
];
const capturedNative = {
  ref: capturedRefs[0],
  point: {
    x: 6.3077850341796875,
    y: -0.09833218157291412,
    z: -7.766688823699951,
  },
  eye: { x: 6.3077850341796875, y: 1.34, z: -7.766688823699951 },
};
const capturedPath = planner.straight(
  capturedNative.point,
  end.point,
  capturedRefs,
);
const atCapture = new NativeDriver(s.space.collision, {
  x: 6.344833016375834,
  y: 1.34,
  z: -7.797537070776267,
});
for (let i = 0; i < 120; i++) atCapture.step(0, 0);
const repaired = drain(
  planner.maintain(
    atCapture.state,
    { ...route, points: capturedPath.points, polys: capturedRefs },
    capturedNative,
  ),
);
assert.ok(repaired, "captured U detour can be repaired locally");
const routeLength = (points: any[]) =>
  points.slice(1).reduce((n, q, i) => n + horizontal(points[i], q), 0);
const before = routeLength(capturedPath.points),
  after = routeLength(repaired.route.points);
assert.ok(after < 4, `unnecessary detour remained: ${after}`);
rows.push({
  name: "captured-U-detour",
  before,
  after,
  oldPolys: capturedRefs,
  newPolys: repaired.route.polys,
  points: repaired.route.points,
});
console.log("captured-U-detour", before.toFixed(3), "->", after.toFixed(3));
for (const [name, x, z, ticks] of [
  ["forward", 0, 1, 60],
  ["side-right", 1, 0, 60],
  ["backwards", 0, -1, 60],
  ["side-left", -1, 0, 60],
  ["observe", 0, 0, 120],
  ["diagonal", 0.707, 0.707, 60],
  ["return", -0.707, -0.707, 60],
] as const) {
  let updates = 0,
    failed = 0,
    ratio = 0;
  const points = [];
  for (let tick = 0; tick < ticks; tick++) {
    d.step(x, z);
    if (tick % 6 || name === "observe") continue;
    const result = drain(planner.maintain(d.state, route, native));
    updates++;
    if (!result) {
      failed++;
      continue;
    }
    route = result.route;
    native = result.native;
    assert.equal(route.polys.length, new Set(route.polys).size);
    const fresh = planner.path(native, end);
    const dist = (ps: any[]) =>
      ps.slice(1).reduce((n, p, i) => n + horizontal(p, ps[i]), 0);
    if (fresh.reason === "complete")
      ratio = Math.max(
        ratio,
        dist(route.points) / Math.max(0.01, dist(fresh.points)),
      );
    points.push({
      position: d.state.position,
      route: route.points,
      refs: route.polys,
    });
  }
  rows.push({ name, updates, failed, maxLengthRatioToFresh: ratio, points });
  console.log(name, updates, failed, ratio.toFixed(3));
}
writeFileSync(
  "docs/side-step-apms-35.json",
  JSON.stringify(
    {
      asset: m.fingerprint,
      origin:
        "User browser captured actual native pose at marker 35, 2026-09-28",
      rows,
    },
    null,
    2,
  ),
);
planner.destroy();
mesh.destroy();
