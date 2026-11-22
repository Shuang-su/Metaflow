// Metaflow SP f3c2d6114ca0e8c7de0dd633db685dab59f0e18c · navigation/map-view.ts
export type MapMode = 'overview' | 'follow' | 'manual';
export const shortestAngle = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

/** Screen rotation in radians, derived exclusively from horizontal travel. */
export class MapHeading {
    private motion = new GroundMotion();
    rotation = 0;
    private desired = 0;
    private initialized = false;
    reset() { this.rotation = this.desired = 0; this.initialized = false; this.motion.reset(); }
    sample(pose: MotionPose) {
        const { heading } = this.motion.sample(pose);
        if (heading) this.travel(heading.x, heading.z);
    }
    seed(dx: number, dz: number) {
        if (this.initialized || Math.hypot(dx, dz) < .001) return;
        this.desired = this.rotation = -Math.PI / 2 - Math.atan2(dz, dx);
        this.initialized = true;
    }
    travel(vx: number, vz: number) {
        if (Math.hypot(vx, vz) < .15) return;
        this.seed(vx, vz);
        this.desired = -Math.PI / 2 - Math.atan2(vz, vx);
    }
    step(dt: number, reducedMotion: boolean) {
        const delta = shortestAngle(this.desired - this.rotation);
        if (Math.abs(delta) < .0001) return false;
        this.rotation += reducedMotion ? delta : delta * (1 - Math.exp(-Math.max(0, Math.min(dt, .1)) / .22));
        return true;
    }
}

export type MapView = { x: number; z: number; span: number; rotation: number; anchorY: number };

/** Clamp the screen centre (not the follow anchor) to the current floor.
 * Rotation, zoom and the user's manual mode are retained. No asset reload. */
export function constrainMapView(view: MapView, bounds: {minX:number;minZ:number;maxX:number;maxZ:number}): MapView {
    const [x, z] = mapWorld(220, 220, view);
    const half = view.span * 220 / 410 * (Math.abs(Math.cos(view.rotation))+Math.abs(Math.sin(view.rotation)));
    const insetX = Math.min(half, (bounds.maxX-bounds.minX) * .5);
    const insetZ = Math.min(half, (bounds.maxZ-bounds.minZ) * .5);
    const cx = Math.max(bounds.minX+insetX, Math.min(bounds.maxX-insetX, x));
    const cz = Math.max(bounds.minZ+insetZ, Math.min(bounds.maxZ-insetZ, z));
    if(Math.abs(cx-x)+Math.abs(cz-z)<1e-9)return view;
    return {...view, x:view.x+cx-x, z:view.z+cz-z};
}

/** Mode changes animate as one camera; retargets do not restart a running transition. */
export class MapCamera {
    view: MapView | null = null;
    private from: MapView | null = null;
    private target: MapView | null = null;
    private elapsed = .32;
    get moving() { return this.elapsed < .32; }
    moveTo(target: MapView, reduced = false, restart = false) {
        this.target = { ...target };
        if (!this.view || reduced) { this.view = { ...target }; this.elapsed = .32; return; }
        if (!this.moving || restart) { this.from = { ...this.view }; this.elapsed = 0; }
    }
    track(target: MapView) {
        this.target = { ...target };
        if (!this.moving) this.view = { ...target };
    }
    freeze() { this.elapsed = .32; this.target = this.view ? { ...this.view } : null; }
    step(dt: number, reduced = false) {
        if (!this.moving || !this.from || !this.target) return false;
        this.elapsed = reduced ? .32 : Math.min(.32, this.elapsed + Math.max(0, dt));
        const t = 1 - (1 - this.elapsed / .32) ** 3, a = this.from, b = this.target;
        this.view = {
            x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t,
            span: a.span * (b.span / a.span) ** t,
            rotation: a.rotation + shortestAngle(b.rotation - a.rotation) * t,
            anchorY: a.anchorY + (b.anchorY - a.anchorY) * t
        };
        return true;
    }
}

export function mapPoint(x: number, z: number, view: MapView): [number, number] {
    const [rx, rz] = rotateMap(x - view.x, z - view.z, view.rotation), scale = 410 / view.span;
    return [220 + rx * scale, 440 * view.anchorY + rz * scale];
}
export function mapWorld(x: number, y: number, view: MapView): [number, number] {
    const [dx, dz] = rotateMap((x - 220) * view.span / 410, (y - 440 * view.anchorY) * view.span / 410, -view.rotation);
    return [view.x + dx, view.z + dz];
}

/** Shared by canvas geometry, markers and the inverse pointer-pan transform. */
export function rotateMap(x: number, z: number, angle: number): [number, number] {
    const c = Math.cos(angle), s = Math.sin(angle);
    return [x * c - z * s, x * s + z * c];
}
import { GroundMotion, type MotionPose } from './ground-motion';

