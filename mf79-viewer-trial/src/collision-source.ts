import {
  VoxelCollision,
  FlippedVoxelCollision,
} from "../../metaflow-viewer/src/collision/voxel-collision";
import { TiledVoxelCollision } from "../../metaflow-viewer/src/collision/tiled-voxel-collision";
import type { Bounds, Space } from "./types";

type VoxelMetadata = ConstructorParameters<typeof VoxelCollision>[0];
export type CollisionSourceTile = {
  id: string;
  coreBounds: Bounds;
  dataBounds: Bounds;
  meta: VoxelMetadata;
  binaryUrl: string;
  binaryHash: string;
  metadataHash: string;
  binaryBytes: number;
};
/** Bounds are always in Viewer Y-up coordinates; metadata retains its raw lattice. */
export type CollisionSourceManifest = {
  version: 1;
  kind: "single" | "tiled";
  sourceHash: string;
  transform: "identity" | "flipXY";
  voxelResolution: number;
  bounds: Bounds;
  tiles: CollisionSourceTile[];
};
export const containsPoint = (b: Bounds, x: number, y: number, z: number) =>
  x >= b.min.x &&
  x < b.max.x &&
  y >= b.min.y &&
  y < b.max.y &&
  z >= b.min.z &&
  z < b.max.z;
export const intersectsBounds = (a: Bounds, b: Bounds) =>
  (["x", "y", "z"] as const).every(
    (k) => a.min[k] < b.max[k] && a.max[k] > b.min[k],
  );
export function rawToWorldBounds(
  raw: { min: number[]; max: number[] },
  transform: "identity" | "flipXY",
): Bounds {
  const flip = transform === "flipXY";
  return {
    min: {
      x: flip ? -raw.max[0] : raw.min[0],
      y: flip ? -raw.max[1] : raw.min[1],
      z: raw.min[2],
    },
    max: {
      x: flip ? -raw.min[0] : raw.max[0],
      y: flip ? -raw.min[1] : raw.max[1],
      z: raw.max[2],
    },
  };
}
export function decodeCollisionTile(
  tile: CollisionSourceTile,
  bytes: ArrayBuffer,
  transform: CollisionSourceManifest["transform"],
) {
  const meta = tile.meta,
    n = meta.nodeWordCount ?? meta.nodeCount;
  if (
    bytes.byteLength !== tile.binaryBytes ||
    bytes.byteLength !== (n + meta.leafDataCount) * 4
  )
    throw Error(`Collision tile size mismatch: ${tile.id}`);
  const words = new Uint32Array(bytes),
    C = transform === "flipXY" ? FlippedVoxelCollision : VoxelCollision;
  return new C(meta, words.subarray(0, n), words.subarray(n));
}
/** The byte loader must verify the supplied hash. Missing/unloaded tiles remain unknown.
 * A bounded query set is intentional: loading the entire Dayun lattice exceeds Worker memory. */
export async function loadCollisionSource(
  manifest: CollisionSourceManifest,
  loadBytes: (url: string, sha256: string) => Promise<ArrayBuffer>,
  options: { bounds?: Bounds; maxBytes?: number } = {},
) {
  if (
    manifest.version !== 1 ||
    !["single", "tiled"].includes(manifest.kind) ||
    !manifest.sourceHash ||
    !["identity", "flipXY"].includes(manifest.transform)
  )
    throw Error("Unsupported collision source manifest");
  if (manifest.kind === "single" && manifest.tiles.length !== 1)
    throw Error("Single collision source needs exactly one tile");
  const requested = options.bounds ?? manifest.bounds;
  const tiles = manifest.tiles.filter((t) =>
    intersectsBounds(t.dataBounds, requested),
  );
  if (!tiles.length) throw Error("Navigation collision coverage missing");
  if (new Set(tiles.map((t) => t.id)).size !== tiles.length)
    throw Error("Duplicate collision tile identity");
  if (tiles.some((t) => t.meta.voxelResolution !== manifest.voxelResolution))
    throw Error("Collision resolution mismatch");
  const estimate = tiles.reduce((n, t) => n + t.binaryBytes, 0);
  if (estimate > (options.maxBytes ?? 256 * 1024 ** 2))
    throw Error(
      `Collision query set requires ${estimate} bytes; partition the navigation asset without dropping coverage`,
    );
  const colliders: VoxelCollision[] = [];
  for (const tile of tiles) {
    if (!tile.binaryUrl.endsWith(".bin"))
      throw Error("Collision metadata URL is not derivable");
    const metadataBytes = await loadBytes(
      tile.binaryUrl.replace(/\.bin$/, ".json"),
      tile.metadataHash,
    );
    const verifiedMeta = JSON.parse(new TextDecoder().decode(metadataBytes));
    // Both objects came from the same frozen JSON. The original byte hash is
    // checked by loadBytes; the inline copy must not change its lattice.
    if (JSON.stringify(verifiedMeta) !== JSON.stringify(tile.meta))
      throw Error(`Collision metadata mismatch: ${tile.id}`);
    const expectedBounds = rawToWorldBounds(
      verifiedMeta.gridBounds,
      manifest.transform,
    );
    for (const side of ["min", "max"] as const)
      for (const axis of ["x", "y", "z"] as const)
        if (
          Math.abs(expectedBounds[side][axis] - tile.dataBounds[side][axis]) >
          1e-8
        )
          throw Error(`Collision bounds mismatch: ${tile.id}`);
    colliders.push(
      decodeCollisionTile(
        tile,
        await loadBytes(tile.binaryUrl, tile.binaryHash),
        manifest.transform,
      ),
    );
  }
  const collision =
    manifest.kind === "single"
      ? colliders[0]
      : TiledVoxelCollision.fromColliders(colliders);
  const space: Space = {
    bounds: requested,
    collision,
    known: (x, y, z) =>
      containsPoint(requested, x, y, z) &&
      tiles.some((t) => containsPoint(t.dataBounds, x, y, z)),
  };
  return {
    space,
    loadedTileIds: tiles.map((t) => t.id),
    bytes: estimate,
    sourceHash: manifest.sourceHash,
    destroy: () => {
      if (collision instanceof TiledVoxelCollision) collision.destroy();
      colliders.length = 0;
    },
  };
}
