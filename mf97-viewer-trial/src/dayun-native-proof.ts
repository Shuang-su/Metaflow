/** Route steering only; all physical movement is the unchanged Viewer controller. */
import type { Collision } from "../../metaflow-viewer/src/collision";
import type { Point } from "../../mf79-viewer-trial/src/types";
import {
  NativeDriver,
  BODY,
  horizontal,
} from "../../mf79-viewer-trial/src/native-motion";
export function replayNativePolyline(
  collision: Collision,
  points: Point[],
  isKnown?: (point: Point) => boolean,
) {
  if (
    points.length < 2 ||
    points.some((p) => ![p.x, p.y, p.z].every(Number.isFinite))
  )
    throw Error("Native proof needs at least two finite route points");
  const driver = new NativeDriver(collision, points[0]),
    input: any[] = [],
    trace: any[] = [];
  let cursor = 1,
    still = 0,
    ticks = 0,
    lastPosition = { ...points[0] };
  let stallStart: unknown = null;
  const maxTicks = Math.ceil(
    (points.slice(1).reduce((n, p, i) => n + horizontal(points[i], p), 0) /
      0.3 +
      5) *
      60,
  );
  while (cursor < points.length && ticks <= maxTicks) {
    const p = driver.state.position,
      target = points[cursor],
      distance = horizontal(p, target);
    if (distance < 0.07) {
      cursor++;
      continue;
    }
    const x = (target.x - p.x) / distance,
      z = -(target.z - p.z) / distance;
    const state = driver.step(x, z, false);
    ticks++;
    input.push([ticks, x, z]);
    trace.push({
      tick: ticks,
      position: state.position,
      support: state.supportHeight,
      grounded: state.grounded,
      collision: state.collision,
    });
    still = horizontal(lastPosition, state.position) < 0.0002 ? still + 1 : 0;
    if (still === 1)
      stallStart = {
        tick: ticks,
        from: lastPosition,
        to: state.position,
        input: [x, z],
        support: state.supportHeight,
        target,
      };
    if (!still) stallStart = null;
    lastPosition = { ...state.position };
    if (
      state.collision !== "active" ||
      (isKnown &&
        (!isKnown(state.position) ||
          (state.supportHeight !== null &&
            !isKnown({ ...state.position, y: state.supportHeight + 0.04 })))) ||
      still >= 60 ||
      state.position.y < target.y - 2
    )
      return {
        ok: false,
        reason:
          state.collision !== "active"
            ? "collision-not-active"
            : isKnown &&
                (!isKnown(state.position) ||
                  (state.supportHeight !== null &&
                    !isKnown({
                      ...state.position,
                      y: state.supportHeight + 0.04,
                    })))
              ? "known-coverage-missing"
              : still >= 60
                ? "native-motion-blocked"
                : "lost-support",
        state,
        firstConfirmedNoProgress: still >= 60 ? stallStart : null,
        trace,
        input,
      };
  }
  if (cursor < points.length)
    return {
      ok: false,
      reason: "native-replay-no-progress",
      state: driver.state,
      trace,
      input,
    };
  for (let i = 0; i < 30; i++) {
    const state = driver.step(0, 0, false);
    ticks++;
    input.push([ticks, 0, 0]);
    trace.push({
      tick: ticks,
      position: state.position,
      support: state.supportHeight,
      grounded: state.grounded,
      collision: state.collision,
    });
  }
  const state = driver.state,
    goal = points.at(-1)!;
  const ok =
    state.collision === "active" &&
    (!isKnown || isKnown(state.position)) &&
    state.grounded &&
    state.supportHeight !== null &&
    Math.abs(state.supportHeight - (goal.y - BODY.eye - BODY.hover)) <= 0.24 &&
    horizontal(state.position, goal) <= 0.2;
  return {
    ok,
    reason: ok
      ? "native-walking-grounded-complete"
      : "native-terminal-support-mismatch",
    state,
    trace,
    input,
  };
}
