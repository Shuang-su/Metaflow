import test from "node:test";
import assert from "node:assert/strict";
import {
  SurfaceCatalogIndex,
  SupportTracker,
  surfaceIdentity,
  type SurfaceCatalog,
  type CatalogSurface,
} from "../../metaflow-viewer/src/navigation/layers";
import {
  Arrival,
  clipToArrival,
  type Route,
} from "../../metaflow-viewer/src/navigation/contracts";
import {
  nearbyNavigationAnnotationIndices,
  setNavigationSurfaceContext,
  withNavigationEnabled,
} from "../../metaflow-viewer/src/navigation/nav-annotation";
import type { WalkPhysicsState } from "../../metaflow-viewer/src/cameras/walk-controller";
import { NativePlanner } from "../../mf79-viewer-trial/src/planner";
import { NativeDriver } from "../../mf79-viewer-trial/src/native-motion";
import { MeshCollision } from "../../metaflow-viewer/src/collision/mesh-collision";
import { mapRouteForLayer } from "../../metaflow-viewer/src/navigation/drawing";

const rectangle = (
  id: string,
  x0: number,
  x1: number,
  y0: number,
  y1 = y0,
): CatalogSurface => {
  const footprint = [
    { x: x0, y: y0, z: 0 },
    { x: x1, y: y1, z: 0 },
    { x: x1, y: y1, z: 2 },
    { x: x0, y: y0, z: 2 },
  ];
  const slope = (y1 - y0) / (x1 - x0);
  const candidate = surfaceIdentity("candidate", y0, footprint, [
    -slope,
    1,
    0,
    slope * x0 - y0,
  ]);
  return {
    id,
    kind: "floor",
    layerId: "hall",
    bounds: candidate.bounds,
    plane: candidate.plane,
    footprint,
  };
};
const catalog = (): SurfaceCatalog => {
  const lower = rectangle("lower", 0, 2, 0),
    upper = { ...rectangle("upper", 4, 6, 2), layerId: "terrace" };
  const ramp = {
    ...rectangle("ramp", 2, 4, 0, 2),
    kind: "transition",
    connects: ["hall", "terrace"],
  } as CatalogSurface;
  return {
    version: 1,
    status: "confirmed",
    sceneId: "fixture",
    collisionFingerprint: "collision-v1",
    layers: [
      { id: "hall", label: "大厅" },
      { id: "terrace", label: "平台" },
    ],
    surfaces: [lower, ramp, upper],
    contacts: [
      {
        a: "lower",
        b: "ramp",
        portal: { start: { x: 2, y: 0, z: 0 }, end: { x: 2, y: 0, z: 2 } },
        forward: "up-entry",
        reverse: "down-exit",
      },
      {
        a: "ramp",
        b: "upper",
        portal: { start: { x: 4, y: 2, z: 0 }, end: { x: 4, y: 2, z: 2 } },
        forward: "up-exit",
        reverse: "down-entry",
      },
    ],
    destinations: [
      { index: 0, surfaceId: "lower" },
      { index: 1, surfaceId: "upper" },
    ],
  };
};
const pose = (
  tick: number,
  x: number,
  y: number,
  epoch = 1,
): WalkPhysicsState => ({
  tick,
  epoch,
  position: { x, y: y + 1.5, z: 1 },
  velocity: { x: 0, y: 0, z: 0 },
  supportHeight: y,
  grounded: true,
  jumping: false,
  collision: "active",
  yaw: 0,
  input: [0, 0, 0],
  body: { radius: 0.2, height: 1.5, eye: 1.3, hover: 0.2 },
});

test("runtime catalog uses explicit layers and requires matching source plus both transition endpoints", () => {
  const c = catalog(),
    index = new SurfaceCatalogIndex(c, "collision-v1");
  assert.deepEqual(
    index.catalog.layers.map((l) => l.id),
    ["hall", "terrace"],
  );
  assert.throws(() => new SurfaceCatalogIndex(c, "stale"), /stale/);
  assert.throws(
    () =>
      new SurfaceCatalogIndex(
        { ...c, status: "candidate" } as any,
        "collision-v1",
      ),
    /Unconfirmed/,
  );
  assert.throws(
    () =>
      new SurfaceCatalogIndex(
        { ...c, contacts: c.contacts.slice(0, 1) },
        "collision-v1",
      ),
    /endpoints/,
  );
  const missingProof = structuredClone(c);
  missingProof.contacts[0].reverse = "";
  assert.throws(
    () => new SurfaceCatalogIndex(missingProof, "collision-v1"),
    /bidirectional/,
  );
  // Changing the caller's original geometry cannot mutate the validated snapshot.
  c.surfaces[0].footprint[0].x = 100;
  assert.equal(index.unique({ x: 1, y: 0, z: 1 })?.id, "lower");
});

