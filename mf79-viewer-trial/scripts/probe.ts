import { init, importNavMesh } from "recast-navigation";
import { source, cache } from "./source";
import { NativePlanner } from "../src/planner";
import { readFileSync } from "node:fs";
await init();
const s = source("apms-2026"),
  mesh = importNavMesh(readFileSync(cache + "/apms-2026/nav.bin")).navMesh,
  p = new NativePlanner(mesh, s.space, "probe");
const camera = s.markers[20].camera.initial.position,
  goal = {
    index: 20,
    camera: { x: camera[0], y: camera[1], z: camera[2] },
    radius: 2 as const,
  };
console.log("loaded");
let gen = p.candidates(goal),
  r = gen.next(),
  count = 0;
while (!r.done) {
  count++;
  r = gen.next();
}
console.log("candidates", r.value.length, count);
const candidate = r.value[0];
const poly = mesh.getTileAndPolyByRef(candidate.ref);
console.log("link", poly.poly.firstLink());
let n = poly.poly.firstLink();
for (let i = 0; i < 12; i++) {
  const l = poly.tile.links(n);
  console.log("next", l.next(), l.ref());
  n = l.next();
  if (n === 4294967295 || n === -1) break;
}
console.log("regions start");
console.log(p.regions(goal, r.value).candidates.length);
p.destroy();
mesh.destroy();
