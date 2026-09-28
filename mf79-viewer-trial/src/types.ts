import type { Collision } from "../../metaflow-viewer/src/collision";
export type Point = { x: number; y: number; z: number };
export type Bounds = { min: Point; max: Point };
export type Space = {
  collision: Collision;
  bounds: Bounds;
  known: (x: number, y: number, z: number) => boolean;
};
