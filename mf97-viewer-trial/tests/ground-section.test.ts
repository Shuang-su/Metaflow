import test from "node:test";
import assert from "node:assert/strict";
import {
  sectionProjection,
  sectionModifier,
  editCenter,
} from "../src/ground/section";
test("Gaussian section and voxel overlay share the same world orthographic coordinates", () => {
  const bounds = {
    min: { x: 10, y: -0.5, z: 20 },
    max: { x: 12, y: 0.5, z: 20.32 },
  };
  for (const axis of ["x", "z"] as const) {
    const p = sectionProjection({ bounds, axis, width: 800, height: 400 });
    assert.deepEqual(p.project(p.center), { x: 400, y: 200 });
    const right = { ...p.center, [p.u]: p.maxU };
    assert.equal(p.project(right).x, 800);
    assert.equal(p.project({ ...p.center, y: p.maxY }).y, 0);
    assert.equal(p.contains({ ...p.center, z: 21 }), false);
  }
  const shader = sectionModifier(bounds);
  assert.match(shader.glsl, /originalCenter.z > 20.32/);
  assert.match(shader.wgsl, /center.x < 10.0/);
});
test("raw voxel edit address is transformed once, preserving all three dimensions", () => {
  const review = {
    gridBounds: { min: [0, 0, 0], max: [10, 10, 10] },
    voxelResolution: 0.08,
    coordinateSpace: "metaflow-rz180",
  } as any;
  assert.deepEqual(editCenter(review, { ix: 1, iy: 2, iz: 3 } as any), {
    x: -0.12,
    y: -0.2,
    z: 0.28,
  });
  assert.throws(() =>
    sectionModifier({ min: { x: NaN, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } }),
  );
});
test('oblique route sections preserve handedness, world height and slab exclusion', () => {
  const bounds = { min: { x: -4, y: -2, z: -4 }, max: { x: 4, y: 2, z: 4 } },
    frame = { origin: { x: 0, y: 0, z: 0 }, along: { x: 1, z: 1 }, halfLength: 2, halfThickness: 0.2 },
    p = sectionProjection({ bounds, axis: 'z', width: 400, height: 400, frame });
  assert.deepEqual(p.project({ x: 0, y: 0, z: 0 }), { x: 200, y: 200 });
  const point = { x: Math.SQRT1_2, y: 1, z: Math.SQRT1_2 };
  assert.ok(Math.abs(p.project(point).x - 300) < 1e-8);
  assert.equal(p.project(point).y, 100);
  assert.equal(p.contains(point), true);
  assert.equal(p.contains({ x: 1, y: 0, z: -1 }), false);
  assert.ok(Math.abs(p.right.x * p.normal.x + p.right.z * p.normal.z) < 1e-10);
  assert.match(sectionModifier(bounds, frame).wgsl, /abs\(/);
  assert.throws(() => sectionProjection({ bounds, axis: 'z', width: 400, height: 400,
    frame: { ...frame, along: { x: 0, z: 0 } } }), /frame/);
});
