import { readFileSync, writeFileSync } from "node:fs";
import { init, importNavMesh } from "recast-navigation";
import { source, cache } from "./source";
import { NativePlanner } from "../src/planner";
import { NativeDriver, horizontal } from "../src/native-motion";

// Read-only diagnostics from an actual browser pose, without teleporting the
// browser or treating a straight line as proof of a shortest walkable route.
const [id, marker, x, y, z] = process.argv.slice(2);
if (![+marker, +x, +y, +z].every(Number.isFinite))
  throw Error("scene marker x y z required");
const drain = <T>(g: Generator<unknown, T>): T => {
  let r = g.next();
  while (!r.done) r = g.next();
  return r.value;
};
const distance = (points: { x: number; y: number; z: number }[]) =>
  points.slice(1).reduce((sum, p, i) => sum + horizontal(points[i], p), 0);
await init();
const s = source(id),
  bytes = readFileSync(`${cache}/${id}/nav.bin`),
  mesh = importNavMesh(bytes).navMesh,
  planner = new NativePlanner(mesh, s.space, id),
  driver = new NativeDriver(s.space.collision, { x: +x, y: +y, z: +z });
for (let i = 0; i < 120; i++) driver.step(0, 0);
const annotation = s.markers[+marker - 1],
  camera = annotation.camera.initial.position,
  goal = {
    index: +marker - 1,
    radius: 2 as const,
    camera: { x: camera[0], y: camera[1], z: camera[2] },
  },
  start = planner.associate(driver.state);
if (!start) throw Error("Captured pose has no associated surface");
const region = planner.regions(
  goal,
  drain(planner.candidates(goal)),
  undefined,
  start,
);
const queries = region.candidates
  .map((candidate, order) => {
    const route = planner.path(start, candidate);
    return { order, candidate, route, length: distance(route.points) };
  })
  .filter((q) => q.route.reason === "complete");
const first = queries[0];
const shortest = queries
  .slice()
  .sort((a, b) => a.length - b.length)
  .slice(0, 5);
const result = {
  scene: id,
  marker: +marker,
  sourceHash: s.sourceHash,
  markerHash: s.markerHash,
  capturedPose: { x: +x, y: +y, z: +z },
  settledPose: driver.state.position,
  camera: goal.camera,
  contentAnchor: annotation.position,
  cameraDistance: horizontal(driver.state.position, goal.camera),
  candidateCount: region.candidates.length,
  completeNavmeshQueries: queries.length,
  first: first && {
    length: first.length,
    endpoint: first.candidate.point,
    proof: drain(planner.verify(driver.state, first.route.points)),
    points: first.route.points,
  },
  direct:
    first &&
    drain(planner.verify(driver.state, [start.point, first.candidate.point])),
  shortestFive: shortest.map((q) => ({
    length: q.length,
    endpoint: q.candidate.point,
    proof: drain(planner.verify(driver.state, q.route.points)),
  })),
  scope:
    "Fresh global queries from the captured pose. Direct-line rejection does not prove every shorter alternative impossible. Five shortest candidate routes are independently replayed with the native controller.",
};
writeFileSync(
  `docs/captured-${id}-${marker}.json`,
  JSON.stringify(result, null, 2),
);
console.log(
  JSON.stringify(
    {
      ...result,
      first: result.first && { ...result.first, points: undefined },
    },
    null,
    2,
  ),
);
planner.destroy();
mesh.destroy();
