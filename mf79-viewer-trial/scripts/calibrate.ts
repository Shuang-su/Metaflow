import { MeshCollision } from "../../metaflow-viewer/src/collision/mesh-collision";
import { NativeDriver } from "../src/native-motion";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const rows: any[] = [];
for (const height of [0.04, 0.08, 0.12, 0.16, 0.2, 0.24, 0.32, 0.4])
  for (const width of [0.08, 0.24, 0.8])
    for (const angle of [0, 45, 90, 180, 270]) {
      const positions: number[] = [],
        indices: number[] = [];
      const quad = (a: number[], b: number[], c: number[], d: number[]) => {
        const i = positions.length / 3;
        positions.push(...a, ...b, ...c, ...d);
        indices.push(i, i + 2, i + 1, i, i + 3, i + 2);
      };
      quad([-8, 0, -8], [8, 0, -8], [8, 0, 8], [-8, 0, 8]);
      quad(
        [0, height, -4],
        [width, height, -4],
        [width, height, 4],
        [0, height, 4],
      );
      quad([0, 0, -4], [0, height, -4], [0, height, 4], [0, 0, 4]);
      quad(
        [width, 0, 4],
        [width, height, 4],
        [width, height, -4],
        [width, 0, -4],
      );
      const a = (angle * Math.PI) / 180;
      for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i],
          z = positions[i + 2];
        positions[i] = x * Math.cos(a) - z * Math.sin(a);
        positions[i + 2] = x * Math.sin(a) + z * Math.cos(a);
      }
      const c = new MeshCollision(
        new Float32Array(positions),
        new Uint32Array(indices),
      );
      const d = new NativeDriver(c, {
        x: -Math.cos(a),
        y: 1.5,
        z: -Math.sin(a),
      });
      let maxY = 1.5;
      for (let tick = 0; tick < 240; tick++) {
        d.step(Math.cos(a), -Math.sin(a));
        maxY = Math.max(maxY, d.state.position.y);
      }
      const progress =
        d.state.position.x * Math.cos(a) + d.state.position.z * Math.sin(a);
      rows.push({
        height,
        width,
        angle,
        passed: progress > width + 0.5,
        progress,
        maxY,
        collision: d.state.collision,
      });
    }
const passed = Array.from(new Set(rows.map((r) => r.height))).filter((h) =>
  rows.filter((r) => r.height <= h).every((r) => r.passed),
);
const result = {
  controllerHash: createHash("sha256")
    .update(readFileSync("../metaflow-viewer/src/cameras/walk-controller.ts"))
    .digest("hex"),
  geometry:
    "same-sized triangle steps, five headings, forward ascent and descent, no jump",
  rows,
  conservativeClimb: Math.max(0, ...passed),
};
mkdirSync("docs", { recursive: true });
writeFileSync("docs/native-calibration.json", JSON.stringify(result, null, 2));
console.log(
  JSON.stringify({
    conservativeClimb: result.conservativeClimb,
    passed: rows.filter((r) => r.passed).length,
    total: rows.length,
  }),
);
