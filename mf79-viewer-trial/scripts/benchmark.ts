import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { init, importNavMesh } from "recast-navigation";
import { source, cache } from "./source";
import { NativePlanner } from "../src/planner";
import { NativeDriver } from "../src/native-motion";
const drain = <T>(g: Generator<unknown, T>): T => {
  let r = g.next();
  while (!r.done) r = g.next();
  return r.value;
};
const [id, marker, mode] = process.argv.slice(2),
  begin = performance.now();
await init();
const s = source(id),
  mesh = importNavMesh(readFileSync(`${cache}/${id}/nav.bin`)).navMesh,
  p = new NativePlanner(mesh, s.space, id),
  d = new NativeDriver(s.space.collision, s.scene.start);
for (let i = 0; i < 120; i++) d.step(0, 0);
const camera = s.markers[+marker - 1].camera.initial.position,
  goal = {
    index: +marker - 1,
    radius: 2 as const,
    camera: { x: camera[0], y: camera[1], z: camera[2] },
  },
  loaded = performance.now() - begin;
function query() {
  const start = performance.now(),
    region = p.regions(
      goal,
      drain(p.candidates(goal)),
      undefined,
      p.associate(d.state),
    ),
    candidateMs = performance.now() - start;
  let searchMs = 0,
    proofMs = 0,
    attempts = 0,
    ok = false;
  const origin = p.associate(d.state)!;
  for (const end of region.candidates) {
    attempts++;
    let at = performance.now();
    const route = p.path(origin, end);
    searchMs += performance.now() - at;
    if (route.reason !== "complete") continue;
    at = performance.now();
    const result = drain(p.verify(d.state, route.points));
    proofMs += performance.now() - at;
    if (result.ok) {
      ok = true;
      break;
    }
  }
  return {
    ok,
    totalMs: performance.now() - start,
    candidateMs,
    searchMs,
    proofMs,
    attempts,
    rss: process.memoryUsage().rss,
  };
}
if (mode === "--cold")
  console.log(JSON.stringify({ navigationLoadMs: loaded, query: query() }));
else {
  for (let i = 0; i < 5; i++) query();
  const measured = Array.from({ length: 30 }, query),
    cold = [];
  for (let i = 0; i < 3; i++) {
    const at = performance.now(),
      data = JSON.parse(
        execFileSync(
          process.execPath,
          ["--import", "tsx", "scripts/benchmark.ts", id, marker, "--cold"],
          { encoding: "utf8" },
        ),
      );
    cold.push({ ...data, processWallMs: performance.now() - at });
  }
  const stages = Object.fromEntries(
    ["totalMs", "candidateMs", "searchMs", "proofMs"].map((key) => {
      const values = measured
        .map((r) => r[key as keyof typeof r] as number)
        .sort((a, b) => a - b);
      return [key, { p50: values[15], p95: values[28] }];
    }),
  );
  const result = {
    scene: id,
    marker: +marker,
    warmups: 5,
    repetitions: 30,
    coldProcessRuns: 3,
    scope:
      "Serial Node native navigation benchmark; OS filesystem cache retained. No screenshot capture, Gaussian rendering, Worker communication or browser-frame latency in these times.",
    stages,
    cold,
    measured,
  };
  writeFileSync(
    `docs/performance-${id}-${marker}.json`,
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(stages));
}
p.destroy();
mesh.destroy();
