import type { MapView } from './map-view';

type Point = { x: number; z: number };
type Bounds = { left: number; top: number; right: number; bottom: number };
type Viewport = { width: number; height: number; unit: number };

const APPROACH_METERS = 18;
const EXIT_BLEND_METERS = 6;
const NEARBY_METERS = 18;
const NEIGHBOR_METERS = 42;
const FRAME_PADDING_METERS = 5;
const CONTEXT_SCALE = 1.12;

const smoothstep = (value: number) => {
    const t = Math.max(0, Math.min(1, value));
    return t * t * (3 - 2 * t);
};

function boundsOf(ring: readonly Point[]): Bounds {
    return {
        left: Math.min(...ring.map((point) => point.x)),
        top: Math.min(...ring.map((point) => point.z)),
        right: Math.max(...ring.map((point) => point.x)),
        bottom: Math.max(...ring.map((point) => point.z))
    };
}

function union(a: Bounds, b: Bounds): Bounds {
    return {
        left: Math.min(a.left, b.left),
        top: Math.min(a.top, b.top),
        right: Math.max(a.right, b.right),
        bottom: Math.max(a.bottom, b.bottom)
    };
}

function signedDistance({ x, z }: Point, ring: readonly Point[]) {
    let inside = false;
    let distance = Infinity;
    let a = ring[ring.length - 1];
    for (const b of ring) {
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        if (a.z > z !== b.z > z && x < a.x + (dx * (z - a.z)) / dz) inside = !inside;
        const length = dx * dx + dz * dz;
        const t = length ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / length)) : 0;
        distance = Math.min(distance, Math.hypot(x - a.x - dx * t, z - a.z - dz * t));
        a = b;
    }
    return inside ? distance : -distance;
}

function blend(from: MapView, to: MapView, amount: number): MapView {
    return {
        ...to,
        x: from.x + (to.x - from.x) * amount,
        z: from.z + (to.z - from.z) * amount,
        span: from.span + (to.span - from.span) * amount
    };
}

/** The footprints and live positions share the map's metre coordinates. */
export function makeMapOverview(primary: readonly Point[], adjacent?: readonly Point[]) {
    const primaryBounds = boundsOf(primary);
    const adjacentBounds = adjacent && boundsOf(adjacent);
    return (position: Point, home: MapView, { width, height, unit }: Viewport): MapView => {
        const edge = signedDistance(position, primary);
        if (edge >= APPROACH_METERS) return home;

        const fit = (bounds: Bounds): MapView => ({
            ...home,
            x: (bounds.left + bounds.right) * 0.5,
            z: (bounds.top + bounds.bottom) * 0.5,
            span: Math.max(
                home.span * CONTEXT_SCALE,
                ((410 * unit) / 440) *
                    Math.max(
                        (bounds.right - bounds.left + 2 * FRAME_PADDING_METERS) / width,
                        (bounds.bottom - bounds.top + 2 * FRAME_PADDING_METERS) / height
                    )
            )
        });
        const nearby = union(primaryBounds, {
            left: position.x - NEARBY_METERS,
            top: position.z - NEARBY_METERS,
            right: position.x + NEARBY_METERS,
            bottom: position.z + NEARBY_METERS
        });
        let context = fit(nearby);
        if (adjacent && adjacentBounds) {
            const meters = Math.max(0, -signedDistance(position, adjacent));
            const weight = smoothstep(1 - meters / NEIGHBOR_METERS);
            if (weight) context = blend(context, fit(union(nearby, adjacentBounds)), weight);
        }
        return blend(home, context, smoothstep((APPROACH_METERS - edge) / (APPROACH_METERS + EXIT_BLEND_METERS)));
    };
}

/** Retain context a little longer on re-entry and settle exactly at the normal hall frame. */
export function stepMapOverview(current: MapView, target: MapView, dt: number, reducedMotion: boolean): MapView {
    if (
        reducedMotion ||
        Math.max(Math.abs(target.x - current.x), Math.abs(target.z - current.z), Math.abs(target.span - current.span)) <
            0.002
    )
        return target;
    const time = target.span >= current.span ? 0.27 : 0.66;
    return blend(current, target, 1 - Math.exp(-Math.max(0, Math.min(dt, 0.1)) / time));
}
