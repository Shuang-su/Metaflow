import {
  Raw,
  Recast,
  TriangleAreasArray,
  NavMeshCreateParams,
  createNavMeshData,
  allocHeightfield,
  freeHeightfield,
  createHeightfield,
  markWalkableTriangles,
  rasterizeTriangles,
  filterLowHangingWalkableObstacles,
  filterLedgeSpans,
  filterWalkableLowHeightSpans,
  allocCompactHeightfield,
  freeCompactHeightfield,
  buildCompactHeightfield,
  erodeWalkableArea,
  buildDistanceField,
  buildRegions,
  allocContourSet,
  freeContourSet,
  buildContours,
  allocPolyMesh,
  freePolyMesh,
  buildPolyMesh,
  allocPolyMeshDetail,
  freePolyMeshDetail,
  buildPolyMeshDetail,
  VerticesArray,
  type TrianglesArray,
  type RecastBuildContext,
  type Vector3Tuple,
} from "recast-navigation";
import type { RECAST_CONFIG } from "./recast-config";
import type { NavigationTile } from "./tiles";
/** Input has already been bounded to one tile plus halo. Rasterize all triangles,
 * avoiding the convenience wrapper's fixed 512-chunk query cap. Every allocation
 * belongs to this invocation; nothing from the heightfield is retained between tiles. */
