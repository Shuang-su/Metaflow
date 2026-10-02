import { readFileSync, writeFileSync } from "node:fs";
import { source, assetDirectory } from "./source";
import { init, importNavMesh } from "recast-navigation";
import { NativePlanner } from "../src/planner";
import { NativeDriver, stand, horizontal, length } from "../src/native-motion";
import { Arrival } from "../../metaflow-viewer/src/navigation/contracts";
const useRegion = process.argv.includes("--region");
const radius: 2 | 3 = process.argv.includes("--radius=3") ? 3 : 2;
const suffix = radius === 3 ? "-radius-3" : "";
const id = process.argv[2],
  s = source(id),
  audit = JSON.parse(
    readFileSync(
      `docs/${useRegion ? "region-" : ""}audit-${id}${suffix}.json`,
      "utf8",
    ),
  );
const rows: any[] = [];
await init();
const mesh = importNavMesh(readFileSync(`${assetDirectory(id)}/nav.bin`)).navMesh,
  p = new NativePlanner(mesh, s.space, audit.asset);
const drain = <T>(g: Generator<unknown, T>): T => {
  let r = g.next();
  while (!r.done) r = g.next();
  return r.value;
};
for (const row of audit.rows) {
  if (row.status !== "native-replay-passed") {
    rows.push({ index: row.index, status: row.status });
    continue;
  }
  const eyes = row.points.map((p: any) => stand(s.space.collision, p));
  if (eyes.some((p: any) => !p)) {
    rows.push({ index: row.index, status: "missing-support" });
    continue;
  }
  // Record one native 60 Hz input tape, then play exactly those inputs at each display cadence.
  const origin = audit.start.position,
    driver = new NativeDriver(s.space.collision, origin),
    tape: number[][] = [],
    states: any[] = [];
  const camera = s.markers[row.index - 1].camera.initial.position;
  const goal = {
    index: row.index - 1,
    radius,
    camera: { x: camera[0], y: camera[1], z: camera[2] },
  };
  const region = p.regions(
    goal,
    drain(p.candidates(goal)),
    undefined,
    p.associate(audit.start),
  );
  let cursor = 0,
    done = false;
  for (let tick = 0; tick < 36000; tick++) {
    const p = driver.state.position;
    while (cursor < eyes.length && horizontal(p, eyes[cursor]) < 0.07) cursor++;
    if (cursor === eyes.length) {
      done = true;
      break;
    }
    const target = eyes[cursor],
      dist = horizontal(p, target),
      move = [(target.x - p.x) / dist, -(target.z - p.z) / dist];
    tape.push(move);
    states.push(driver.step(move[0], move[1]));
  }
  // Include a settled endpoint for zero-distance goals and the native damping
  // tail. Arrival still fires on the first 12 eligible moving/standing ticks.
  for (let tick = 0; tick < 30; tick++) {
    tape.push([0, 0]);
    states.push(driver.step(0, 0));
  }
  const referenceArrival = new Arrival(),
    referenceEvents: number[] = [];
  for (const state of states)
    if (referenceArrival.sample(state, goal, region.regions))
      referenceEvents.push(state.tick);
  const cadence: any[] = [];
  for (const [name, frames] of [
    ["30", [1 / 30]],
    ["60", [1 / 60]],
    ["120", [1 / 120]],
    ["jitter", [0.008, 0.011, 0.023, 0.019, 0.027]],
  ] as const) {
    const d = new NativeDriver(s.space.collision, origin),
      captured: any[] = [],
      arrivals: number[] = [],
      arrival = new Arrival();
    d.controller.onPhysicsStep = (state) => {
      d.state = state;
      captured.push(state);
      if (arrival.sample(state, goal, region.regions))
        arrivals.push(state.tick);
    };
    // Physics consumes the recorded timestamped tape at 60 Hz; display clocks only group ticks.
    let accumulator = 0,
      i = 0,
      frame = 0;
    while (i < tape.length) {
      accumulator += frames[frame++ % frames.length];
      let sub = 0;
      while (accumulator >= 1 / 60 && i < tape.length && sub++ < 6) {
        d.step(tape[i][0], tape[i][1]);
        i++;
        accumulator -= 1 / 60;
      }
    }
    let error = 0;
    for (let k = 0; k < states.length; k++)
      error = Math.max(error, length(states[k].position, captured[k].position));
    cadence.push({
      name,
      ticks: captured.length,
      error,
      endpoint: captured.at(-1)?.position,
      arrived: arrivals.length === 1,
      arrivalTicks: arrivals,
      sameArrival: JSON.stringify(arrivals) === JSON.stringify(referenceEvents),
    });
  }
  rows.push({
    index: row.index,
    status:
      done &&
      cadence.every((c) => c.arrived && c.sameArrival && c.error <= 0.01)
        ? "replayed"
        : "arrival-or-motion-failed",
    referenceArrivalTicks: referenceEvents,
    ticks: tape.length,
    cadence,
  });
}
writeFileSync(
  `docs/${useRegion ? "region-" : ""}replay-${id}${suffix}.json`,
  JSON.stringify(
    {
      scene: id,
      asset: audit.asset,
      note: "Identical recorded native input tape and precomputed routes, with the actual query-independent Arrival predicate. Display grouping does not feed physics. Live browser input and query timing are outside this replay.",
      rows,
    },
    null,
    2,
  ),
);
p.destroy();
mesh.destroy();
console.log(
  id,
  radius,
  useRegion,
  rows.filter((r) => r.status === "replayed").length,
  "/",
  rows.length,
);

if (rows.some((r) => r.status !== "replayed")) process.exitCode = 1;
