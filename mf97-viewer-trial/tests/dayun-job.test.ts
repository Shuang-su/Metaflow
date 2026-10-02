import test from "node:test";
import assert from "node:assert/strict";
import { navigationTiles } from "../../mf79-viewer-trial/src/tiles";
import { validateDayunResume } from "../src/dayun-job";
test("resuming a navigation job refuses changed, duplicate, missing, or unrelated tiles", () => {
  const tiles = navigationTiles(
    { min: { x: 0, y: 0, z: 0 }, max: { x: 40.96, y: 8, z: 20.48 } },
    0.04,
    512,
  );
  const saved = {
    fingerprint: "same",
    status: "building",
    tiles: [{ ...tiles[0], name: "tile-0-0", hash: "a".repeat(64) }],
  };
  assert.doesNotThrow(() => validateDayunResume(saved, "same", tiles));
  assert.throws(() => validateDayunResume(saved, "new", tiles), /job mismatch/);
  assert.throws(
    () =>
      validateDayunResume(
        { ...saved, tiles: [...saved.tiles, ...saved.tiles] },
        "same",
        tiles,
      ),
    /duplicate/,
  );
  assert.throws(
    () =>
      validateDayunResume(
        { ...saved, tiles: [{ ...saved.tiles[0], name: "tile-3-3" }] },
        "same",
        tiles,
      ),
    /Unexpected/,
  );
  const changed = structuredClone(saved);
  changed.tiles[0].bounds.min.x = 0.08;
  assert.throws(
    () => validateDayunResume(changed, "same", tiles),
    /bounds mismatch/,
  );
  assert.throws(
    () => validateDayunResume({ ...saved, status: "complete" }, "same", tiles),
    /missing tiles/,
  );
  assert.doesNotThrow(() =>
    validateDayunResume(
      {
        ...saved,
        status: "analysis-complete",
        tiles: [...saved.tiles, { ...tiles[1], name: "tile-1-0", hash: null }],
      },
      "same",
      tiles,
    ),
  );
});
