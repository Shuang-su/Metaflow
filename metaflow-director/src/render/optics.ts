/** Scene-unit calibration; the UI f-number is not a claim of measured lens data. */
export type PhotographyOptics = {
  model: "splat-v1" | "aperture-v1";
  apertureScale: number;
};

export function apertureDiameter(optics: PhotographyOptics, blur: number) {
  const amount = Math.max(0, Math.min(1, blur / 30));
  const fNumber = 16 - 14.6 * amount;
  // Zero retains the source control's unblurred endpoint. Area changes continuously.
  return (
    optics.apertureScale *
    Math.sqrt(Math.max(0, 1 / (fNumber * fNumber) - 1 / 256))
  );
}

export function circleOfConfusion(
  depth: number,
  focus: number,
  focalPixels: number,
  diameter: number,
) {
  return (
    focalPixels *
    diameter *
    0.5 *
    Math.abs(1 / Math.max(depth, 1e-6) - 1 / Math.max(focus, 1e-6))
  );
}

export function opacityCompensation(
  a: number,
  b: number,
  d: number,
  variance: number,
) {
  const original = Math.max(0, a * d - b * b);
  return Math.sqrt(
    original / Math.max(1e-20, (a + variance) * (d + variance) - b * b),
  );
}

/** Prefix-consistent disk samples shared by both diagnostic backends. */
export function apertureSample(
  index: number,
  diameter: number,
): [number, number] {
  const inverse = (n: number, base: number) => {
    let value = 0,
      fraction = 1;
    while (n) {
      fraction /= base;
      value += (n % base) * fraction;
      n = Math.floor(n / base);
    }
    return value;
  };
  const radius = Math.sqrt(inverse(index + 1, 2)) * diameter * 0.5;
  const angle = 2 * Math.PI * inverse(index + 1, 3);
  return [radius * Math.cos(angle), radius * Math.sin(angle)];
}
// Pinned projector axes are sqrt(8 * covariance); its radial kernel is
// (exp(-4*r²)-exp(-4))/(1-exp(-4)), truncated at r=1. Re-basing the tail
// reduces its actual per-axis variance. Compensate that kernel, not the aperture.
export const PROJECTED_KERNEL_VARIANCE =
  (1 - 13 * Math.exp(-4)) / (1 - 5 * Math.exp(-4));
