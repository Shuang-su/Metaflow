import { Vec3 } from 'playcanvas';
import type { Entity } from 'playcanvas';

import type { Collision, RayHit } from '../collision';

const BODY_RADIUS = 0.18;
const FOOT_CLEARANCE = 0.025;
const MAX_STEP = 0.25;
const MIN_FLOOR_NORMAL = Math.cos(Math.PI / 4);

/** Select the stick by layout, never switch to a touchpad when the stick is neutral. */
const readStick = (axes: readonly number[], deadzone = 0.15): [number, number] => {
    const offset = axes.length >= 4 ? 2 : 0;
    const x = Number.isFinite(axes[offset]) ? axes[offset] : 0;
    const y = Number.isFinite(axes[offset + 1]) ? axes[offset + 1] : 0;
    const length = Math.hypot(x, y);
    if (length <= deadzone) return [0, 0];
    const gain = (Math.min(length, 1) - deadzone) / ((1 - deadzone) * length);
    return [x * gain, y * gain];
};

/** A hand can expose gamepad buttons without having a joystick. */
const hasStick = (source: { gamepad?: { axes: readonly number[] } | null }): boolean =>
    (source.gamepad?.axes.length ?? 0) >= 2;

const singleStickIntent = (axes: readonly number[], gripping: boolean): { move: [number, number]; turn: number } => {
    const [x, y] = readStick(axes);
    return { move: [gripping ? x : 0, y], turn: gripping ? 0 : x };
};

/** Horizontal forward, including the last valid direction when looking straight up/down. */
const horizontalForward = (forward: Vec3, previous: Vec3): Vec3 => {
    const length = Math.hypot(forward.x, forward.z);
    if (length > 0.01) previous.set(forward.x / length, 0, forward.z / length);
    return previous;
};

const headYaw = (head: Entity): number => (Math.atan2(-head.forward.x, -head.forward.z) * 180) / Math.PI;

const rotateAroundHead = (rig: Entity, head: Entity, degrees: number): void => {
    const before = head.getPosition().clone();
    rig.rotateLocal(0, degrees, 0);
    rig.translate(before.sub(head.getPosition()));
};

/** World-space subtraction accounts for a rotated rig and room-scale head offsets. */
const placeHead = (rig: Entity, head: Entity, target: Vec3): void => {
    rig.translate(new Vec3().sub2(target, head.getPosition()));
};

const tileReady = (collision: Collision, x: number, z: number): boolean => collision.isReadyAt?.(x, z) ?? true;

/** A footprint must be supported and loaded; empty ray results never imply safe space. */
const standableFloor = (
    collision: Collision,
    x: number,
    probeY: number,
    z: number,
    height: number,
    maxDrop: number,
    referenceFloor?: number
): number | null => {
    let minFloor = Infinity;
    let maxFloor = -Infinity;
    for (const [dx, dz] of [
        [0, 0],
        [BODY_RADIUS, 0],
        [-BODY_RADIUS, 0],
        [0, BODY_RADIUS],
        [0, -BODY_RADIUS]
    ]) {
        if (!tileReady(collision, x + dx, z + dz)) return null;
        const hit = collision.queryRay(x + dx, probeY, z + dz, 0, -1, 0, maxDrop);
        if (!hit) return null;
        const floor = hit.y;
        const normal = collision.querySurfaceNormal(hit.x, floor, hit.z, 0, -1, 0);
        if (!Number.isFinite(floor) || normal.ny + 1e-6 < MIN_FLOOR_NORMAL) return null;
        minFloor = Math.min(minFloor, floor);
        maxFloor = Math.max(maxFloor, floor);
    }
    if (maxFloor - minFloor > MAX_STEP) return null;
    if (referenceFloor !== undefined && Math.abs(maxFloor - referenceFloor) > MAX_STEP) return null;
    const bodyHeight = Math.max(height, BODY_RADIUS * 2);
    const push = { x: 0, y: 0, z: 0 };
    if (
        collision.queryCapsule(
            x,
            maxFloor + FOOT_CLEARANCE + bodyHeight / 2,
            z,
            bodyHeight / 2 - BODY_RADIUS,
            BODY_RADIUS,
            push
        )
    )
        return null;
    return maxFloor;
};

/** A fly/orbit entry can overlap scenery. Search nearby loaded support once, never in the render loop. */
const findEntryFloor = (collision: Collision, eye: Vec3, height: number): Vec3 | null => {
    const at = (x: number, z: number) => {
        const floor = standableFloor(collision, x, eye.y, z, height, 4);
        return floor === null ? null : new Vec3(x, floor, z);
    };
    const center = at(eye.x, eye.z);
    if (center) return center;
    for (let ring = 1; ring <= 6; ring++) {
        const radius = ring * 0.25;
        for (let i = 0; i < ring * 8; i++) {
            const angle = (i * Math.PI * 2) / (ring * 8);
            const target = at(eye.x + Math.cos(angle) * radius, eye.z + Math.sin(angle) * radius);
            if (target) return target;
        }
    }
    return null;
};

const teleportTarget = (
    collision: Collision | null | undefined,
    origin: Vec3,
    direction: Vec3,
    head: Vec3,
    height: number
): Vec3 | null => {
    if (!collision) return null;
    const hit: RayHit | null = collision.queryRay(
        origin.x,
        origin.y,
        origin.z,
        direction.x,
        direction.y,
        direction.z,
        10
    );
    if (!hit) return null;
    // Copy: collision implementations may reuse the returned hit for the footprint rays.
    const x = hit.x,
        y = hit.y,
        z = hit.z;
    if (Math.hypot(x - head.x, z - head.z) > 10) return null;
    const floor = standableFloor(collision, x, y + MAX_STEP, z, height, MAX_STEP * 2);
    return floor === null ? null : new Vec3(x, floor, z);
};

/** Substeps prevent low frame rates from skipping thin walls; never alter tracked head pose. */
const moveOnGround = (
    collision: Collision,
    head: Vec3,
    floor: number,
    height: number,
    dx: number,
    dz: number
): Vec3 => {
    const result = new Vec3(head.x, floor, head.z);
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.04));
    const sx = dx / steps,
        sz = dz / steps;
    for (let i = 0; i < steps; i++) {
        const tryStep = (x: number, z: number): boolean => {
            const next = standableFloor(collision, x, result.y + MAX_STEP, z, height, MAX_STEP * 2, result.y);
            if (next === null) return false;
            result.set(x, next, z);
            return true;
        };
        if (!tryStep(result.x + sx, result.z + sz)) {
            // Slide at oblique walls rather than introducing inertia or camera bounce.
            tryStep(result.x + sx, result.z);
            tryStep(result.x, result.z + sz);
        }
    }
    return result;
};

export {
    readStick,
    hasStick,
    singleStickIntent,
    horizontalForward,
    headYaw,
    rotateAroundHead,
    placeHead,
    standableFloor,
    findEntryFloor,
    teleportTarget,
    moveOnGround,
    FOOT_CLEARANCE
};
