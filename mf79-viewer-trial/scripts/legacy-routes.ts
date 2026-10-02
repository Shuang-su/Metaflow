import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { init, importNavMesh } from "recast-navigation";
import { source, assetDirectory, sha } from "./source";
import { NativePlanner } from "../src/planner";
import { NativeDriver, support, horizontal } from "../src/native-motion";
const drain = <T>(g: Generator<unknown, T>): T => {
  let r = g.next();
  while (!r.done) r = g.next();
  return r.value;
};
await init();
const rows: any[] = [];
for (const id of ["apms-2026", "sdi-2026"]) {
  const s = source(id),
    dir = assetDirectory(id),
    m = JSON.parse(readFileSync(resolve(dir, "manifest.json"), "utf8"));
  const bytes = readFileSync(resolve(dir, "nav.bin"));
  if (sha(bytes) !== m.navHash) throw Error("Fingerprint mismatch");
  const mesh = importNavMesh(bytes).navMesh,
    p = new NativePlanner(mesh, s.space, m.fingerprint),
    d = new NativeDriver(s.space.collision, s.scene.start);
  for (let i = 0; i < 120; i++) d.step(0, 0);
  const goals = [...s.scene.goals];
  if (id === "apms-2026")
    goals.push({ id: "wall-behind", position: { x: 0, y: 1.308, z: -8 } });
  for (const goal of goals) {
    const start = p.associate(d.state),
      floor = support(s.space.collision, goal.position),
      actual = { ...d.state, position: goal.position, supportHeight: floor };
    const end = p.associate(actual);
    const row: any = {
      scene: id,
      id: goal.id,
      goal: goal.position,
      asset: m.fingerprint,
      status: "association-failed",
    };
    if (start && end && floor !== null) {
      const result = p.path(start, end);
      row.search = result.reason;
      if (result.reason === "complete") {
        const points = [...result.points, { ...goal.position, y: floor }],
          proof = drain(p.verify(d.state, points, 0.03));
        row.proof = proof;
        row.status =
          proof.ok && horizontal(proof.point, goal.position) < 0.03
            ? "native-walking-passed"
            : "motion-failed";
        row.endpointTolerance = 0.03;
      }
    }
    row.cohort = goal.id === "marker-2" ? "supplemental" : "legacy-seven";
    rows.push(row);
    console.log(id, goal.id, row.status);
  }
  p.destroy();
  mesh.destroy();
}
writeFileSync(
  "docs/legacy-seven.json",
  JSON.stringify(
    {
      note: "Same seven source destinations, plus SDI marker-2 supplemental; native-body walking to endpoint, original 3 cm stop tolerance (not the 2 m arrival disk).",
      rows,
    },
    null,
    2,
  ),
);
