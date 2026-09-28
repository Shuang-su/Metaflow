import type { WalkPhysicsState } from '../cameras/walk-controller';
export type Point = { x: number; y: number; z: number };
export type Goal = { index: number; camera: Point; radius: 2 | 3 };
export type Region = { ref: number; vertices: Point[]; floor: number };
export type Route = { points: Point[]; polys: number[]; asset: string; revision: number };
export type NavigationManifest = {
    status: 'building' | 'complete';
    fingerprint: string;
    display: { positionsHash: string; indicesHash: string };
    tiles: { name: string; bounds: { min: Point; max: Point }; positionsHash: string; indicesHash: string }[];
};
export type NavigationUpdate = {
    type: 'ready' | 'progress' | 'region' | 'route' | 'exhausted' | 'error';
    session: number;
    message?: string;
    invalidRoute?: boolean;
    route?: Route;
    regions?: Region[];
    choices?: { floor: number; count: number }[];
    timing?: Record<string, number>;
};
export function inRegion(p: Point, support: number, region: Region): boolean {
    // Interpolate the local surface height; a sloping polygon is not one flat floor.
    const v = region.vertices;
    for (let i = 1; i + 1 < v.length; i++) {
        const a = v[0],
            b = v[i],
            c = v[i + 1];
        const den = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
        if (Math.abs(den) < 1e-10) continue;
        const u = ((b.z - c.z) * (p.x - c.x) + (c.x - b.x) * (p.z - c.z)) / den;
        const w = ((c.z - a.z) * (p.x - c.x) + (a.x - c.x) * (p.z - c.z)) / den;
        if (
            u >= -1e-6 &&
            w >= -1e-6 &&
            u + w <= 1 + 1e-6 &&
            Math.abs(support - (u * a.y + w * b.y + (1 - u - w) * c.y)) <= 0.28
        )
            return true;
    }
    return false;
}
/** Query-independent arrival: only accepted native ticks, physical support, and the chosen local surface. */
export class Arrival {
    private ticks = 0;
    private lastTick = -1;
    private epoch = -1;
    fired = false;
    reset() {
        this.ticks = 0;
        this.lastTick = -1;
        this.epoch = -1;
        this.fired = false;
    }
    sample(s: WalkPhysicsState, goal: Goal, regions: Region[]) {
        if (this.fired) return false;
        if (s.tick === this.lastTick && s.epoch === this.epoch) return false;
        if (s.epoch !== this.epoch || s.tick !== this.lastTick + 1) this.ticks = 0;
        this.lastTick = s.tick;
        this.epoch = s.epoch;
        const valid =
            s.collision === 'active' &&
            s.grounded &&
            !s.jumping &&
            s.supportHeight !== null &&
            Math.hypot(s.position.x - goal.camera.x, s.position.z - goal.camera.z) <= goal.radius &&
            regions.some((r) => inRegion(s.position, s.supportHeight, r));
        this.ticks = valid ? this.ticks + 1 : 0;
        if (this.ticks >= 12) {
            this.fired = true;
            return true;
        }
        return false;
    }
    interrupt() {
        this.ticks = 0;
        this.lastTick = -1;
    }
}