test("native support crosses the verified ramp in both directions; ramp height never changes floor early", () => {
  const index = new SurfaceCatalogIndex(catalog(), "collision-v1"),
    up = new SupportTracker(index),
    down = new SupportTracker(index);
  const samples = [
    pose(1, 1.9, 0),
    pose(2, 2.1, 0.1),
    pose(3, 3.7, 1.7),
    pose(4, 4.1, 2),
  ];
  const before = JSON.stringify(samples),
    a = samples.map((s) => up.sample(s));
  assert.deepEqual(
    a.map((v) => [v.status, v.layerId]),
    [
      ["confirmed", "hall"],
      ["transition", "hall"],
      ["transition", "hall"],
      ["confirmed", "terrace"],
    ],
  );
  const b = [
    pose(1, 4.1, 2),
    pose(2, 3.9, 1.9),
    pose(3, 2.1, 0.1),
    pose(4, 1.9, 0),
  ].map((s) => down.sample(s));
  assert.deepEqual(
    b.map((v) => v.layerId),
    ["terrace", "terrace", "terrace", "hall"],
  );
  assert.equal(JSON.stringify(samples), before);
  const onRamp = new SupportTracker(index).sample(pose(1, 3, 1));
  assert.equal(onRamp.status, "transition");
  assert.equal(onRamp.layerId, null);
});

test("same-height and stacked surfaces do not authorize a floor switch or a shortcut", () => {
  const c = catalog();
  c.surfaces.push({ ...rectangle("other", -2, 0, 0), layerId: "terrace" });
  const index = new SurfaceCatalogIndex(c, "collision-v1"),
    tracker = new SupportTracker(index);
  assert.equal(tracker.sample(pose(1, 0.1, 0)).layerId, "hall");
  assert.equal(tracker.sample(pose(2, -0.1, 0)).status, "unknown");
  assert.throws(
    () =>
      index.route([
        { x: 1, y: 0, z: 1 },
        { x: -1, y: 0, z: 1 },
      ]),
    /unverified/,
  );
  assert.throws(
    () =>
      index.route([
        { x: 1, y: 0, z: 1 },
        { x: 5, y: 0, z: 1 },
      ]),
    /unknown|ambiguous/,
  );
  assert.equal(
    tracker.sample({ ...pose(3, 4.5, 2), collision: "held" }).status,
    "unknown",
  );
  assert.equal(tracker.sample(pose(4, 4.5, 2, 2)).layerId, "terrace");
});

test("wide verified portals allow crossings away from their centre; unverified edge portions stay blocked", () => {
  const index = new SurfaceCatalogIndex(catalog(), "collision-v1");
  for (const z of [0.1, 1.9]) {
    const tracker = new SupportTracker(index);
    assert.equal(
      tracker.sample({ ...pose(1, 1.9, 0), position: { x: 1.9, y: 1.5, z } })
        .status,
      "confirmed",
    );
    assert.equal(
      tracker.sample({ ...pose(2, 2.1, 0.1), position: { x: 2.1, y: 1.6, z } })
        .status,
      "transition",
    );
    assert.doesNotThrow(() =>
      index.route([
        { x: 1, y: 0, z },
        { x: 2, y: 0, z },
        { x: 4, y: 2, z },
        { x: 5, y: 2, z },
      ]),
    );
  }
  const restricted = catalog();
  restricted.contacts[0].portal = {
    start: { x: 2, y: 0, z: 0.4 },
    end: { x: 2, y: 0, z: 1.6 },
  };
  const narrow = new SurfaceCatalogIndex(restricted, "collision-v1");
  assert.equal(narrow.linked("lower", "ramp", { x: 2, y: 0, z: 0.2 }), false);
  assert.throws(
    () =>
      narrow.route([
        { x: 1, y: 0, z: 0.2 },
        { x: 2, y: 0, z: 0.2 },
        { x: 4, y: 2, z: 0.2 },
      ]),
    /unverified/,
  );
  assert.equal(narrow.linked("lower", "lower", { x: 1, y: 0, z: 0.2 }), true);
  const pointOnly = catalog();
  pointOnly.contacts[0].portal = {
    start: { x: 2, y: 0, z: 1 },
    end: { x: 2, y: 0, z: 1 },
  };
  const pointIndex = new SurfaceCatalogIndex(pointOnly, "collision-v1");
  assert.equal(pointIndex.linked("lower", "ramp", { x: 2, y: 0, z: 1 }), true);
  assert.equal(
    pointIndex.linked("lower", "ramp", { x: 2, y: 0, z: 1.1 }),
    false,
  );
  const notShared = catalog();
  notShared.contacts[0].portal.end = { x: 2.4, y: 0.4, z: 1 };
  assert.throws(
    () => new SurfaceCatalogIndex(notShared, "collision-v1"),
    /geometry/,
  );
});

