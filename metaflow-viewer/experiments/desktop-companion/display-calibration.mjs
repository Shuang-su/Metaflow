const metricKeys = ['width', 'height', 'dpr', 'screenWidth', 'screenHeight', 'scale'];
const displayKeys = ['dpr', 'screenWidth', 'screenHeight', 'scale'];
const positive = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0;
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const validMetrics = (metrics) => record(metrics) && metricKeys.every((key) => positive(metrics[key]));

/** A platform hint only: this does not identify a Mac model or its physical size. */
export function detectDesktopMac(info = {}) {
  if (!record(info)) return false;
  const { userAgent = '', platform = '', maxTouchPoints = 0 } = info;
  if (typeof userAgent !== 'string' || typeof platform !== 'string' ||
      !Number.isInteger(maxTouchPoints) || maxTouchPoints < 0) return false;
  // iPadOS can advertise a Macintosh UA and MacIntel platform. Its touch count
  // remains the distinguishing hint; explicit mobile Apple UAs are excluded too.
  if (/iPad|iPhone|iPod|Android|Mobile\//i.test(`${userAgent} ${platform}`)) return false;
  const mac = /Macintosh|Mac OS X/i.test(userAgent) || /^Mac/i.test(platform);
  return mac && maxTouchPoints <= 1;
}

/**
 * Capture a ruler measurement of the visible canvas in CSS pixels.
 * All six metrics must be finite positive numbers; the reference is copied.
 * The returned calibration is plain JSON-serializable data.
 */
export function createDisplayCalibration(widthCm, metrics) {
  if (!positive(widthCm) || !validMetrics(metrics)) {
    throw new RangeError('Canvas width and display metrics must be finite positive numbers.');
  }
  const cmPerPixel = widthCm / metrics.width;
  if (!positive(cmPerPixel)) throw new RangeError('The physical pixel density must be finite and positive.');
  const reference = Object.fromEntries(metricKeys.map((key) => [key, metrics[key]]));
  return { widthCm, cmPerPixel, reference };
}

/**
 * Preserve centimetres per CSS pixel across ordinary window resizes.
 * A changed DPR, screen size, or visual-viewport scale invalidates this estimate.
 * Displays that report identical metrics cannot be distinguished by this API.
 * Neither the calibration nor metrics are mutated. `changed` compares canvas
 * dimensions with the stored reference, not with a previous resolve call.
 */
export function resolveDisplayCalibration(calibration, metrics) {
  const priorWidth = positive(calibration?.widthCm) ? calibration.widthCm : null;
  if (!record(calibration) || priorWidth === null || !positive(calibration.cmPerPixel) ||
      !validMetrics(calibration.reference)) {
    return { valid: false, reason: 'invalid-calibration', widthCm: priorWidth };
  }
  const expectedDensity = priorWidth / calibration.reference.width;
  if (!positive(expectedDensity) ||
      Math.abs(calibration.cmPerPixel - expectedDensity) > Number.EPSILON * 8 * expectedDensity) {
    return { valid: false, reason: 'invalid-calibration', widthCm: priorWidth };
  }
  if (!validMetrics(metrics)) return { valid: false, reason: 'invalid-metrics', widthCm: priorWidth };
  if (displayKeys.some((key) => metrics[key] !== calibration.reference[key])) {
    return { valid: false, reason: 'display-changed', widthCm: priorWidth };
  }
  const widthCm = metrics.width === calibration.reference.width
    ? priorWidth : calibration.cmPerPixel * metrics.width;
  if (!positive(widthCm)) return { valid: false, reason: 'invalid-metrics', widthCm: priorWidth };
  return {
    valid: true,
    widthCm,
    changed: metrics.width !== calibration.reference.width || metrics.height !== calibration.reference.height,
  };
}
