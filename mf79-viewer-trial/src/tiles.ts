import { generateBoundedRecastTile } from "./recast-tile";
import {
  NavMesh,
  NavMeshParams,
  Raw,
  VerticesArray,
  TrianglesArray,
  RecastBuildContext,
  UnsignedCharArray,
  Detour,
  statusFailed,
  type Vector3Tuple,
} from "recast-navigation";
import {
  buildTiledNavMeshRcConfig,
  tiledNavMeshGeneratorConfigDefaults,
} from "recast-navigation/generators";
import { RECAST_CONFIG } from "./recast-config";
import { exposedVoxelMesh } from "./voxel-mesh";
import type { Bounds, Point, Space } from "./types";
export const TILE_GENERATOR = "mf79-stream-tiles-v2";
export const TILE_CELLS = 256;
const tuple = (p: Point): Vector3Tuple => [p.x, p.y, p.z];
export function navigationTiles(
  bounds: Bounds,
  cs = 0.08,
  tileCells = TILE_CELLS,
) {
  const size = cs * tileCells,
    nx = Math.ceil((bounds.max.x - bounds.min.x) / size),
    nz = Math.ceil((bounds.max.z - bounds.min.z) / size);
  return Array.from({ length: nx * nz }, (_, i) => {
    const x = i % nx,
      z = Math.floor(i / nx);
    return {
      x,
      z,
      bounds: {
        min: {
          x: bounds.min.x + x * size,
          y: bounds.min.y,
          z: bounds.min.z + z * size,
        },
        max: {
          x: bounds.min.x + (x + 1) * size,
          y: bounds.max.y,
          z: bounds.min.z + (z + 1) * size,
        },
      },
    };
  });
}
export type NavigationTile = ReturnType<typeof navigationTiles>[number];
export function tileGeometry(
  space: Space,
  tile: NavigationTile,
  origin: Point,
  config = RECAST_CONFIG,
) {
  const bounds = structuredClone(tile.bounds),
    halo = (config.walkableRadius + 3) * config.cs;
  bounds.min.x -= halo;
  bounds.min.z -= halo;
  bounds.max.x += halo;
  bounds.max.z += halo;
  return exposedVoxelMesh(space, bounds, origin, config.cs, {
    boundary: "source",
  });
}
export class RecastTileBuilder {
  readonly mesh = new NavMesh();
  readonly setup: ReturnType<typeof buildTiledNavMeshRcConfig>;
  constructor(
    public bounds: Bounds,
    public config = RECAST_CONFIG,
    public tileCells = TILE_CELLS,
  ) {
    this.setup = buildTiledNavMeshRcConfig({
      recastConfig: {
        ...tiledNavMeshGeneratorConfigDefaults,
        ...config,
        tileSize: tileCells,
      },
      navMeshBounds: [tuple(bounds.min), tuple(bounds.max)],
    });
    const { orig, maxTiles, maxPolysPerTile } = this.setup;
    const p = NavMeshParams.create({
      orig,
      tileWidth: config.cs * tileCells,
      tileHeight: config.cs * tileCells,
      maxTiles,
      maxPolys: maxPolysPerTile,
    });
    try {
      if (!this.mesh.initTiled(p)) throw Error("Recast tile init failed");
    } finally {
      Raw.destroy(p.raw);
    }
  }
  lastDiagnostic:
    ReturnType<typeof generateBoundedRecastTile>["diagnostic"] | null = null;
  build(
    positions: Float32Array,
    indices: Uint32Array,
    tile: NavigationTile,
    voxelRaster = false,
    keepSpan?: (x: number, y: number, z: number) => boolean,
  ) {
    const v = new VerticesArray(),
      i = new TrianglesArray(),
      ctx = new RecastBuildContext();
    v.copy(new Float32Array(positions));
    i.copy(new Int32Array(indices));
    try {
      const r = generateBoundedRecastTile(
        v,
        i,
        tile,
        this.config,
        this.tileCells,
        ctx,
        voxelRaster,
        keepSpan,
      );
      this.lastDiagnostic = r.diagnostic;
      return r.data;
    } finally {
      v.destroy();
      i.destroy();
      Raw.destroy(ctx.raw);
    }
  }
  add(bytes: Uint8Array) {
    const data = new UnsignedCharArray();
    data.copy(new Uint8Array(bytes));
    const r = this.mesh.addTile(data, Detour.DT_TILE_FREE_DATA, 0);
    if (statusFailed(r.status)) {
      data.destroy();
      throw Error("Recast tile add failed: " + r.status);
    }
  }
  destroy() {
    this.mesh.destroy();
    Raw.destroy(this.setup.config);
    Raw.destroy(this.setup.gridSize);
  }
}
