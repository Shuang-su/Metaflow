import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { init, importNavMesh } from "recast-navigation";
import { source, cache, sha } from "./source";
import { NativePlanner } from "../src/planner";
import { NativeDriver, horizontal, stand } from "../src/native-motion";
import type { Route } from "../../metaflow-viewer/src/navigation/contracts";

const drain = <T>(g: Generator<unknown, T>): T => {
  let r = g.next();
  while (!r.done) r = g.next();
  return r.value;
};
await init();
const [id, ...requested] = process.argv.slice(2),
  s = source(id),
  dir = resolve(cache, id);
const m = JSON.parse(readFileSync(resolve(dir, "manifest.json"), "utf8"));
const bytes = readFileSync(resolve(dir, "nav.bin"));
assert.equal(sha(bytes), m.navHash);
const mesh = importNavMesh(bytes).navMesh,
  p = new NativePlanner(mesh, s.space, m.fingerprint);
const audit = JSON.parse(readFileSync(`docs/audit-${id}.json`, "utf8"));
const rows: any[] = [];
for (const row of audit.rows.filter(
  (r: any) => !requested.length || requested.includes(String(r.index)),
)) {
  if (row.status !== "native-replay-passed") {
    rows.push({ index: row.index, status: row.status });
    continue;
  }
  const driver = new NativeDriver(s.space.collision, audit.start.position);
  for (let i = 0; i < 120; i++) driver.step(0, 0);
  let native = p.associate(driver.state)!;
  let route: Route = {
    points: row.points,
    polys: row.polys,
    asset: m.fingerprint,
    revision: 1,
  };
  const eyes = row.points.map((q: any) => stand(s.space.collision, q)!);
  let cursor = 0,
    updates = 0,
    failures = 0,
    maxPolys = route.polys.length,
    maxRepeated = 0,
    maxRatio = 0;
  const timing: number[] = [],
    samples: any[] = [],
    failureSamples: any[] = [], recoverySamples: any[] = [];
  const recoveryStart = p.recoveries;
  // The movement tape follows the initial verified route. Local maintenance is
  // evaluated independently so a broken maintained route cannot steer the test
  // into following its own artificial loop and hide the defect.
  for (let tick = 0; tick < 24000; tick++) {
    const at = driver.state.position;
    while (cursor < eyes.length && horizontal(at, eyes[cursor]) < 0.07)
      cursor++;
    if (cursor >= eyes.length) break;
    const target = eyes[cursor],
      d = horizontal(at, target);
    driver.step((target.x - at.x) / d, -(target.z - at.z) / d);
    if (tick % 6) continue;
    const before = performance.now(),
      beforeRecoveries = p.recoveries,
      updated = drain(p.maintain(driver.state, route, native));
    if (p.recoveries > beforeRecoveries) recoverySamples.push(p.lastRecovery);
    timing.push(performance.now() - before);
    updates++;
    if (!updated) {
      failures++;
      if (failureSamples.length < 16)
        failureSamples.push(p.lastMaintenanceFailure);
      const start = p.associate(driver.state);
      if (!start) continue;
      const candidate = {
        ref: row.polys.at(-1),
        point: row.endpoint,
        eye: stand(s.space.collision, row.endpoint)!,
      };
      const fresh = p.path(start, candidate);
      if (fresh.reason !== "complete") continue;
      route = { ...route, points: fresh.points, polys: fresh.polys };
      native = start;
      continue;
    }
    route = updated.route;
    native = updated.native;
    const repeated = route.polys.length - new Set(route.polys).size;
    maxRepeated = Math.max(maxRepeated, repeated);
    maxPolys = Math.max(maxPolys, route.polys.length);
    assert.equal(
      repeated,
      0,
      `marker ${row.index}, tick ${tick}: loop introduced`,
    );
    assert.ok(horizontal(route.points[0], driver.state.position) < 1e-6);
    if (updates % 20 === 0) {
      const fresh = p.path(native, {
        ref: row.polys.at(-1),
        point: row.endpoint,
        eye: eyes.at(-1),
      });
      const distance = (points: any[]) =>
        points.slice(1).reduce((n, q, i) => n + horizontal(points[i], q), 0);
      const ratio =
        fresh.reason === "complete"
          ? distance(route.points) / Math.max(0.01, distance(fresh.points))
          : null;
      if (ratio !== null) maxRatio = Math.max(maxRatio, ratio);
      samples.push({
        tick,
        position: driver.state.position,
        polys: route.polys.length,
        remaining: distance(route.points),
        freshRatio: ratio,
      });
    }
  }
  timing.sort((a, b) => a - b);
  const result = {
    index: row.index,
    status: cursor === eyes.length ? "completed" : "motion-incomplete",
    updates,
    localFailures: failures,
    recoveredSurfaceFailures: p.recoveries - recoveryStart,
    recoverySamples,
    maxPolys,
    maxRepeated,
    maxRatio,
    p50: timing[Math.floor(timing.length * 0.5)],
    p95: timing[Math.floor(timing.length * 0.95)],
    samples,
    failureSamples,
  };
  rows.push(result);
  console.log(
    id,
    row.index,
    result.status,
    updates,
    failures,
    "ratio",
    maxRatio.toFixed(2),
  );
  writeFileSync(
    `docs/maintenance-${id}${requested.length ? "-selected" : ""}.json`,
    JSON.stringify(
      {
        asset: m.fingerprint,
        note: "Native movement along a frozen initial route; local corridor updated at 10 Hz. Separate from interactive browser acceptance.",
        rows,
      },
      null,
      2,
    ),
  );
}
p.destroy();
mesh.destroy();
