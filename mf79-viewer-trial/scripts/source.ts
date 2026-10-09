import { readFileSync, statfsSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { VoxelCollision } from "../../metaflow-viewer/src/collision/voxel-collision";
import type { Space, Point } from "../src/types";
import { loadAssetConfig, machineLimits, resolveAssetUrl } from "../../scripts/mf97/asset-config.mjs";
export const cache = loadAssetConfig().roots.navigation;
export const sha = (b: string | Uint8Array) =>
  createHash("sha256").update(b).digest("hex");
/** Explicit offline replay inputs only; browser defaults and originals stay unchanged. */
const replayAssets = process.env.MF79_REPLAY_ASSETS
  ? JSON.parse(readFileSync(process.env.MF79_REPLAY_ASSETS, "utf8"))
  : {};
export const assetDirectory = (id: string): string =>
  replayAssets[id]?.navigation ?? resolve(cache, id);
export function source(id: string) {
  const scene = JSON.parse(
    readFileSync("scene-exhibitions.json", "utf8"),
  ).scenes.find((s: any) => s.id === id);
  if (!scene) throw Error("Unknown scene");
  const originalFile = resolveAssetUrl(scene.collisionUrl);
  const file = replayAssets[id]?.collision ?? originalFile;
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
  if (replayAssets[id]) {
    const manifest = JSON.parse(readFileSync(resolve(assetDirectory(id), "manifest.json"), "utf8"));
    if (manifest.status !== "complete" || manifest.scene !== id ||
      manifest.sourceHash !== sha(bytes) + ":" + sha(binary) ||
      manifest.collisionHash !== sha(binary) || manifest.markerHash !== sha(markerBytes) ||
      JSON.stringify(manifest.meta) !== JSON.stringify(meta) ||
      sha(readFileSync(resolve(assetDirectory(id), "collision.bin"))) !== sha(binary)) {
      throw Error("Replay collision/navigation identity mismatch");
    }
  }
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
  const limits = machineLimits();
  const s = statfsSync(path);
  if (s.bavail * s.bsize < limits.reserveGiB * 1024 ** 3)
    throw Error(`Resource reserve below ${limits.reserveGiB} GiB`);
  if (process.memoryUsage().rss > limits.maxRssGiB * 1024 ** 3)
    throw Error(`Working memory exceeds ${limits.maxRssGiB} GiB`);
}

/** Read-only bounded query set for tiled scenes; no original source is copied or rewritten. */
export async function collisionSourceFile(
  file: string,
  bounds?: import("../src/types").Bounds,
) {
  const { loadCollisionSource } = await import("../src/collision-source");
  const manifest = JSON.parse(
    readFileSync(file, "utf8"),
  ) as import("../src/collision-source").CollisionSourceManifest;
  const prefix = "/repository-data/";
  const result = await loadCollisionSource(
    manifest,
    async (url, hash) => {
      if (!url.startsWith(prefix))
        throw Error(`Unsupported local collision URL: ${url}`);
      const path = resolveAssetUrl(url);
      const bytes = readFileSync(path);
      if (sha(bytes) !== hash)
        throw Error(`Source fingerprint mismatch: ${url}`);
      return bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      );
    },
    { bounds },
  );
  return { manifest, ...result };
}
