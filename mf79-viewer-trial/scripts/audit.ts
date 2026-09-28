import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { init, importNavMesh } from "recast-navigation";
import { source, cache, sha } from "./source";
import { NativePlanner } from "../src/planner";
import { NativeDriver } from "../src/native-motion";
const drain = (g: Generator) => {
  let r = g.next();
  while (!r.done) r = g.next();
  return r.value;
};
await init();
const [id, ...args] = process.argv.slice(2),
  requested = args.filter((v) => !v.startsWith("--")),
  radius: 2 | 3 = args.includes("--radius=3") ? 3 : 2,
  s = source(id),
  dir = resolve(cache, id),
  m = JSON.parse(readFileSync(resolve(dir, "manifest.json"), "utf8"));
if (m.status !== "complete" || m.sourceHash !== s.sourceHash)
  throw Error("Navigation source not ready");
const bytes = readFileSync(resolve(dir, "nav.bin"));
if (sha(bytes) !== m.navHash) throw Error("Nav hash mismatch");
const mesh = importNavMesh(bytes).navMesh,
  p = new NativePlanner(mesh, s.space, m.fingerprint),
  driver = new NativeDriver(s.space.collision, s.scene.start);
for (let i = 0; i < 120; i++) driver.step(0, 0);
const actual = driver.state;
const rows: any[] = [];
mkdirSync("docs", { recursive: true });
for (const index of requested.length
  ? requested.map((n) => +n - 1)
  : s.markers.map((_: any, i: number) => i)) {
  const camera = s.markers[index].camera?.initial?.position;
  if (!camera) {
    rows.push({ index: index + 1, status: "missing-camera" });
    continue;
  }
  const begin = performance.now(),
    goal = {
      index,
      camera: { x: camera[0], y: camera[1], z: camera[2] },
      radius,
    };
  const all = drain(p.candidates(goal)),
    region = p.regions(goal, all, undefined, p.associate(actual));
  const row: any = {
    index: index + 1,
    candidateCount: all.length,
    selectedCount: region.candidates.length,
    choices: region.choices,
    floors: [...new Set(region.regions.map((r) => r.floor))],
    candidateMs: performance.now() - begin,
    status: region.ambiguous ? "ambiguous" : "no-verified-route",
    attempted: 0,
    failures: [],
  };
  const start = p.associate(actual);
  if (!start) row.status = "entry-association";
  else
    for (const end of region.candidates) {
      row.attempted++;
      const path = p.path(start, end);
      if (path.reason !== "complete") {
        row.lastReason = path.reason;
        continue;
      }
      const proof = drain(p.verify(actual, path.points));
      if (proof.ok) {
        row.status = "native-replay-passed";
        row.points = path.points;
        row.polys = path.polys;
        row.endpoint = end.point;
        break;
      }
      if (row.failures.length < 8) row.failures.push(proof);
    }
  row.totalMs = performance.now() - begin;
  rows.push(row);
  console.log(
    id,
    index + 1,
    row.status,
    row.attempted,
    Math.round(row.totalMs),
  );
  writeFileSync(
    `docs/audit-${id}${radius === 3 ? "-radius-3" : ""}${requested.length ? "-selected" : ""}.json`,
    JSON.stringify(
      {
        asset: m.fingerprint,
        sourceHash: s.sourceHash,
        markerHash: s.markerHash,
        body: m.body,
        radius,
        start: actual,
        rows,
      },
      null,
      2,
    ),
  );
}
p.destroy();
mesh.destroy();