test("a native jump ends the ground chain and a unique landing reacquires without a walking shortcut", () => {
  const c = catalog();
  c.surfaces.push({ ...rectangle("other", -2, 0, 0), layerId: "terrace" });
  const index = new SurfaceCatalogIndex(c, "collision-v1"),
    tracker = new SupportTracker(index);
  assert.equal(tracker.sample(pose(1, 0.1, 0)).layerId, "hall");
  const airborne = {
    ...pose(2, -0.1, 0.8),
    grounded: false,
    jumping: true,
    supportHeight: null,
  };
  const unknown = tracker.sample(airborne);
  assert.equal(unknown.status, "unknown");
  assert.equal(tracker.sample(airborne), unknown);
  const landed = tracker.sample(pose(3, -0.2, 0));
  assert.equal(landed.surfaceId, "other");
  assert.equal(landed.layerId, "terrace");
  assert.equal(
    tracker.sample({ ...pose(4, 1, 0), collision: "held" }).status,
    "unknown",
  );
  assert.equal(tracker.sample(pose(5, 1, 0)).surfaceId, "lower");
  // Shared coplanar boundary is ambiguous after a discontinuity, not an inferred layer.
  tracker.sample({ ...pose(6, 0, 0), grounded: false });
  assert.equal(tracker.sample(pose(7, 0, 0)).status, "ambiguous");
});

test("route occurrences are rebuilt from current points after clipping and maintenance", () => {
  const index = new SurfaceCatalogIndex(catalog(), "collision-v1");
  const points = [
    { x: 1, y: 0, z: 1 },
    { x: 2, y: 0, z: 1 },
    { x: 4, y: 2, z: 1 },
    { x: 5, y: 2, z: 1 },
  ];
  const route = index.route(points);
  assert.deepEqual(
    route.surfaces.map((v) => v.surfaceId),
    ["lower", "ramp", "upper"],
  );
  assert.deepEqual(
    route.surfaces.map((v) => v.layerId),
    ["hall", undefined, "terrace"],
  );
  const repeated = index.route([...points, ...points.slice(0, -1).reverse()]);
  assert.deepEqual(
    repeated.surfaces.map((v) => v.surfaceId),
    ["lower", "ramp", "upper", "ramp", "lower"],
  );
  const clipped = clipToArrival(
    route.points,
    { index: 1, camera: { x: 5.9, y: 3.5, z: 1 }, radius: 2 },
    [
      {
        ref: 2,
        vertices: index.surfaces.get("upper")!.footprint,
        floor: 2,
        surfaceId: "upper",
        layerId: "terrace",
        catalog: index.fingerprint,
      },
    ],
  );
  assert.ok(clipped);
  const planner = Object.create(NativePlanner.prototype) as NativePlanner;
  // Exercise the exact decorator called by Worker, recover(), and maintain().
  (planner as any).catalog = index;
  const rebuilt = planner.decorateRoute({
    points: clipped.points,
    polys: [1, 2, 3],
    asset: "a",
    revision: 2,
    surfaces: [{ surfaceId: "stale", layerId: "wrong", start: 0, end: 99 }],
  } as Route);
  assert.equal(rebuilt.surfaces!.at(-1)!.end, rebuilt.points.length - 1);
  assert.equal(rebuilt.catalog, index.fingerprint);
  assert.equal(
    rebuilt.surfaces!.some((v) => v.surfaceId === "stale"),
    false,
  );
  const tail = planner.decorateRoute({
    ...rebuilt,
    points: rebuilt.points.slice(1),
    revision: 3,
  });
  assert.equal(tail.surfaces![0].start, 0);
  assert.equal(tail.surfaces!.at(-1)!.end, tail.points.length - 1);
});

test("arrival requires the current catalog and same native tick, then retains the 12-tick 2m rule", () => {
  const index = new SurfaceCatalogIndex(catalog(), "collision-v1"),
    tracker = new SupportTracker(index),
    arrival = new Arrival();
  const goal = {
    index: 1,
    camera: { x: 5, y: 3.5, z: 1 },
    radius: 2 as const,
    surfaceId: "upper",
  };
  const regions = [
    {
      ref: 2,
      vertices: index.surfaces.get("upper")!.footprint,
      floor: 2,
      surfaceId: "upper",
      layerId: "terrace",
      catalog: index.fingerprint,
    },
  ];
  arrival.bindSurfaceCatalog(index, true);
  for (let i = 1; i <= 12; i++) {
    const s = pose(i, 5, 2),
      a = tracker.sample(s);
    assert.equal(
      arrival.sample(s, goal, regions, { ...a, catalog: "old" }),
      false,
    );
  }
  for (let i = 13; i <= 24; i++) {
    const s = pose(i, 5, 2),
      a = tracker.sample(s);
    assert.equal(
      arrival.sample(s, goal, regions, { ...a, tick: i - 1 }),
      false,
    );
  }
  for (let i = 25; i <= 36; i++) {
    const s = pose(i, 5, 2),
      a = tracker.sample(s);
    assert.equal(arrival.sample(s, goal, regions, a), i === 36);
  }
  assert.equal(
    arrival.sample(
      pose(37, 5, 2),
      goal,
      regions,
      tracker.sample(pose(37, 5, 2)),
    ),
    false,
  );
  arrival.bindSurfaceCatalog(null, true);
  for (let i = 40; i <= 55; i++)
    assert.equal(arrival.sample(pose(i, 5, 2), goal, regions), false);
});

