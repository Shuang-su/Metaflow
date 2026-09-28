import { readFileSync, statfsSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { VoxelCollision } from "../../metaflow-viewer/src/collision/voxel-collision";
import type { Space, Point } from "../src/types";
export const cache =
  "/Volumes/Prism/Metaflow/.codex-work/cache/mf79-native-viewer-v1";
export const sha = (b: string | Uint8Array) =>
  createHash("sha256").update(b).digest("hex");
export function source(id: string) {
  const scene = JSON.parse(
    readFileSync("scene-exhibitions.json", "utf8"),
  ).scenes.find((s: any) => s.id === id);
  if (!scene) throw Error("Unknown scene");
  const file = resolve(
    "/Volumes/Prism_初号機/3D高斯",
    scene.collisionUrl.replace("/scene-assets/", ""),
  );
  const bytes = readFileSync(file),
    meta = JSON.parse(bytes.toString()),
    binary = readFileSync(file.replace(/\.json$/, ".bin"));
  const words = new Uint32Array(
    binary.buffer.slice(
      binary.byteOffset,
      binary.byteOffset + binary.byteLength,
    ),
  );
  const p = (a: number[]): Point => ({ x: a[0], y: a[1], z: a[2] }),
    bounds = { min: p(meta.gridBounds.min), max: p(meta.gridBounds.max) };
  const c = meta.nodeWordCount ?? meta.nodeCount;
  const space: Space = {
    bounds,
    collision: new VoxelCollision(meta, words.slice(0, c), words.slice(c)),
    known: (x, y, z) =>
      [x, y, z].every(
        (v, i) => v >= meta.gridBounds.min[i] && v < meta.gridBounds.max[i],
      ),
  };
  const markerBytes = readFileSync(
    id === "apms-2026"
      ? "apms-markers-42.mfstudio.json"
      : "sdi-25.settings.json",
  );
  const raw = JSON.parse(markerBytes.toString()),
    markers = id === "apms-2026" ? raw.experience.annotations : raw.annotations;
  return {
    scene,
    bounds,
    space,
    meta,
    binary,
    markers,
    sourceHash: sha(bytes) + ":" + sha(binary),
    markerHash: sha(markerBytes),
  };
}
export function resources(path: string) {
  const s = statfsSync(path);
  if (s.bavail * s.bsize < 10 * 1024 ** 3)
    throw Error("Resource reserve below 10 GiB");
  if (process.memoryUsage().rss > 1.5 * 1024 ** 3)
    throw Error("Working memory exceeds 1.5 GiB");
}
