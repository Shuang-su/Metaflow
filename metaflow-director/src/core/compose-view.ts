import { clamp, type Pose } from "./model";
import { rebaseControls } from "./camera-controls";
function halton(index: number, base: number) {
  let value = 0,
    fraction = 1;
  while (index > 0) {
    fraction /= base;
    value += fraction * (index % base);
    index = Math.floor(index / base);
  }
  return value;
}
/** Deterministic exploration around the selected 3D interest point, not a four-pose cycle. */
export function composeViewPose(base: Pose, index: number): Pose {
  const sequence = index + 2;
  const next = {
    ...structuredClone(base),
    continuousRotation: true,
    yaw: clamp(base.yaw + (halton(sequence, 2) - 0.5) * 60, -360, 360),
    pitch: clamp(base.pitch + (halton(sequence, 3) - 0.5) * 32, -360, 360),
    roll: clamp(base.roll + (halton(sequence, 5) - 0.5) * 14, -360, 360),
    distance: base.distance * (0.8 + halton(sequence, 7) * 0.45),
  };
  if (base.focusPoint) {
    next.target = [...base.focusPoint];
    next.focus = next.distance;
  } else if (base.controls?.focusMode !== "manual") next.focus = next.distance;
  return rebaseControls(next);
}
