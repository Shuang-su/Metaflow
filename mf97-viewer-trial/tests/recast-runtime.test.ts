import { test } from "node:test";
import assert from "node:assert/strict";
import {
  init,
  exportNavMesh,
} from "../../mf79-viewer-trial/src/recast-runtime";
import { RecastTileBuilder } from "../../mf79-viewer-trial/src/tiles";

test("MF97 initialization enables the same Recast instance used by MF79 tile builders", async () => {
  await init();
  const builder = new RecastTileBuilder({
    min: { x: 0, y: -1, z: 0 },
    max: { x: 2, y: 2, z: 2 },
  });
  try {
    assert.ok(exportNavMesh(builder.mesh).byteLength > 0);
  } finally {
    builder.destroy();
  }
});
