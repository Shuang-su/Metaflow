import assert from "node:assert/strict";
import test from "node:test";
import { repairCorridor, shortcutCorridor } from "../src/corridor";

test("forward motion consumes travelled polygons without a reverse prefix", () => {
  assert.deepEqual(repairCorridor([1, 2, 3, 4], [1, 2, 3]), [3, 4]);
});
test("side step connects through the latest shared surface", () => {
  assert.deepEqual(repairCorridor([1, 2, 3, 4], [1, 2, 8]), [8, 2, 3, 4]);
});
test("actual backwards motion adds a valid forward return, then consumes it again", () => {
  const backwards = repairCorridor([3, 4], [3, 2, 1]);
  assert.deepEqual(backwards, [1, 2, 3, 4]);
  assert.deepEqual(repairCorridor(backwards!, [1, 2, 3]), [3, 4]);
});
test("separate floor or wall-side topology cannot be joined by closeness", () => {
  assert.equal(repairCorridor([1, 2, 3], [8, 9]), null);
});
test("repeated occurrence and the captured marker-35 loop are rejected for re-query", () => {
  assert.equal(repairCorridor([1, 2, 3, 2, 4], [1, 2]), null);
  assert.equal(
    repairCorridor(
      [5514315, 5448231, 5514315, 5514316, 5514314, 5514316, 5514315, 5448231],
      [5514315, 5510607],
    ),
    null,
  );
});
test("64 polygons is a processing preference, not a reason to keep travelled prefix", () => {
  const path = Array.from({ length: 100 }, (_, i) => i + 1);
  assert.deepEqual(repairCorridor(path, path.slice(0, 80)), path.slice(79));
});

test("same-surface visibility shortcut removes a stale detour but keeps its suffix", () => {
  assert.deepEqual(shortcutCorridor([1, 2, 3, 4, 5], [1, 8, 4]), [1, 8, 4, 5]);
  assert.equal(shortcutCorridor([1, 2, 3, 4], [1, 8, 9]), null);
  assert.equal(shortcutCorridor([1, 2, 3, 4], [1, 3, 2]), null);
});
