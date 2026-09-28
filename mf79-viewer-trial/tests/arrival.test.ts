import { test } from "node:test";
import assert from "node:assert/strict";
import { Arrival } from "../../metaflow-viewer/src/navigation/contracts";
const goal = {
  index: 26,
  camera: { x: 0, y: 2.005, z: 0 },
  radius: 2 as const,
};
const region = {
  ref: 1,
  floor: -0.16,
  vertices: [
    { x: -3, y: -0.16, z: -3 },
    { x: 3, y: -0.16, z: -3 },
    { x: 3, y: -0.16, z: 3 },
    { x: -3, y: -0.16, z: 3 },
  ],
};
const sample = (tick: number, overrides: object = {}) => ({
  tick,
  epoch: 1,
  position: { x: 1.7, y: 1.34, z: 0 },
  velocity: { x: 1, y: 0, z: 0 },
  supportHeight: -0.16,
  grounded: true,
  jumping: false,
  collision: "active" as const,
  yaw: 0,
  input: [0, 0, 0],
  body: { radius: 0.2, height: 1.5, eye: 1.3, hover: 0.2 },
  ...overrides,
});
test("APMS 27 can arrive despite a high saved camera, while moving and with no query result", () => {
  const a = new Arrival();
  for (let i = 1; i < 12; i++)
    assert.equal(a.sample(sample(i), goal, [region]), false);
  assert.equal(a.sample(sample(12), goal, [region]), true);
  for (let i = 13; i < 1000; i++)
    assert.equal(a.sample(sample(i), goal, [region]), false);
});
test("jump, wrong floor and held collision cannot cause arrival", () => {
  for (const patch of [
    { jumping: true },
    { supportHeight: 3 },
    { collision: "held" as const },
    { grounded: false },
  ]) {
    const a = new Arrival();
    for (let i = 0; i < 120; i++)
      assert.equal(a.sample(sample(i, patch), goal, [region]), false);
  }
});
test("no successful query or global retry count is needed; expanding radius immediately applies", () => {
  const a = new Arrival();
  for (let i = 0; i < 20; i++)
    assert.equal(
      a.sample(sample(i, { position: { x: 2.6, y: 1.34, z: 0 } }), goal, [
        region,
      ]),
      false,
    );
  for (let i = 20; i < 31; i++)
    assert.equal(
      a.sample(
        sample(i, { position: { x: 2.6, y: 1.34, z: 0 } }),
        { ...goal, radius: 3 },
        [region],
      ),
      false,
    );
  assert.equal(
    a.sample(
      sample(31, { position: { x: 2.6, y: 1.34, z: 0 } }),
      { ...goal, radius: 3 },
      [region],
    ),
    true,
  );
});
test("reset/teleport epoch and pause break consecutive arrival ticks", () => {
  const a = new Arrival();
  for (let i = 0; i < 10; i++) a.sample(sample(i), goal, [region]);
  for (let i = 10; i < 21; i++)
    assert.equal(a.sample(sample(i, { epoch: 2 }), goal, [region]), false);
  assert.equal(a.sample(sample(21, { epoch: 2 }), goal, [region]), true);
});
