import type { WalkPhysicsState } from '../cameras/walk-controller';
export type Point = { x: number; y: number; z: number };
export type Goal = { index: number; camera: Point; radius: 2 | 3 };
export type Region = { ref: number; vertices: Point[]; floor: number };
export type Route = { points: Point[]; polys: number[]; asset: string; revision: number };
export type NavigationTaskState =
    'loading' | 'computing' | 'route' | 'ground' | 'floor' | 'exhausted' | 'error' | 'arrived' | 'paused' | 'idle';
export type NavigationManifest = {
    status: 'building' | 'complete';
    fingerprint: string;
    display: { positionsHash: string; indicesHash: string };
    tiles: { name: string; bounds: { min: Point; max: Point }; positionsHash: string; indicesHash: string }[];
};
export type NavigationUpdate = {
    type: 'ready' | 'progress' | 'region' | 'route' | 'exhausted' | 'error' | 'cancelled';
    session: number;
    taskState?: NavigationTaskState;
    message?: string;
    invalidRoute?: boolean;
    route?: Route;
    regions?: Region[];
    choices?: { floor: number; count: number }[];
    timing?: Record<string, number>;
};
export const routeLength = (points: Point[]) =>
    points.slice(1).reduce((n, p, i) => n + Math.hypot(p.x - points[i].x, p.y - points[i].y, p.z - points[i].z), 0);

/** Intersect a ground polyline with the SAME disk and triangulated surfaces as Arrival.
 * A small inset belongs to the region (never an expanded arrival radius). It gives the
 * native stop tolerance room to settle inside instead of stopping outside the boundary.
 */
export function clipToArrival(points: Point[], goal: Goal, regions: Region[], inset = 0.08) {
    if (!points.length) return null;
    const first = points[0];
    const inside = regions.find((r) => inRegion(first, first.y, r));
    if (inside && Math.hypot(first.x - goal.camera.x, first.z - goal.camera.z) <= goal.radius) {
        return { points: [first], ref: inside.ref, entry: first, insetLength: 0 };
    }
    const ranges: { lo: number; hi: number; region: Region }[] = [];
    const arcs = [0];
    for (let i = 1; i < points.length; i++)
        arcs.push(
            arcs[i - 1] +
                Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y, points[i].z - points[i - 1].z)
        );
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1],
            b = points[i];
        const dx = b.x - a.x,
            dz = b.z - a.z;
        const intervals: { lo: number; hi: number; region: Region }[] = [];
        for (const region of regions)
            for (let j = 1; j + 1 < region.vertices.length; j++) {
                const [v, w, q] = [region.vertices[0], region.vertices[j], region.vertices[j + 1]];
                const den = (w.z - q.z) * (v.x - q.x) + (q.x - w.x) * (v.z - q.z);
                if (Math.abs(den) < 1e-10) continue;
                const bary = (p: Point) => {
                    const u = ((w.z - q.z) * (p.x - q.x) + (q.x - w.x) * (p.z - q.z)) / den;
                    const t = ((q.z - v.z) * (p.x - q.x) + (v.x - q.x) * (p.z - q.z)) / den;
                    return [u, t, 1 - u - t, p.y - (u * v.y + t * w.y + (1 - u - t) * q.y)];
                };
                const ba = bary(a),
                    bb = bary(b);
                let lo = 0,
                    hi = 1;
                const positive = (v0: number, v1: number) => {
                    if (Math.abs(v1 - v0) < 1e-12) {
                        if (v0 < 0) hi = -1;
                    } else if (v1 > v0) lo = Math.max(lo, -v0 / (v1 - v0));
                    else hi = Math.min(hi, -v0 / (v1 - v0));
                };
                for (let k = 0; k < 3; k++) positive(ba[k] + 1e-8, bb[k] + 1e-8);
                positive(0.28 - ba[3], 0.28 - bb[3]);
                positive(0.28 + ba[3], 0.28 + bb[3]);
                const x = a.x - goal.camera.x,
                    z = a.z - goal.camera.z;
                const aa = dx * dx + dz * dz,
                    ab = 2 * (x * dx + z * dz),
                    ac = x * x + z * z - goal.radius ** 2;
                if (aa < 1e-14) {
                    if (ac > 1e-10) continue;
                } else {
                    const disc = ab * ab - 4 * aa * ac;
                    if (disc < 0) continue;
                    lo = Math.max(lo, (-ab - Math.sqrt(disc)) / (2 * aa));
                    hi = Math.min(hi, (-ab + Math.sqrt(disc)) / (2 * aa));
                }
                if (lo <= hi && hi >= 0 && lo <= 1)
                    intervals.push({ lo: Math.max(0, lo), hi: Math.min(1, hi), region });
            }
        for (const r of intervals)
            ranges.push({
                lo: arcs[i - 1] + r.lo * (arcs[i] - arcs[i - 1]),
                hi: arcs[i - 1] + r.hi * (arcs[i] - arcs[i - 1]),
                region: r.region
            });
    }
    ranges.sort((a, b) => a.lo - b.lo);
    if (!ranges.length) return null;
    const entryArc = ranges[0].lo;
    let connectedEnd = ranges[0].hi;
    for (const r of ranges) {
        if (r.lo > connectedEnd + 1e-7) break;
        connectedEnd = Math.max(connectedEnd, r.hi);
    }
    const endpointArc = Math.min(connectedEnd, entryArc + inset);
    const at = (arc: number) => {
        let i = 1;
        while (i < arcs.length - 1 && arcs[i] < arc) i++;
        const a = points[i - 1],
            b = points[i];
        const t = Math.min(1, Math.max(0, (arc - arcs[i - 1]) / Math.max(1e-12, arcs[i] - arcs[i - 1])));
        return { index: i, point: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t } };
    };
    const end = at(endpointArc),
        entry = at(entryArc).point;
    const region = ranges.find((r) => r.lo <= endpointArc + 1e-8 && r.hi >= endpointArc - 1e-8)!.region;
    return {
        points: [...points.slice(0, end.index), end.point],
        ref: region.ref,
        entry,
        insetLength: endpointArc - entryArc
    };
}

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
