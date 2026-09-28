import {
  WalkController,
  type WalkPhysicsState,
} from "../../metaflow-viewer/src/cameras/walk-controller";
import { Camera } from "../../metaflow-viewer/src/cameras/camera";
import type { CameraFrame } from "../../metaflow-viewer/src/cameras/camera";
import type { Collision } from "../../metaflow-viewer/src/collision";
import type { Point } from "./types";
export const BODY = Object.freeze({
  radius: 0.2,
  height: 1.5,
  eye: 1.3,
  hover: 0.2,
});
export const length = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export const horizontal = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.z - b.z);
export function support(c: Collision, eye: Point) {
  let sum = 0,
    count = 0;
  for (const [x, z] of [
    [0, 0],
    [-BODY.radius, 0],
    [BODY.radius, 0],
    [0, -BODY.radius],
    [0, BODY.radius],
  ]) {
    const hit = c.queryRay(eye.x + x, eye.y - BODY.eye, eye.z + z, 0, -1, 0, 1);
    if (hit) {
      sum += hit.y;
      count++;
    }
  }
  return count ? sum / count : null;
}
export function stand(c: Collision, ground: Point): Point | null {
  const eye = { ...ground, y: ground.y + BODY.eye + BODY.hover };
  const height = support(c, eye);
  if (height === null) return null;
  eye.y = height + BODY.eye + BODY.hover;
  const out = { x: 0, y: 0, z: 0 };
  return c.queryCapsule(
    eye.x,
    eye.y - BODY.eye + BODY.height / 2,
    eye.z,
    BODY.height / 2 - BODY.radius,
    BODY.radius,
    out,
  )
    ? null
    : eye;
}
export class NativeDriver {
  readonly controller = new WalkController();
  readonly camera = new Camera();
  state: WalkPhysicsState;
  constructor(collision: Collision, eye: Point) {
    this.camera.position.set(eye.x, eye.y, eye.z);
    this.controller.collision = collision;
    this.controller.goto(this.camera);
    this.state = this.controller.readPhysicsState();
    this.controller.onPhysicsStep = (s) => {
      this.state = s;
    };
  }
  step(x: number, z: number, jump = false, dt = 1 / 60) {
    this.controller.update(
      dt,
      {
        read: () => ({
          move: [x * dt, jump ? 1 : 0, z * dt],
          rotate: [0, 0, 0],
          worldMove: [0, 0, 0],
        }),
      } as CameraFrame,
      this.camera,
    );
    return this.state;
  }
}
/** Retains native simulation progress across Worker scheduling batches. */
export function* proveRoute(
  c: Collision,
  from: Point,
  points: Point[],
  finalTolerance = 0.07,
) {
  const d = new NativeDriver(c, from);
  let cursor = 1,
    still = 0,
    last = { ...from },
    ticks = 0;
  const trace: Point[] = [{ ...from }],
    maxTicks = Math.ceil(
      (points.slice(1).reduce((n, p, i) => n + length(points[i], p), 0) / 0.3 +
        5) *
        60,
    );
  while (cursor < points.length) {
    const target = points[cursor],
      p = d.state.position,
      dist = horizontal(p, target);
    if (dist < (cursor === points.length - 1 ? finalTolerance : 0.07)) {
      cursor++;
      continue;
    }
    const s = d.step((target.x - p.x) / dist, -(target.z - p.z) / dist);
    ticks++;
    if (ticks % 6 === 0) trace.push({ ...s.position });
    if (s.collision !== "active")
      return { ok: false, reason: "collision-not-active", state: s, trace };
    if (s.position.y < target.y - 2)
      return { ok: false, reason: "lost-support", state: s, trace };
    still = horizontal(last, s.position) < 0.0002 ? still + 1 : 0;
    last = { ...s.position };
    if (still >= 60 || ticks > maxTicks)
      return { ok: false, reason: "native-motion-blocked", state: s, trace };
    yield s;
  }
  return { ok: true, reason: "native-walking-complete", state: d.state, trace };
}
