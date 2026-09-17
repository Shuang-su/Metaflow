import { Vec3 } from 'playcanvas';

import type { Collision } from '../collision';

import { bodyFits, standableFloor } from './locomotion';

type TeleportReason = 'valid' | 'space' | 'surface' | 'loading' | 'none';
/** Reused point storage. Callers must not retain this across the next query. */
class TeleportTrace {
    readonly points = Array.from({ length: 129 }, () => new Vec3());
    readonly hit = new Vec3();
    readonly target = new Vec3();
    count = 0;
    hasHit = false;
    valid = false;
    reason: TeleportReason = 'none';
}
const ready = (c: Collision, a: Vec3, b: Vec3): boolean =>
    c.isReadyAlongSegment?.(a.x, a.z, b.x, b.z) ??
    ((c.isReadyAt?.(a.x, a.z) ?? true) && (c.isReadyAt?.(b.x, b.z) ?? true));

const traceTeleport = (
    c: Collision | null | undefined,
    origin: Vec3,
    direction: Vec3,
    head: Vec3,
    height: number,
    arc: boolean,
    out = new TeleportTrace()
): TeleportTrace => {
    out.count = 1;
    out.points[0].copy(origin);
    out.hasHit = out.valid = false;
    out.reason = 'none';
    if (!c || ![origin.x, origin.y, origin.z, direction.x, direction.y, direction.z].every(Number.isFinite)) return out;
    const magnitude = direction.length();
    if (magnitude < 1e-6) return out;
    const vx = (direction.x / magnitude) * 6,
        vy = (direction.y / magnitude) * 6,
        vz = (direction.z / magnitude) * 6;
    let time = 0;
    for (let i = 1; i <= 128; i++) {
        const a = out.points[i - 1],
            b = out.points[i];
        if (arc) {
            const speed = Math.hypot(vx, vy - 9.8 * time, vz);
            // Bound even a downward segment's acceleration over this time step.
            const dt = Math.min(0.05, 0.2 / (speed + 9.8 * 0.05), 2 - time);
            time += dt;
            b.set(origin.x + vx * time, origin.y + vy * time - 4.9 * time * time, origin.z + vz * time);
        } else {
            const distance = Math.min(i * 0.2, 10);
            b.copy(direction)
                .mulScalar(distance / magnitude)
                .add(origin);
        }
        if (Math.hypot(b.x - head.x, b.z - head.z) > 10) return out;
        const dx = b.x - a.x,
            dy = b.y - a.y,
            dz = b.z - a.z;
        const length = Math.hypot(dx, dy, dz);
        if (length < 1e-8) return out;
        const nx = dx / length,
            ny = dy / length,
            nz = dz / length;
        const hit = c.queryRay(a.x, a.y, a.z, nx, ny, nz, length);
        if (hit && [hit.x, hit.y, hit.z].every(Number.isFinite)) {
            out.hit.set(hit.x, hit.y, hit.z);
            b.copy(out.hit);
            out.count = i + 1;
            if (!ready(c, a, b)) {
                out.reason = 'loading';
                return out;
            }
            out.hasHit = true;
            const normal = c.querySurfaceNormal(b.x, b.y, b.z, nx, ny, nz);
            if (!Number.isFinite(normal.ny) || normal.ny + 1e-6 < Math.SQRT1_2) {
                out.reason = 'surface';
                return out;
            }
            for (const [x, z] of [
                [0, 0],
                [0.18, 0],
                [-0.18, 0],
                [0, 0.18],
                [0, -0.18]
            ]) {
                if (c.isReadyAt?.(b.x + x, b.z + z) === false) {
                    out.reason = 'loading';
                    return out;
                }
            }
            if (!bodyFits(c, b.x, b.y, b.z, height)) {
                out.reason = 'space';
                return out;
            }
            const floor = standableFloor(c, b.x, b.y + 0.25, b.z, height, 0.5);
            if (floor === null) {
                out.reason = 'surface';
                return out;
            }
            out.target.set(b.x, floor, b.z);
            out.valid = true;
            out.reason = 'valid';
            return out;
        }
        if (!ready(c, a, b)) {
            out.reason = 'loading';
            return out;
        }
        out.count = i + 1;
        if ((arc && time >= 2) || (!arc && i >= 50)) break;
    }
    return out;
};
export { traceTeleport, TeleportTrace };
export type { TeleportReason };