test("nearby destinations use reviewed surface bindings, with unchanged single-layer fallback", () => {
  const index = new SurfaceCatalogIndex(catalog(), "collision-v1"),
    tracker = new SupportTracker(index);
  const nav = withNavigationEnabled(
    {
      camera: {
        initial: { position: [1, 1.5, 1], target: [1, 0, 0], fov: 75 },
      },
    },
    true,
  );
  const annotations = [nav, nav, nav];
  setNavigationSurfaceContext(annotations, {
    required: true,
    catalog: index,
    association: tracker.sample(pose(1, 1, 0)),
  });
  assert.deepEqual(
    nearbyNavigationAnnotationIndices(
      annotations,
      { x: 1, y: 1.5, z: 1 },
      0,
      null,
    ),
    [0],
  );
  assert.deepEqual(
    nearbyNavigationAnnotationIndices(
      annotations,
      { x: 1, y: 1.5, z: 1 },
      0,
      1,
    ),
    [1, 0],
  );
  setNavigationSurfaceContext(annotations, null);
  assert.deepEqual(
    nearbyNavigationAnnotationIndices(
      annotations,
      { x: 1, y: 1.5, z: 1 },
      0,
      null,
    ),
    [0, 1, 2],
  );
});

test("support observation preserves every native motion result at 30/60/120 Hz and jitter", () => {
  const mesh = new MeshCollision(
    new Float32Array([-10, 0, -10, 10, 0, -10, 10, 0, 10, -10, 0, 10]),
    new Uint32Array([0, 2, 1, 0, 3, 2]),
  );
  for (const frames of [
    [1 / 30],
    [1 / 60],
    [1 / 120],
    [0.008, 0.025, 0.011, 0.019, 0.021],
  ]) {
    const a = new NativeDriver(mesh, { x: 1, y: 1.5, z: 1 }),
      b = new NativeDriver(mesh, { x: 1, y: 1.5, z: 1 });
    const tracker = new SupportTracker(
      new SurfaceCatalogIndex(catalog(), "collision-v1"),
    );
    const observations: unknown[] = [];
    b.controller.onPhysicsStep = (s) => {
      b.state = s;
      observations.push(tracker.sample(s));
    };
    for (let i = 0; i < 120; i++) {
      const dt = frames[i % frames.length];
      a.step(0.01, 0, false, dt);
      b.step(0.01, 0, false, dt);
      assert.deepEqual(a.state, b.state);
      assert.deepEqual(a.camera, b.camera);
    }
    assert.ok(observations.length);
  }
});

test("transition route displays on its two explicit layers without assigning intermediate height to a floor", () => {
  const index = new SurfaceCatalogIndex(catalog(), "collision-v1");
  const rebuilt = index.route([
    { x: 1, y: 0, z: 1 },
    { x: 2, y: 0, z: 1 },
    { x: 4, y: 2, z: 1 },
    { x: 5, y: 2, z: 1 },
  ]);
  const route = { ...rebuilt, polys: [1, 2, 3], asset: "a", revision: 1 };
  const layers = [
    {
      id: "hall",
      label: "大厅",
      supportRange: [-0.3, 2.3] as [number, number],
    },
    {
      id: "terrace",
      label: "平台",
      supportRange: [-0.3, 2.3] as [number, number],
    },
  ];
  const lower = mapRouteForLayer(route, layers, "hall"),
    upper = mapRouteForLayer(route, layers, "terrace");
  assert.equal(lower.unconfirmed, false);
  assert.equal(upper.unconfirmed, false);
  assert.ok(lower.boundaries.some((b) => b.label.includes("平台")));
  assert.ok(upper.boundaries.some((b) => b.label.includes("大厅")));
  assert.equal(
    lower.segments.some((s) => s.end.x > 4),
    false,
  );
  assert.equal(
    upper.segments.some((s) => s.start.x < 2),
    false,
  );
  const wrongMap = [
    {
      id: "unrelated",
      label: "Other",
      supportRange: [-10, 10] as [number, number],
    },
  ];
  const mismatch = mapRouteForLayer(route, wrongMap, "unrelated", true);
  assert.equal(mismatch.unconfirmed, true);
  assert.equal(mismatch.segments.length, 0);
});
