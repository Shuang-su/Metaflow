import type { GroundReview, SparseEdit, Point } from "./types";
export type SectionBounds = { min: Point; max: Point };
export type SectionRequest = {
  bounds: SectionBounds;
  axis: "x" | "z";
  width: number;
  height: number;
};
export function editCenter(review: GroundReview, edit: SparseEdit): Point {
  if (!review.gridBounds) throw Error("Report has no source grid");
  const r = review.voxelResolution,
    b = review.gridBounds.min;
  const p = {
    x: b[0] + (edit.ix + 0.5) * r,
    y: b[1] + (edit.iy + 0.5) * r,
    z: b[2] + (edit.iz + 0.5) * r,
  };
  return review.coordinateSpace === "metaflow-rz180"
    ? { x: -p.x, y: -p.y, z: p.z }
    : p;
}
/** Exact orthographic projection shared by the camera and diagnostic overlays. */
export function sectionProjection(request: SectionRequest) {
  const { bounds: b, axis, width, height } = request;
  if (
    ![width, height].every(
      (v) => Number.isInteger(v) && v >= 32 && v <= 2048,
    ) ||
    !["x", "z"].includes(axis) ||
    !(["x", "y", "z"] as const).every(
      (k) =>
        Number.isFinite(b.min[k]) &&
        Number.isFinite(b.max[k]) &&
        b.max[k] > b.min[k],
    )
  )
    throw Error("Invalid section bounds");
  const u: "x" | "z" = axis === "z" ? "x" : "z",
    center = {
      x: (b.min.x + b.max.x) / 2,
      y: (b.min.y + b.max.y) / 2,
      z: (b.min.z + b.max.z) / 2,
    };
  const halfY = Math.max(
      (b.max.y - b.min.y) / 2,
      (((b.max[u] - b.min[u]) / 2) * height) / width,
    ),
    halfU = (halfY * width) / height;
  const minU = center[u] - halfU,
    maxU = center[u] + halfU,
    minY = center.y - halfY,
    maxY = center.y + halfY;
  return {
    u,
    center,
    minU,
    maxU,
    minY,
    maxY,
    halfY,
    project: (p: Point) => ({
      x: ((p[u] - minU) / (maxU - minU)) * width,
      y: ((maxY - p.y) / (maxY - minY)) * height,
    }),
    contains: (p: Point) =>
      (["x", "y", "z"] as const).every(
        (k) => p[k] >= b.min[k] && p[k] <= b.max[k],
      ),
  };
}
/** World-space slab filtering, not camera near/far clipping. */
export function sectionModifier(bounds: SectionBounds) {
  sectionProjection({ bounds, axis: "z", width: 800, height: 480 });
  const literal = (n: number) => (Number.isInteger(n) ? `${n}.0` : String(n));
  const condition = (name: string) =>
    (["x", "y", "z"] as const)
      .map(
        (k) =>
          `${name}.${k} < ${literal(bounds.min[k])} || ${name}.${k} > ${literal(bounds.max[k])}`,
      )
      .join(" || ");
  return {
    glsl: `void modifySplatCenter(inout vec3 center) {}\nvoid modifySplatRotationScale(vec3 originalCenter, vec3 modifiedCenter, inout vec4 rotation, inout vec3 scale) { if (${condition("originalCenter")}) scale=vec3(0.0); }\nvoid modifySplatColor(vec3 center, inout vec4 color) { if (${condition("center")}) color.a=0.0; }`,
    wgsl: `fn modifySplatCenter(center: ptr<function, vec3f>) {}\nfn modifySplatRotationScale(originalCenter: vec3f, modifiedCenter: vec3f, rotation: ptr<function, vec4f>, scale: ptr<function, vec3f>) { if (${condition("originalCenter")}) { *scale=vec3f(0.0); } }\nfn modifySplatColor(center: vec3f, color: ptr<function, vec4f>) { if (${condition("center")}) { (*color).a=0.0; } }`,
  };
}
