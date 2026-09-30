import type {
  GaussianMapLayer,
  MapBounds,
} from "../../../metaflow-viewer/src/navigation/map-assets";

export type MapRenderJob = {
  scene: string;
  assetUrl: string;
  transform: number[];
  /** Fixed source LOD, selected before the component enters the scene. */
  lod: number;
  gaussianHash: string;
  collisionHash: string;
  layers: Omit<GaussianMapLayer, "tiles">[];
  tileMetres?: number;
  pixels?: number;
};
export type MapRenderTile = {
  id: string;
  layerId: string;
  bounds: MapBounds;
  width: number;
  height: number;
};

export function mapTiles(job: MapRenderJob): MapRenderTile[] {
  const tileMetres = job.tileMetres ?? 20.48,
    pixels = job.pixels ?? 512;
  if (
    !(tileMetres > 0) ||
    !Number.isFinite(tileMetres) ||
    !Number.isInteger(pixels) ||
    pixels < 32 ||
    pixels > 2048
  )
    throw new Error("Invalid map tile resolution");
  const result: MapRenderTile[] = [];
  for (const layer of job.layers) {
    const { minX, minZ, maxX, maxZ } = layer.bounds;
    if (
      ![minX, minZ, maxX, maxZ].every(Number.isFinite) ||
      minX >= maxX ||
      minZ >= maxZ
    )
      throw new Error("Invalid layer bounds");
    let row = 0;
    for (let z = minZ; z < maxZ - 1e-8; z += tileMetres, row++) {
      let col = 0;
      for (let x = minX; x < maxX - 1e-8; x += tileMetres, col++) {
        const bx = Math.min(x + tileMetres, maxX),
          bz = Math.min(z + tileMetres, maxZ);
        result.push({
          id: `${layer.id}-${col}-${row}`,
          layerId: layer.id,
          bounds: { minX: x, minZ: z, maxX: bx, maxZ: bz },
          width: Math.max(1, Math.round((pixels * (bx - x)) / tileMetres)),
          height: Math.max(1, Math.round((pixels * (bz - z)) / tileMetres)),
        });
      }
    }
  }
  return result;
}

/** gsplat work-buffer modifiers receive world-space centers in PC 2.22.4.
 * Filtering the actual Gaussian data is independent of camera near/far planes. */
export function sliceModifier(min: number, max: number) {
  if (![min, max].every(Number.isFinite) || min > max)
    throw new Error("Invalid Gaussian world-Y slice");
  const literal = (n: number) => (Number.isInteger(n) ? `${n}.0` : String(n));
  const outside = `center.y < ${literal(min)} || center.y > ${literal(max)}`;
  return {
    glsl: `
void modifySplatCenter(inout vec3 center) {}
void modifySplatRotationScale(vec3 originalCenter, vec3 modifiedCenter, inout vec4 rotation, inout vec3 scale) {
    if (originalCenter.y < ${literal(min)} || originalCenter.y > ${literal(max)}) scale = vec3(0.0);
}
void modifySplatColor(vec3 center, inout vec4 color) { if (${outside}) color.a = 0.0; }
`,
    wgsl: `
fn modifySplatCenter(center: ptr<function, vec3f>) {}
fn modifySplatRotationScale(originalCenter: vec3f, modifiedCenter: vec3f, rotation: ptr<function, vec4f>, scale: ptr<function, vec3f>) {
    if (originalCenter.y < ${literal(min)} || originalCenter.y > ${literal(max)}) { *scale = vec3f(0.0); }
}
fn modifySplatColor(center: vec3f, color: ptr<function, vec4f>) { if (${outside}) { (*color).a = 0.0; } }
`,
  };
}
