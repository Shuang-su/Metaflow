import type { Pose } from "./model";

// ui.camera 2026-09-09: 20y_j7c3pavts.js / 0k6i348ms1pb6.js.
export const ZOOM_LIMITS = { min: 50, max: 500 };
export const ROTATION_LIMIT = 360;
export const zoomLabel = (value: number, baseline = 70) => {
  const z = Math.max(50, Math.min(500, value));
  const ratio =
    Math.round(
      10 *
        (z <= baseline
          ? 0.5 + ((z - 50) / (baseline - 50)) * 0.5
          : 1 + ((z - baseline) / (500 - baseline)) * 4),
    ) / 10;
  return `${Number.isInteger(ratio) ? ratio : ratio.toFixed(1)}×`;
};
export const blurLabel = (amount: number) =>
  `ƒ ${(Math.round((16 - (amount / 100) * 14.6) * 10) / 10).toFixed(1)}`;
export const perspectivePixels = (value: number) =>
  Math.round(1000 - (value / 100) * (value > 0 ? 720 : 1000));
export const rotationFromDrag = (start: number, dx: number, shift: boolean) => {
  const value = Math.max(-360, Math.min(360, start + dx * 0.35));
  return Math.max(
    -360,
    Math.min(
      360,
      shift ? Math.round(value / 5) * 5 : Math.round(value * 10) / 10,
    ),
  );
};
export type CameraControls = {
  blurAmount: number;
  zoom: number;
  perspective: number;
  focusMode: "auto" | "manual";
  zoomBaseline: number;
  baseFov: number;
  baseDistance: number;
};
export function controlsFor(p: Pose, baseline = 70): CameraControls {
  return (
    p.controls ?? {
      blurAmount: Math.min(100, p.blur / 0.3),
      zoom: baseline,
      perspective: 0,
      focusMode: p.focusPoint ? "manual" : "auto",
      zoomBaseline: baseline,
      baseFov: p.fov,
      baseDistance: p.distance,
    }
  );
}
export function changeControls(
  pose: Pose,
  patch: Partial<CameraControls>,
): Pose {
  const p = structuredClone(pose),
    c = { ...controlsFor(p), ...patch };
  p.controls = c;
  if ("zoom" in patch || "perspective" in patch) {
    const perspective = perspectivePixels(c.perspective) / 1000;
    p.distance = c.baseDistance * perspective;
    p.fov = Math.max(
      1,
      Math.min(
        179,
        (360 / Math.PI) *
          Math.atan(
            (Math.tan((c.baseFov * Math.PI) / 360) * c.zoomBaseline) /
              c.zoom /
              perspective,
          ),
      ),
    );
  }
  if ("blurAmount" in patch) {
    p.blur = c.blurAmount * 0.3;
    p.dof = true;
  }
  if (patch.focusMode === "auto") {
    p.focusPoint = null;
    p.focusInfinity = false;
    p.focus = p.distance;
  }
  return p;
}
export function rebaseControls(pose: Pose): Pose {
  if (!pose.controls) return pose;
  const c = pose.controls,
    ratio = perspectivePixels(c.perspective) / 1000;
  return {
    ...pose,
    controls: {
      ...c,
      baseDistance: pose.distance / ratio,
      baseFov:
        (360 / Math.PI) *
        Math.atan(
          ((Math.tan((pose.fov * Math.PI) / 360) * c.zoom) / c.zoomBaseline) *
            ratio,
        ),
    },
  };
}

/** Map a contained canvas image, excluding the empty letterbox around it. */
export function containedCanvasUV(
  x: number,
  y: number,
  boxWidth: number,
  boxHeight: number,
  imageWidth: number,
  imageHeight: number,
): [number, number] | null {
  const scale = Math.min(boxWidth / imageWidth, boxHeight / imageHeight),
    width = imageWidth * scale,
    height = imageHeight * scale;
  const u = (x - (boxWidth - width) / 2) / width,
    v = (y - (boxHeight - height) / 2) / height;
  return u >= 0 && u <= 1 && v >= 0 && v <= 1 ? [u, v] : null;
}

// Reciprocal distance makes the infinity endpoint continuous and serializable.
export const manualFocusValue = (pose: Pose) =>
  pose.focusInfinity
    ? 100
    : 100 *
      (1 -
        Math.cbrt(
          Math.min(
            1,
            Math.max(0.000001, (pose.optics?.apertureScale ?? 1) * 0.01) /
              Math.max(0.000001, pose.focus),
          ),
        ));
export const manualFocusPatch = (pose: Pose, value: number): Partial<Pose> => {
  const near = Math.max(0.000001, (pose.optics?.apertureScale ?? 1) * 0.01);
  return {
    focus:
      value >= 100
        ? near
        : Math.min(1e9, near / Math.max(0.000001, (1 - value / 100) ** 3)),
    focusInfinity: value >= 100,
    focusPoint: null,
    controls: { ...controlsFor(pose), focusMode: "manual" },
  };
};
