// Metaflow SP f3c2d6114ca0e8c7de0dd633db685dab59f0e18c · navigation/ground-motion.ts
type Point = { x: number; y: number; z: number };

export type MotionPose = {
    position: Readonly<Point>; tick: number; epoch: number;
    grounded: boolean; collision: string; supportHeight: number | null;
};
type Sample = { position: Point; tick: number; epoch: number; floor: number | null };
type MotionDelta = { fresh: boolean; reset: boolean; dx: number; dz: number; seconds: number; heading: { x: number; z: number } | null };

/** Accepted physical displacement, never the controller's pre-collision velocity. */
export class GroundMotion {
    private previous: Sample | null = null;
    private window: Sample[] = [];
    reset() { this.previous = null; this.window = []; }
    sample(pose: MotionPose): MotionDelta {
        const previous = this.previous;
        const seconds = previous ? (pose.tick - previous.tick) / 60 : 0;
        const dx = previous ? pose.position.x - previous.position.x : 0;
        const dz = previous ? pose.position.z - previous.position.z : 0;
        const fresh = !previous || pose.epoch !== previous.epoch || pose.tick !== previous.tick;
        const invalid = !pose.grounded || pose.collision !== 'active';
        const reset = invalid || !previous || pose.epoch !== previous.epoch || seconds < 0 || seconds > .25 ||
            Math.hypot(dx, dz) > Math.max(.5, seconds * 12) ||
            (previous.floor !== null && pose.supportHeight !== null && Math.abs(previous.floor - pose.supportHeight) > .45);
        if (invalid) this.reset();
        if (!fresh || invalid) return { fresh: false, reset, dx: 0, dz: 0, seconds: 0, heading: null };
        const sample = { position: { ...pose.position }, tick: pose.tick, epoch: pose.epoch, floor: pose.supportHeight };
        if (reset) this.window = [];
        this.previous = sample;
        this.window.push(sample);
        while (this.window.length > 1 && this.window[1].tick < pose.tick - 18) this.window.shift();
        const first = this.window[0], hx = pose.position.x - first.position.x, hz = pose.position.z - first.position.z;
        const length = Math.hypot(hx, hz);
        const heading = pose.tick - first.tick >= 8 && length >= .04 && Math.hypot(dx, dz) > .0001
            ? { x: hx / length, z: hz / length } : null;
        return { fresh, reset, dx: reset ? 0 : dx, dz: reset ? 0 : dz, seconds: reset ? 0 : seconds, heading };
    }
}
