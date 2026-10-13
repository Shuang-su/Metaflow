import type { Collision } from "../../metaflow-viewer/src/collision";
export type Point = { x: number; y: number; z: number };
export type Bounds = { min: Point; max: Point };
export type Space = {
  collision: Collision;
  bounds: Bounds;
  known: (x: number, y: number, z: number) => boolean;
  /** Geometry lattice occupancy, independent of the spawn free-space predicate.
   * Optional for existing single-collider fixtures; unknown samples stay gated by known. */
  occupiedAt?: (x: number, y: number, z: number) => boolean;
};
