// Original synthetic geometry; no photograph, biometric scan or third-party asset.
// Surface splats form an intentionally abstract mannequin for calibration only.
export function createCalibrationPly() {
  const parts = [
    { center: [0, 1.53, 0], radius: [.18, .23, .16], count: 1400, color: [.82, .69, .55] },
    { center: [0, 1.17, 0], radius: [.32, .19, .14], count: 1500, color: [.47, .52, .63] },
    { center: [0, .86, 0], radius: [.21, .28, .12], count: 1500, color: [.43, .48, .59] },
    { center: [-.12, .35, 0], radius: [.09, .35, .1], count: 900, color: [.34, .37, .44] },
    { center: [.12, .35, 0], radius: [.09, .35, .1], count: 900, color: [.34, .37, .44] },
    { center: [-.35, .95, 0], radius: [.075, .30, .075], count: 700, color: [.64, .58, .52] },
    { center: [.35, .95, 0], radius: [.075, .30, .075], count: 700, color: [.64, .58, .52] }
  ];
  const count = parts.reduce((n, part) => n + part.count, 0);
  const properties = ['x', 'y', 'z', 'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity', 'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3'];
  const header = new TextEncoder().encode(`ply\nformat binary_little_endian 1.0\nelement vertex ${count}\n${properties.map(n => `property float ${n}`).join('\n')}\nend_header\n`);
  const buffer = new ArrayBuffer(header.length + count * properties.length * 4);
  new Uint8Array(buffer).set(header);
  const view = new DataView(buffer);
  let offset = header.length;
  for (const part of parts) {
    for (let i = 0; i < part.count; i++) {
      const y = 1 - 2 * (i + .5) / part.count;
      const r = Math.sqrt(1 - y * y);
      const phi = i * Math.PI * (3 - Math.sqrt(5));
      const normal = [Math.cos(phi) * r, y, Math.sin(phi) * r];
      const point = normal.map((v, axis) => part.center[axis] + v * part.radius[axis]);
      const shade = .82 + .18 * Math.max(0, normal[0] * -.4 + normal[1] * .7 + normal[2] * .4);
      const rgb = part.color.map(c => (c * shade - .5) / .28209479177387814);
      const scale = Math.log(.009);
      for (const value of [...point, ...rgb, 3, scale, scale, scale, 1, 0, 0, 0]) { view.setFloat32(offset, value, true); offset += 4; }
    }
  }
  return buffer;
}
