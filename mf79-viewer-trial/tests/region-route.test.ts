import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clipToArrival,
  inRegion,
  routeLength,
} from "../../metaflow-viewer/src/navigation/contracts";
import { NavigationTask } from "../../metaflow-viewer/src/navigation/task-state";
import { NativePlanner } from "../src/planner";
const goal = { index: 0, radius: 2 as const, camera: { x: 0, y: 1.5, z: 0 } };
const region = {
  ref: 1,
  floor: 0,
  vertices: [
    { x: -4, y: 0, z: -4 },
    { x: 4, y: 0, z: -4 },
    { x: 4, y: 0, z: 4 },
    { x: -4, y: 0, z: 4 },
  ],
};
test("route ends at the first eligible part of the disk, with a small interior stop allowance", () => {
  const route = [
    { x: -10, y: 0, z: 0 },
    { x: 0, y: 0, z: 0 },
    { x: 3, y: 0, z: 0 },
  ];
  const cut = clipToArrival(route, goal, [region])!;
  assert.ok(Math.abs(cut.entry.x + 2) < 1e-8);
  assert.ok(Math.abs(cut.points.at(-1)!.x + 1.92) < 1e-8);
  assert.ok(routeLength(cut.points) < 8.1);
  assert.ok(inRegion(cut.points.at(-1)!, 0, region));
});
test("horizontal proximity never trims to another floor or an unselected wall-side region", () => {
  assert.equal(
    clipToArrival(
      [
        { x: -3, y: 3, z: 0 },
        { x: 0, y: 3, z: 0 },
      ],
      goal,
      [region],
    ),
    null,
  );
  const other = {
    ...region,
    vertices: region.vertices.map((p) => ({ ...p, x: p.x + 10 })),
  };
  assert.equal(
    clipToArrival(
      [
        { x: -3, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 },
      ],
      goal,
      [other],
    ),
    null,
  );
});
test("a segment crossing a region between distant vertices is clipped and a slope uses interpolated support", () => {
  const slope = {
    ...region,
    vertices: region.vertices.map((p) => ({ ...p, y: p.x * 0.1 })),
  };
  const cut = clipToArrival(
    [
      { x: -5, y: -0.5, z: 0 },
      { x: 5, y: 0.5, z: 0 },
    ],
    goal,
    [slope],
  )!;
  assert.ok(cut && inRegion(cut.points.at(-1)!, cut.points.at(-1)!.y, slope));
});
test("a user already in the arrival region has zero remaining distance", () => {
  assert.equal(
    routeLength(
      clipToArrival(
        [
          { x: 1, y: 0, z: 0 },
          { x: 0, y: 0, z: 0 },
        ],
        goal,
        [region],
      )!.points,
    ),
    0,
  );
});
test("elapsed time cannot overwrite floor selection, exhausted candidates, resources, or an available route", () => {
  const state = new NavigationTask();
  for (const phase of [
    "floor",
    "exhausted",
    "error",
    "ground",
    "route",
    "loading",
    "arrived",
    "paused",
  ] as const) {
    state.set("computing", "search", 0);
    state.set(phase, phase, 200);
    assert.equal(state.text(60_000), phase);
  }
  state.set("computing", "search", 60_000);
  assert.match(state.text(90_000), /仍在计算/);
  assert.equal(state.state, "computing");
});

test("arrival inset crosses adjacent triangles and short route segments without expanding the disk", () => {
  const cut = clipToArrival(
    [
      { x: -3, y: 0, z: 0 },
      { x: -1.999, y: 0, z: 0 },
      { x: -1.99, y: 0, z: 0 },
      { x: -1, y: 0, z: 0 },
    ],
    goal,
    [region],
  )!;
  assert.ok(Math.abs(cut.points.at(-1)!.x + 1.92) < 1e-8);
  assert.ok(Math.abs(cut.insetLength - 0.08) < 1e-8);
});

test("a new target resets only its own elapsed hint, ordinary progress retains elapsed work", () => {
  const state = new NavigationTask();
  state.begin("old", 0);
  state.set("computing", "progress", 10000);
  assert.match(state.text(10001), /仍在计算/);
  state.begin("new", 10002);
  assert.equal(state.text(10003), "new");
});

test("limited interior room remains a native-verification fallback, not a hard geometry rejection", () => {
  const path = {
    reason: "complete",
    points: [
      { x: -3, y: 0, z: 0 },
      { x: -1.999, y: 0, z: 0 },
    ],
    polys: [1],
  };
  const result = NativePlanner.prototype.toArrival(path as any, goal, [region]);
  assert.ok(result);
  assert.equal(result.stopRoom, false);
});
