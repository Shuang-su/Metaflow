/** Read-only observation of original collision calls; no extra physics queries. */
import type { Collision, PushOut, RayHit } from '../../metaflow-viewer/src/collision';
export type NativeQuery =
  | { kind: 'ray'; origin: RayHit; direction: RayHit; range: number; hit: RayHit | null }
  | { kind: 'capsule'; center: RayHit; halfHeight: number; radius: number; hit: boolean; push: PushOut | null };
export function observeNativeQueries(collision: Collision, record: (query: NativeQuery) => void): Collision {
  return {
    get voxelResolution() { return collision.voxelResolution; },
    queryRay(x, y, z, dx, dy, dz, range) {
      const hit = collision.queryRay(x, y, z, dx, dy, dz, range);
      record({ kind: 'ray', origin: { x, y, z }, direction: { x: dx, y: dy, z: dz }, range,
        hit: hit ? { ...hit } : null });
      return hit;
    },
    queryCapsule(x, y, z, halfHeight, radius, out) {
      const hit = collision.queryCapsule(x, y, z, halfHeight, radius, out);
      record({ kind: 'capsule', center: { x, y, z }, halfHeight, radius, hit, push: hit ? { ...out } : null });
      return hit;
    },
    querySphere: collision.querySphere.bind(collision),
    querySurfaceNormal: collision.querySurfaceNormal.bind(collision),
    isFreeAt: collision.isFreeAt.bind(collision),
  };
}
