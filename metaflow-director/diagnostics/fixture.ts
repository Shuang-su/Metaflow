/** Generated, deliberately overlapping planes. No published model is changed. */
export function depthFixture(point = false) {
  const rows: number[][] = [];
  const add = (
    x: number,
    y: number,
    z: number,
    color: number[],
    alpha: number,
    sigma: number[],
  ) =>
    rows.push([
      -x,
      -y,
      z,
      ...color.map((c) => (c - 0.5) / 0.28209479177387814),
      Math.log(alpha / (1 - alpha)),
      ...sigma.map(Math.log),
      1,
      0,
      0,
      0,
    ]);
  // Entry order is the reverse of the required far-to-near order. A 20-bit
  // normalized key merges the two planes when a distant environment is present.
  for (const x of point ? [] : [-1.5, 0, 1.5]) {
    add(x, 0, 0, [0.06, 0.96, 0.12], 0.7, [0.33, 0.55, 0.001]);
    add(x, 0, -0.003, [0.96, 0.06, 0.12], 0.7, [0.33, 0.55, 0.001]);
  }
  // Invisible in the view but legitimately part of the world clipping range.
  if (point) add(0, 0, 2.5, [1, 1, 1], 0.95, [0.006, 0.006, 0.006]);
  else add(0, 0, -100000, [0, 0, 0], 0.00001, [0.001, 0.001, 0.001]);
  const names = [
    "x",
    "y",
    "z",
    "f_dc_0",
    "f_dc_1",
    "f_dc_2",
    "opacity",
    "scale_0",
    "scale_1",
    "scale_2",
    "rot_0",
    "rot_1",
    "rot_2",
    "rot_3",
  ];
  const header = new TextEncoder().encode(
    `ply\nformat binary_little_endian 1.0\ncomment MF-106 close-depth diagnostic\nelement vertex ${rows.length}\n${names.map((n) => "property float " + n).join("\n")}\nend_header\n`,
  );
  const data = new Uint8Array(header.length + rows.length * 56);
  data.set(header);
  const view = new DataView(data.buffer);
  let offset = header.length;
  for (const row of rows)
    for (const value of row) {
      view.setFloat32(offset, value, true);
      offset += 4;
    }
  return data.buffer;
}
