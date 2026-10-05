import type { Pose } from "../core/model";
import type { FrameState } from "./runtime";

/** A completed old view is useful for navigation, but never for a new pick. */
export function isSelectionView(
  displayed: FrameState | null,
  target: Pose | null,
  revision: number,
  size: [number, number],
) {
  return !!(
    displayed &&
    target &&
    displayed.viewRevision === revision &&
    !displayed.video &&
    displayed.width === size[0] &&
    displayed.height === size[1] &&
    JSON.stringify(displayed.pose) === JSON.stringify(target)
  );
}
