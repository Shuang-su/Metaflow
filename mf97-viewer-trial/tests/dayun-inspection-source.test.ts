import test from "node:test";
import assert from "node:assert/strict";
import { selectDayunInspectionSource } from "../src/dayun-inspection-source";
test("bounded Gaussian inspection preserves exact LOD0 references and reverses X/Y once", () => {
  const leaf = (min: number[], max: number[], file: number) => ({
    bound: { min, max },
    lods: {
      0: { file, offset: 7, count: 12 },
      1: { file: 1, offset: 0, count: 3 },
    },
  });
  const source = {
    lodLevels: 2,
    filenames: ["0_0/meta.json", "1_0/meta.json", "0_1/meta.json"],
    tree: {
      bound: { min: [0, 0, 0], max: [200, 200, 200] },
      children: [
        leaf([10, 2, 30], [12, 4, 32], 0),
        leaf([100, 100, 100], [102, 102, 102], 2),
      ],
    },
  };
  const original = structuredClone(source),
    r = selectDayunInspectionSource(source, [-11, -3, 31], 2);
  assert.equal(r.coverage.sourceLeaves, 2);
  assert.equal(r.coverage.selectedLeaves, 1);
  assert.equal(r.coverage.selectedSplats, 12);
  assert.deepEqual(r.coverage.leafReferences, [
    { file: 0, offset: 7, count: 12 },
  ]);
  assert.equal(r.manifest.lodLevels, 1);
  assert.deepEqual(r.manifest.tree.children[0].lods, {
    0: { file: 0, offset: 7, count: 12 },
  });
  assert.deepEqual(source, original);
  assert.throws(
    () => selectDayunInspectionSource(source, [11, 3, 31], 2),
    /No original/,
  );
});
test("inspection budgets reject oversized selection before model loading", () => {
  const leaf = (file: number, count = 1) => ({
    bound: { min: [0, 0, 0], max: [1, 1, 1] },
    lods: { 0: { file, offset: 0, count } },
  });
  const source = {
    filenames: Array.from({ length: 17 }, (_, i) => `0_${i}/meta.json`),
    tree: { children: [leaf(0, 5_000_001)] },
  };
  assert.throws(
    () => selectDayunInspectionSource(source, [0, 0, 0], 2),
    /small-view budget/,
  );
  source.tree.children = Array.from({ length: 17 }, (_, i) => leaf(i));
  assert.throws(
    () => selectDayunInspectionSource(source, [0, 0, 0], 2),
    /small-view budget/,
  );
  source.tree.children = [leaf(0)];
  source.tree.children[0].bound.min[0] = NaN;
  assert.throws(
    () => selectDayunInspectionSource(source, [0, 0, 0], 2),
    /leaf bounds/,
  );
});
test("multiple retained leaves keep separate exact intervals and bounded hierarchy", () => {
  const source = {
    filenames: ["0_0/meta.json"],
    tree: {
      bound: { min: [0, 0, 0], max: [100, 100, 100] },
      children: [
        {
          bound: { min: [0, 0, 0], max: [1, 1, 1] },
          lods: { 0: { file: 0, offset: 3, count: 9 } },
        },
        {
          bound: { min: [2, 0, 0], max: [3, 1, 1] },
          lods: { 0: { file: 0, offset: 29, count: 4 } },
        },
        {
          bound: { min: [90, 90, 90], max: [100, 100, 100] },
          lods: { 0: { file: 0, offset: 78, count: 11 } },
        },
      ],
    },
  };
  const r = selectDayunInspectionSource(source, [-1.5, -0.5, 0.5], 2);
  assert.deepEqual(r.coverage.leafReferences, [
    { file: 0, offset: 3, count: 9 },
    { file: 0, offset: 29, count: 4 },
  ]);
  assert.deepEqual(r.manifest.tree.bound, { min: [0, 0, 0], max: [3, 1, 1] });
  assert.deepEqual(r.coverage.fileIndices, [0]);
});
