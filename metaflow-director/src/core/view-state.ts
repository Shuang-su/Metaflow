import { evaluate, type Pose, type Project } from "./model";

/** Resolve the camera being shown, without writing into saved positions. */
export function viewPose(
  working: Pose,
  project: Project,
  time: number,
  video: boolean,
  temporary: Pose | null = null,
): Pose {
  return (
    temporary ?? (video ? evaluate(project.shots, time)?.pose : null) ?? working
  );
}

/** A thumbnail is a render of a camera and a crop, not just a keyframe ID. */
export function thumbnailKey(
  project: Project,
  key: { id: string; pose: Pose },
) {
  return JSON.stringify([
    project.assets,
    project.aspect,
    project.backdrop,
    key.id,
    key.pose,
  ]);
}

export function thumbnailSize(aspect: string): [number, number] {
  const [a, b] = aspect.split(":").map(Number);
  const scale = Math.min(160 / a, 90 / b);
  return [
    Math.max(2, Math.round((a * scale) / 2) * 2),
    Math.max(2, Math.round((b * scale) / 2) * 2),
  ];
}
