/** Spatial selection only: retain exact original LOD0 file/offset/count records.
 * The source is Metaflow Rz(180), so X/Y reverse in world coordinates. */
export function selectDayunInspectionSource(
  source: any,
  position: readonly number[],
  halfExtent = 12,
) {
  if (
    position.length !== 3 ||
    !position.every(Number.isFinite) ||
    !Number.isFinite(halfExtent) ||
    halfExtent <= 0 ||
    halfExtent > 20
  )
    throw Error("Invalid bounded inspection view");
  const bounds = {
    min: position.map((v) => v - halfExtent),
    max: position.map((v) => v + halfExtent),
  };
  let sourceLeaves = 0,
    selectedLeaves = 0,
    selectedSplats = 0;
  const files = new Set<number>();
  const leafReferences: { file: number; offset: number; count: number }[] = [];
  function visit(node: any): any {
    if (node.children) {
      const children = node.children.map(visit).filter(Boolean);
      if (!children.length) return null;
      return {
        bound: {
          min: [0, 1, 2].map((i) =>
            Math.min(...children.map((child: any) => child.bound.min[i])),
          ),
          max: [0, 1, 2].map((i) =>
            Math.max(...children.map((child: any) => child.bound.max[i])),
          ),
        },
        children,
      };
    }
    sourceLeaves++;
    const { min, max } = node.bound;
    if (
      ![min, max].every(
        (v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite),
      ) ||
      min.some((v: number, i: number) => v > max[i])
    )
      throw Error("Invalid original Gaussian leaf bounds");
    const worldMin = [-max[0], -max[1], min[2]],
      worldMax = [-min[0], -min[1], max[2]];
    if (
      [0, 1, 2].some(
        (i) => worldMin[i] > bounds.max[i] || worldMax[i] < bounds.min[i],
      )
    )
      return null;
    const lod = node.lods?.[0];
    if (
      !lod ||
      !Number.isInteger(lod.file) ||
      !source.filenames[lod.file] ||
      !Number.isInteger(lod.offset) ||
      !Number.isInteger(lod.count) ||
      lod.count < 0 ||
      lod.offset < 0
    )
      throw Error(
        "Missing or invalid original LOD0 reference in inspection region",
      );
    if (!lod.count) return null;
    selectedLeaves++;
    selectedSplats += lod.count;
    files.add(lod.file);
    leafReferences.push({
      file: lod.file,
      offset: lod.offset,
      count: lod.count,
    });
    return {
      bound: structuredClone(node.bound),
      lods: { 0: structuredClone(lod) },
    };
  }
  const tree = visit(source.tree);
  if (!tree || !selectedSplats)
    throw Error("No original LOD0 source in inspection region");
  if (selectedSplats > 5_000_000 || files.size > 16)
    throw Error(
      "Local LOD0 inspection exceeds the small-view budget; reduce its bounds",
    );
  return {
    manifest: {
      lodLevels: 1,
      environment: null as null,
      filenames: [...source.filenames],
      tree,
    },
    coverage: {
      coordinateSpace: "world",
      transform: "Rz(180)",
      bounds,
      sourceLeaves,
      selectedLeaves,
      selectedSplats,
      fileIndices: [...files].sort((a, b) => a - b),
      leafReferences,
      meaning:
        "Original source leaves intersecting local bounds; no full-scene rendering claim",
    },
  };
}
