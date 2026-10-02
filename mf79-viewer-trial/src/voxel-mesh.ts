import type { Bounds, Point, Space } from "./types";

/** Exact exposed faces of a bounded occupancy lattice. Greedy merging is coplanar
 * only: no smoothing, floor projection, hole filling or layer collapse. */
export function exposedVoxelMesh(
  space: Space,
  bounds: Bounds,
  origin: Point,
  resolution: number,
  options: { boundary?: "cropped" | "source" } = {},
) {
  const started = performance.now(),
    axes = ["x", "y", "z"] as const;
  const lo = axes.map((k) =>
    Math.floor((bounds.min[k] - origin[k]) / resolution),
  );
  const hi = axes.map((k) =>
    Math.ceil((bounds.max[k] - origin[k]) / resolution),
  );
  const dims = hi.map((v, i) => v - lo[i]);
  const total = dims.reduce((a, b) => a * b, 1);
  if (total > 128_000_000 || total <= 0)
    throw Error("体素几何超出本轮 1.28 亿格离线限制");
  const data = new Int8Array(total),
    offset = (x: number, y: number, z: number) =>
      x + dims[0] * (y + dims[1] * z);
  const minimum = axes.map((k, i) => origin[k] + lo[i] * resolution);
  let solids = 0;
  for (let z = 0; z < dims[2]; z++)
    for (let y = 0; y < dims[1]; y++)
      for (let x = 0; x < dims[0]; x++) {
        const p = {
          x: minimum[0] + (x + 0.5) * resolution,
          y: minimum[1] + (y + 0.5) * resolution,
          z: minimum[2] + (z + 0.5) * resolution,
        };
        const known = space.known(p.x, p.y, p.z);
        const solid = known && !space.collision.isFreeAt(p.x, p.y, p.z);
        data[offset(x, y, z)] = known ? Number(solid) : -1;
        solids += Number(solid);
      }
  const occupied = (p: number[]) =>
    p.some((v, i) => v < 0 || v >= dims[i])
      ? options.boundary === "source"
        ? (() => {
            const point = p.map(
              (v, k) => minimum[k] + (v + 0.5) * resolution,
            ) as [number, number, number];
            return space.known(...point)
              ? Number(!space.collision.isFreeAt(...point))
              : -1;
          })()
        : 0
      : data[offset(p[0], p[1], p[2])];
  const positions: number[] = [],
    indices: number[] = [];
  let exposedFaces = 0,
    quads = 0;
  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3,
      v = (d + 2) % 3,
      mask = new Int8Array(dims[u] * dims[v]);
    for (let slice = 0; slice <= dims[d]; slice++) {
      for (let j = 0; j < dims[v]; j++)
        for (let i = 0; i < dims[u]; i++) {
          const a = [0, 0, 0];
          a[d] = slice - 1;
          a[u] = i;
          a[v] = j;
          const b = [...a];
          b[d] = slice;
          const left = occupied(a),
            right = occupied(b);
          mask[j * dims[u] + i] =
            left < 0 || right < 0 || left === right ? 0 : left ? 1 : -1;
          if (mask[j * dims[u] + i]) exposedFaces++;
        }
      for (let j = 0; j < dims[v]; j++)
        for (let i = 0; i < dims[u];) {
          const sign = mask[j * dims[u] + i];
          if (!sign) {
            i++;
            continue;
          }
          let w = 1,
            h = 1;
          while (i + w < dims[u] && mask[j * dims[u] + i + w] === sign) w++;
          outer: while (j + h < dims[v]) {
            for (let k = 0; k < w; k++)
              if (mask[(j + h) * dims[u] + i + k] !== sign) break outer;
            h++;
          }
          const base = positions.length / 3;
          for (const [du, dv] of [
            [0, 0],
            [w, 0],
            [w, h],
            [0, h],
          ]) {
            const p = [0, 0, 0];
            p[d] = slice;
            p[u] = i + du;
            p[v] = j + dv;
            positions.push(...p.map((q, k) => minimum[k] + q * resolution));
          }
          indices.push(
            ...(sign > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]).map(
              (n) => base + n,
            ),
          );
          quads++;
          if (
            positions.length * 8 + indices.length * 8 + total >
            1024 * 1024 * 1024
          )
            throw Error(
              "暴露面几何超过 1 GiB 离线工作预算；需要分块生成，未缩小覆盖",
            );
          for (let a = 0; a < h; a++)
            mask.fill(0, (j + a) * dims[u] + i, (j + a) * dims[u] + i + w);
          i += w;
        }
    }
  }
  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
    diagnostics: {
      bounds,
      origin,
      resolution,
      dimensions: dims,
      occupancyBytes: data.byteLength,
      solids,
      exposedFaces,
      quads,
      triangles: indices.length / 3,
      milliseconds: performance.now() - started,
      geometry:
        options.boundary === "source"
          ? "Source-neighbour exposed faces; no cut-plane caps"
          : "All exposed voxel faces, coplanar greedy merge only; cropped boundary is explicit",
    },
  };
}