export function generateBoundedRecastTile(
  vertices: InstanceType<typeof VerticesArray>,
  indices: InstanceType<typeof TrianglesArray>,
  tile: NavigationTile,
  c: typeof RECAST_CONFIG,
  tileCells: number,
  ctx: RecastBuildContext,
  voxelRaster = false,
  keepSpan?: (x: number, y: number, z: number) => boolean,
) {
  const border = c.walkableRadius + 3,
    halo = border * c.cs;
  const min: Vector3Tuple = [
    tile.bounds.min.x - halo,
    tile.bounds.min.y,
    tile.bounds.min.z - halo,
  ];
  const max: Vector3Tuple = [
    tile.bounds.max.x + halo,
    tile.bounds.max.y,
    tile.bounds.max.z + halo,
  ];
  // Optional diagnostic: exact integer X/Y/Z voxel coordinates during rasterization.
  // Only the exposed voxel lattice may use this (never arbitrary scene meshes).
  const lattice = voxelRaster ? new VerticesArray() : null;
  if (lattice) {
    const v = vertices.toTypedArray().slice();
    for (let i = 0; i < v.length; i += 3) {
      v[i] = Math.round((v[i] - tile.bounds.min.x) / c.cs);
      v[i + 1] = Math.round((v[i + 1] - tile.bounds.min.y) / c.ch);
      v[i + 2] = Math.round((v[i + 2] - tile.bounds.min.z) / c.cs);
    }
    lattice.copy(v);
  }
  const rasterVertices = lattice ?? vertices;
  const rasterMin: Vector3Tuple = voxelRaster ? [-border, 0, -border] : min;
  const rasterMax: Vector3Tuple = voxelRaster
    ? [
        tileCells + border,
        Math.round((max[1] - min[1]) / c.ch),
        tileCells + border,
      ]
    : max;
  const rasterCS = voxelRaster ? 1 : c.cs,
    rasterCH = voxelRaster ? 1 : c.ch;
  const hf = allocHeightfield(),
    areas = new TriangleAreasArray();
  let compact: ReturnType<typeof allocCompactHeightfield> | undefined,
    contours: ReturnType<typeof allocContourSet> | undefined;
  let poly: ReturnType<typeof allocPolyMesh> | undefined,
    detail: ReturnType<typeof allocPolyMeshDetail> | undefined,
    params: NavMeshCreateParams | undefined;
  const check = (ok: boolean, stage: string) => {
    if (!ok) throw Error(`Recast tile ${tile.x}/${tile.z}: ${stage}`);
  };
  try {
    check(
      createHeightfield(
        ctx,
        hf,
        tileCells + 2 * border,
        tileCells + 2 * border,
        rasterMin,
        rasterMax,
        rasterCS,
        rasterCH,
      ),
      "heightfield",
    );
    const triangles = indices.size / 3;
    areas.resize(triangles);
    markWalkableTriangles(
      ctx,
      c.walkableSlopeAngle,
      vertices,
      vertices.size / 3,
      indices,
      triangles,
      areas,
    );
    check(
      rasterizeTriangles(
        ctx,
        rasterVertices,
        vertices.size / 3,
        indices,
        areas,
        triangles,
        hf,
        c.walkableClimb,
      ),
      "rasterization",
    );
    filterLowHangingWalkableObstacles(ctx, c.walkableClimb, hf);
    filterLedgeSpans(ctx, c.walkableHeight, c.walkableClimb, hf);
    filterWalkableLowHeightSpans(ctx, c.walkableHeight, hf);
    compact = allocCompactHeightfield();
    check(
      buildCompactHeightfield(
        ctx,
        c.walkableHeight,
        c.walkableClimb,
        hf,
        compact,
      ),
      "compact heightfield",
    );
    check(erodeWalkableArea(ctx, c.walkableRadius, compact), "erosion");
    // Optional new-experiment filter. Defaults preserve every historical asset.
    // It removes unsafe spans using source collision, never adds areas or links.
    let removedSpans = 0;
    if (keepSpan)
      for (let z = 0; z < compact.height(); z++)
        for (let x = 0; x < compact.width(); x++) {
          const cell = compact.cells(x + z * compact.width());
          for (
            let index = cell.index();
            index < cell.index() + cell.count();
            index++
          )
            if (compact.areas(index)) {
              const worldX = min[0] + (x + 0.5) * c.cs,
                worldZ = min[2] + (z + 0.5) * c.cs,
                worldY = min[1] + compact.spans(index).y() * c.ch;
              if (!keepSpan(worldX, worldY, worldZ)) {
                compact.raw.set_areas(index, 0);
                removedSpans++;
              }
            }
        }
    check(buildDistanceField(ctx, compact), "distance field");
    check(
      buildRegions(
        ctx,
        compact,
        border,
        c.minRegionArea ** 2,
        c.mergeRegionArea ** 2,
      ),
      "regions",
    );
    contours = allocContourSet();
    check(
      buildContours(
        ctx,
        compact,
        c.maxSimplificationError,
        c.maxEdgeLen,
        contours,
        Recast.RC_CONTOUR_TESS_WALL_EDGES,
      ),
      "contours",
    );
    poly = allocPolyMesh();
    check(buildPolyMesh(ctx, contours, 6, poly), "polygons");
    const diagnostic = {
      polygons: poly.npolys(),
      vertices: poly.nverts(),
      spans: compact.spanCount(),
      removedSpans,
      inputTriangles: triangles,
    };
    // An empty navigable tile is recorded explicitly; a failed build is never coerced to empty.
    if (!poly.npolys()) return { data: null, diagnostic };
    detail = allocPolyMeshDetail();
    check(
      buildPolyMeshDetail(
        ctx,
        poly,
        compact,
        c.detailSampleDist < 0.9 ? 0 : rasterCS * c.detailSampleDist,
        rasterCH * c.detailSampleMaxError,
        detail,
      ),
      "detail mesh",
    );
    for (let i = 0; i < poly.npolys(); i++) {
      if (poly.areas(i) === Recast.RC_WALKABLE_AREA) poly.setAreas(i, 0);
      if (poly.areas(i) === 0) poly.setFlags(i, 1);
    }
    params = new NavMeshCreateParams();
    params.setPolyMeshCreateParams(poly);
    params.setPolyMeshDetailCreateParams(detail);
    if (voxelRaster) {
      const world = (v: Vector3Tuple): Vector3Tuple => [
        tile.bounds.min.x + v[0] * c.cs,
        tile.bounds.min.y + v[1] * c.ch,
        tile.bounds.min.z + v[2] * c.cs,
      ];
      params.setBoundsMin(world(params.boundsMin()));
      params.setBoundsMax(world(params.boundsMax()));
      for (let i = 0; i < params.detailVertsCount(); i++) {
        detail.raw.set_verts(
          i * 3,
          tile.bounds.min.x + detail.verts(i * 3) * c.cs,
        );
        detail.raw.set_verts(
          i * 3 + 1,
          tile.bounds.min.y + detail.verts(i * 3 + 1) * c.ch,
        );
        detail.raw.set_verts(
          i * 3 + 2,
          tile.bounds.min.z + detail.verts(i * 3 + 2) * c.cs,
        );
      }
    }
    params.setWalkableHeight(c.walkableHeight * c.ch);
    params.setWalkableRadius(c.walkableRadius * c.cs);
    params.setWalkableClimb(c.walkableClimb * c.ch);
    params.setCellSize(c.cs);
    params.setCellHeight(c.ch);
    params.setBuildBvTree(true);
    params.setTileX(tile.x);
    params.setTileY(tile.z);
    const built = createNavMeshData(params);
    check(built.success, "Detour tile data");
    const data = built.navMeshData.toTypedArray();
    built.navMeshData.destroy();
    return { data, diagnostic };
  } finally {
    if (params) Raw.destroy(params.raw);
    if (detail) freePolyMeshDetail(detail);
    if (poly) freePolyMesh(poly);
    if (contours) freeContourSet(contours);
    if (compact) freeCompactHeightfield(compact);
    freeHeightfield(hf);
    areas.destroy();
    lattice?.destroy();
  }
}
