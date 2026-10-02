import test from "node:test";
import assert from "node:assert/strict";
import { navigationTiles } from "../../mf79-viewer-trial/src/tiles";
test("exact Dayun world tile does not grow a duplicate tile from roundoff", () => {
  const bounds = {
    min: { x: -526.08, y: 5.12, z: -290.56 },
    max: { x: -505.6, y: 19.2, z: -270.08 },
  };
  assert.equal(navigationTiles(bounds, 0.04, 512).length, 1);
  const realExcess = structuredClone(bounds);
  realExcess.max.x += 1e-6;
  assert.equal(navigationTiles(realExcess, 0.04, 512).length, 2);
  const two = structuredClone(bounds);
  two.max.x += 20.48;
  assert.equal(navigationTiles(two, 0.04, 512).length, 2);
});
