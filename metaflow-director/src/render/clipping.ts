/** World-space bounds, including hidden-instance exclusion, are supplied by the host. */
export function clippingRange(
  bounds: { min: number[]; max: number[] }[],
  position: number[],
  forward: number[],
) {
  let extent = 0.01,
    farthest = 0.01;
  for (const b of bounds) {
    extent = Math.max(
      extent,
      Math.hypot(...b.max.map((v, i) => v - b.min[i])) / 2,
    );
    for (let n = 0; n < 8; n++) {
      const p = b.min.map((v, i) => (n & (1 << i) ? b.max[i] : v));
      farthest = Math.max(
        farthest,
        p.reduce((s, v, i) => s + (v - position[i]) * forward[i], 0),
      );
    }
  }
  // Do not move the camera or tie the focal distance/aperture to clipping.
  const near = Math.max(1e-6, extent * 1e-5);
  return {
    radius: extent,
    near,
    far: Math.max(near * 100, farthest + extent * 0.1),
  };
}
