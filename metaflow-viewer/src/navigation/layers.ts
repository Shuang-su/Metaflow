/** Geometry identities survive Detour rebuilds; poly refs remain query-local. */
import type { WalkPhysicsState } from '../cameras/walk-controller';
export type SurfaceIdentityId = string;
export type LayerId = string;
export type SurfacePoint = { x: number; y: number; z: number };
export type SurfaceIdentity = {
    id: SurfaceIdentityId;
    layerId: LayerId;
    bounds: { min: SurfacePoint; max: SurfacePoint };
    /** Unit normal and plane offset: nx*x + ny*y + nz*z + d = 0. */
    plane: [number, number, number, number];
    footprint: SurfacePoint[];
    neighbors: SurfaceIdentityId[];
};

const quantize = (n: number, step: number) => Math.round(n / step);
function hash(text: string): string {
    let value = 14695981039346656037n;
    for (let i = 0; i < text.length; i++)
        value = BigInt.asUintN(64, (value ^ BigInt(text.charCodeAt(i))) * 1099511628211n);
    return value.toString(16).padStart(16, '0');
}

/** Caller supplies the source namespace and a persisted layer anchor, never a poly ref. */
export function surfaceIdentity(
    namespace: string,
    layerAnchor: number,
    footprint: SurfacePoint[],
    plane: SurfaceIdentity['plane']
): SurfaceIdentity {
    if (
        !namespace ||
        !Number.isFinite(layerAnchor) ||
        footprint.length < 3 ||
        !footprint.every((p) => [p.x, p.y, p.z].every(Number.isFinite)) ||
        !plane.every(Number.isFinite)
    )
        throw Error('Invalid supporting surface');
    const magnitude = Math.hypot(plane[0], plane[1], plane[2]);
    if (magnitude < 1e-9 || Math.abs(plane[1]) / magnitude < 0.1) throw Error('Invalid supporting plane');
    const direction = plane[1] < 0 ? -1 : 1;
    plane = plane.map((v) => (v / magnitude) * direction) as SurfaceIdentity['plane'];
    const xs = footprint.map((p) => p.x),
        ys = footprint.map((p) => p.y),
        zs = footprint.map((p) => p.z);
    const bounds = {
        min: { x: Math.min(...xs), y: Math.min(...ys), z: Math.min(...zs) },
        max: { x: Math.max(...xs), y: Math.max(...ys), z: Math.max(...zs) }
    };
    const layerId = `${namespace}:layer:${quantize(layerAnchor, 0.5)}`;
    // Centimeter geometry distinguishes separate source-voxel surfaces sharing the same XZ.
    const vertices = footprint
        .map((p) => [quantize(p.x, 0.01), quantize(p.y, 0.01), quantize(p.z, 0.01)])
        .sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
    const planeKey = plane.map((v, i) => quantize(v, i === 3 ? 0.01 : 0.0001));
    return {
        id: `${layerId}:surface:${hash(JSON.stringify({ vertices, plane: planeKey }))}`,
        layerId,
        bounds,
        plane,
        footprint: footprint.map((p) => ({ ...p })),
        neighbors: []
    };
}

export function surfaceHeight(surface: SurfaceIdentity, x: number, z: number): number {
    const [nx, ny, nz, d] = surface.plane;
    return -(nx * x + nz * z + d) / ny;
}

export function containsSurfaceXZ(surface: SurfaceIdentity, x: number, z: number): boolean {
    let inside = false;
    const p = surface.footprint;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
        const a = p[i],
            b = p[j];
        const cross = (x - a.x) * (b.z - a.z) - (z - a.z) * (b.x - a.x);
        if (
            Math.abs(cross) < 1e-7 &&
            x >= Math.min(a.x, b.x) - 1e-7 &&
            x <= Math.max(a.x, b.x) + 1e-7 &&
            z >= Math.min(a.z, b.z) - 1e-7 &&
            z <= Math.max(a.z, b.z) + 1e-7
        )
            return true;
        if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
    }
    return inside;
}

/** Ambiguous overlapping surfaces stay unresolved; a previous layer cannot silently switch. */
export function resolveSurfaceAt(
    point: SurfacePoint,
    surfaces: SurfaceIdentity[],
    tolerance = 0.28,
    previousLayer?: LayerId,
    previousSurfaceId?: SurfaceIdentityId
): SurfaceIdentity | null {
    const previous = surfaces.find((s) => s.id === previousSurfaceId);
    const found = surfaces.filter(
        (s) =>
            (!previousLayer || s.layerId === previousLayer || previous?.neighbors.includes(s.id)) &&
            containsSurfaceXZ(s, point.x, point.z) &&
            Math.abs(surfaceHeight(s, point.x, point.z) - point.y) <= tolerance
    );
    found.sort(
        (a, b) =>
            Math.abs(surfaceHeight(a, point.x, point.z) - point.y) -
            Math.abs(surfaceHeight(b, point.x, point.z) - point.y)
    );
    if (
        found.length > 1 &&
        found[0].layerId !== found[1].layerId &&
        Math.abs(surfaceHeight(found[0], point.x, point.z) - surfaceHeight(found[1], point.x, point.z)) < tolerance
    )
        return null;
    return found[0] ?? null;
}

function onBoundary(surface: SurfaceIdentity, point: SurfacePoint, tolerance = 0.001): boolean {
    const p = surface.footprint;
    return p.some((a, i) => {
        const b = p[(i + 1) % p.length],
            dx = b.x - a.x,
            dz = b.z - a.z,
            len = dx * dx + dz * dz;
        if (len < 1e-12) return false;
        const t = ((point.x - a.x) * dx + (point.z - a.z) * dz) / len;
        if (t < 0 || t > 1) return false;
        return Math.hypot(point.x - a.x - t * dx, point.z - a.z - t * dz) <= tolerance;
    });
}

/** Only verified edge contacts may link floors; XY overlap does not establish a stair connection. */
export function linkSurfaceContact(
    a: SurfaceIdentity,
    b: SurfaceIdentity,
    contact: SurfacePoint,
    verifiedSupport: boolean,
    maxClimb = 0.24
): boolean {
    const ah = surfaceHeight(a, contact.x, contact.z),
        bh = surfaceHeight(b, contact.x, contact.z);
    if (
        !verifiedSupport ||
        a.id === b.id ||
        ![contact.x, contact.y, contact.z, maxClimb].every(Number.isFinite) ||
        maxClimb < 0 ||
        !containsSurfaceXZ(a, contact.x, contact.z) ||
        !containsSurfaceXZ(b, contact.x, contact.z) ||
        !onBoundary(a, contact) ||
        !onBoundary(b, contact) ||
        Math.min(Math.abs(contact.y - ah), Math.abs(contact.y - bh)) > 0.28 ||
        Math.abs(ah - bh) > maxClimb + 1e-6
    )
        return false;
    if (!a.neighbors.includes(b.id)) a.neighbors.push(b.id);
    if (!b.neighbors.includes(a.id)) b.neighbors.push(a.id);
    return true;
}

/** Runtime layers are explicit reviewed identities. Ground-analysis height buckets
 * above remain candidate identifiers and are never promoted into this catalog. */
export type CatalogSurface = Omit<SurfaceIdentity, 'layerId' | 'neighbors'> &
    ({ kind: 'floor'; layerId: LayerId } | { kind: 'transition'; connects: [LayerId, LayerId] });
export type SurfaceCatalog = {
    version: 1;
    status: 'confirmed';
    sceneId: string;
    collisionFingerprint: string;
    layers: { id: LayerId; label: string }[];
    surfaces: CatalogSurface[];
    contacts: {
        a: SurfaceIdentityId;
        b: SurfaceIdentityId;
        /** The verified traversable portion of a real shared edge. A point-only
         * observation must use start === end, never imply the full edge width. */
        portal: { start: SurfacePoint; end: SurfacePoint };
        /** Each evidence reference must cover this portal range in its direction. */
        forward: string;
        reverse: string;
    }[];
    /** Optional reviewed annotation bindings; indices refer to the unfiltered source. */
    destinations?: { index: number; surfaceId: SurfaceIdentityId }[];
};
export type SupportAssociation = {
    catalog: string;
    collisionFingerprint: string;
    tick: number;
    epoch: number;
    surfaceId: SurfaceIdentityId | null;
    layerId: LayerId | null;
    status: 'confirmed' | 'transition' | 'unknown' | 'ambiguous';
};
export type SurfaceSpan = {
    surfaceId: SurfaceIdentityId;
    layerId?: LayerId;
    transition?: [LayerId, LayerId];
    start: number;
    end: number;
};
const geometry = (s: CatalogSurface): SurfaceIdentity => ({ ...s, layerId: '', neighbors: [] });
const distance = (a: SurfacePoint, b: SurfacePoint) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const lerp = (a: SurfacePoint, b: SurfacePoint, t: number): SurfacePoint => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t
});

export class SurfaceCatalogIndex {
    readonly catalog: SurfaceCatalog;
    readonly fingerprint: string;
    readonly surfaces: Map<string, CatalogSurface>;
    constructor(value: SurfaceCatalog, collisionFingerprint: string) {
        // Own a snapshot: later UI/worker mutations cannot silently change the binding.
        const c = structuredClone(value);
        if (
            !c ||
            c.version !== 1 ||
            c.status !== 'confirmed' ||
            !c.sceneId ||
            !collisionFingerprint ||
            c.collisionFingerprint !== collisionFingerprint ||
            !Array.isArray(c.layers) ||
            !c.layers.length ||
            !Array.isArray(c.surfaces) ||
            !c.surfaces.length ||
            !Array.isArray(c.contacts)
        )
            throw Error('Unconfirmed or stale surface catalog');
        const layers = new Set<string>();
        for (const l of c.layers) {
            if (!l.id || !l.label || layers.has(l.id)) throw Error('Invalid catalog layer identity');
            layers.add(l.id);
        }
        this.surfaces = new Map();
        for (const s of c.surfaces) {
            if (
                !s.id ||
                this.surfaces.has(s.id) ||
                !Array.isArray(s.footprint) ||
                s.footprint.length < 3 ||
                !s.footprint.every((p) => [p.x, p.y, p.z].every(Number.isFinite)) ||
                !Array.isArray(s.plane) ||
                s.plane.length !== 4 ||
                !s.plane.every(Number.isFinite) ||
                Math.abs(s.plane[1]) < 0.1 ||
                (s.kind === 'floor'
                    ? !layers.has(s.layerId)
                    : s.kind !== 'transition' ||
                      !Array.isArray(s.connects) ||
                      s.connects.length !== 2 ||
                      s.connects[0] === s.connects[1] ||
                      !s.connects.every((id) => layers.has(id)))
            )
                throw Error('Invalid catalog surface');
            const normalized = surfaceIdentity('catalog-validation', 0, s.footprint, s.plane);
            s.plane = normalized.plane;
            s.bounds = normalized.bounds;
            const turns = s.footprint
                .map((a, i, p) => {
                    const b = p[(i + 1) % p.length],
                        c = p[(i + 2) % p.length];
                    return (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
                })
                .filter((v) => Math.abs(v) > 1e-10);
            if (!turns.length || turns.some((v) => Math.sign(v) !== Math.sign(turns[0])))
                throw Error('Catalog surfaces must have convex, nonempty footprints');
            if (s.footprint.some((p) => Math.abs(surfaceHeight(geometry(s), p.x, p.z) - p.y) > 0.01))
                throw Error('Catalog footprint is not on its supporting plane');
            this.surfaces.set(s.id, s);
        }
        for (const edge of c.contacts) {
            const a = this.surfaces.get(edge.a),
                b = this.surfaces.get(edge.b);
            if (
                !a ||
                !b ||
                typeof edge.forward !== 'string' ||
                !edge.forward.trim() ||
                typeof edge.reverse !== 'string' ||
                !edge.reverse.trim() ||
                !edge.portal?.start ||
                !edge.portal?.end ||
                ![edge.portal.start, edge.portal.end, lerp(edge.portal.start, edge.portal.end, 0.5)].every((point) =>
                    linkSurfaceContact(geometry(a), geometry(b), point, true)
                )
            )
                throw Error('Catalog contact lacks bidirectional support evidence or valid geometry');
            if (a.kind === 'floor' && b.kind === 'floor' && a.layerId !== b.layerId)
                throw Error('Cross-layer contact requires an explicit transition surface');
            for (const [floor, transition] of [
                [a, b],
                [b, a]
            ]) {
                if (
                    floor.kind === 'floor' &&
                    transition.kind === 'transition' &&
                    !transition.connects.includes(floor.layerId)
                )
                    throw Error('Transition layer mismatch');
                if (
                    floor.kind === 'transition' &&
                    transition.kind === 'transition' &&
                    !floor.connects.every((id) => transition.connects.includes(id))
                )
                    throw Error('Transition chain mismatch');
            }
        }
        // Every connected transition chain must reach its two explicit floor endpoints.
        const visited = new Set<string>();
        for (const surface of c.surfaces.filter((s) => s.kind === 'transition')) {
            if (visited.has(surface.id) || surface.kind !== 'transition') continue;
            const queue = [surface.id],
                endpoints = new Set<string>();
            while (queue.length) {
                const id = queue.pop()!;
                if (visited.has(id)) continue;
                visited.add(id);
                for (const e of c.contacts.filter((e) => e.a === id || e.b === id)) {
                    const neighbor = this.surfaces.get(e.a === id ? e.b : e.a)!;
                    if (neighbor.kind === 'floor') endpoints.add(neighbor.layerId);
                    else queue.push(neighbor.id);
                }
            }
            if (!surface.connects.every((id) => endpoints.has(id)))
                throw Error('Transition endpoints are not confirmed');
        }
        const destinations = new Set<number>();
        for (const d of c.destinations ?? []) {
            if (
                !Number.isSafeInteger(d.index) ||
                d.index < 0 ||
                destinations.has(d.index) ||
                this.surfaces.get(d.surfaceId)?.kind !== 'floor'
            )
                throw Error('Invalid catalog destination');
            destinations.add(d.index);
        }
        this.catalog = c;
        this.fingerprint = `${c.sceneId}:${hash(JSON.stringify(c))}`;
    }
    at(point: SurfacePoint, tolerance = 0.28): CatalogSurface[] {
        return [...this.surfaces.values()].filter(
            (s) =>
                containsSurfaceXZ(geometry(s), point.x, point.z) &&
                Math.abs(surfaceHeight(geometry(s), point.x, point.z) - point.y) <= tolerance
        );
    }
    unique(point: SurfacePoint): CatalogSurface | null {
        const found = this.at(point).sort(
            (a, b) =>
                Math.abs(surfaceHeight(geometry(a), point.x, point.z) - point.y) -
                Math.abs(surfaceHeight(geometry(b), point.x, point.z) - point.y)
        );
        if (
            found.length > 1 &&
            Math.abs(
                surfaceHeight(geometry(found[0]), point.x, point.z) -
                    surfaceHeight(geometry(found[1]), point.x, point.z)
            ) < 0.28
        )
            return null;
        return found[0] ?? null;
    }
    linked(a: string, b: string, point: SurfacePoint): boolean {
        return (
            a === b ||
            this.catalog.contacts.some((e) => {
                if (!((e.a === a && e.b === b) || (e.a === b && e.b === a))) return false;
                const { start, end } = e.portal,
                    dx = end.x - start.x,
                    dz = end.z - start.z,
                    length2 = dx * dx + dz * dz;
                const t = length2
                    ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / length2))
                    : 0;
                const contact = lerp(start, end, t);
                // Numerical tolerance only; the actual corridor width is the reviewed portal.
                return (
                    Math.hypot(contact.x - point.x, contact.z - point.z) <= 0.001 &&
                    Math.abs(contact.y - point.y) <= 0.28
                );
            })
        );
    }
    destination(index: number): CatalogSurface | undefined {
        const id = this.catalog.destinations?.find((d) => d.index === index)?.surfaceId;
        return id ? this.surfaces.get(id) : undefined;
    }
    clip(vertices: SurfacePoint[], surfaceId: string): SurfacePoint[] {
        const s = this.surfaces.get(surfaceId);
        if (!s) return [];
        let result = vertices.map((p) => ({ ...p }));
        const area = s.footprint.reduce(
            (v, p, i, a) => v + p.x * a[(i + 1) % a.length].z - a[(i + 1) % a.length].x * p.z,
            0
        );
        for (let i = 0; i < s.footprint.length; i++) {
            const a = s.footprint[i],
                b = s.footprint[(i + 1) % s.footprint.length],
                input = result;
            result = [];
            const side = (p: SurfacePoint) => Math.sign(area) * ((b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x));
            for (let j = 0; j < input.length; j++) {
                const p = input[j],
                    q = input[(j + 1) % input.length],
                    dp = side(p),
                    dq = side(q);
                if (dp >= -1e-8) result.push(p);
                if (dp >= 0 !== dq >= 0) result.push(lerp(p, q, dp / (dp - dq)));
            }
        }
        return result.map((p) => ({ ...p, y: surfaceHeight(geometry(s), p.x, p.z) }));
    }
    /** Split at source footprint/height boundaries, then rebuild every occurrence.
     * Caller must use these returned points: spans never refer to old path indices. */
    route(points: SurfacePoint[]): { points: SurfacePoint[]; surfaces: SurfaceSpan[]; catalog: string } {
        if (!points.length) throw Error('Empty catalog route');
        const out = [{ ...points[0] }],
            spans: SurfaceSpan[] = [];
        for (let i = 1; i < points.length; i++) {
            const a = points[i - 1],
                b = points[i];
            if (distance(a, b) < 1e-8) continue;
            const cuts = [0, 1],
                dx = b.x - a.x,
                dz = b.z - a.z;
            for (const s of this.surfaces.values()) {
                for (let k = 0; k < s.footprint.length; k++) {
                    const p = s.footprint[k],
                        q = s.footprint[(k + 1) % s.footprint.length];
                    const ex = q.x - p.x,
                        ez = q.z - p.z,
                        den = dx * ez - dz * ex;
                    if (Math.abs(den) < 1e-10) continue;
                    const t = ((p.x - a.x) * ez - (p.z - a.z) * ex) / den;
                    const u = ((p.x - a.x) * dz - (p.z - a.z) * dx) / den;
                    if (t > 1e-8 && t < 1 - 1e-8 && u >= -1e-8 && u <= 1 + 1e-8) cuts.push(t);
                }
                const da = a.y - surfaceHeight(geometry(s), a.x, a.z),
                    db = b.y - surfaceHeight(geometry(s), b.x, b.z);
                if (Math.abs(db - da) > 1e-10)
                    for (const limit of [-0.28, 0.28]) {
                        const t = (limit - da) / (db - da);
                        if (t > 1e-8 && t < 1 - 1e-8) cuts.push(t);
                    }
            }
            const sorted = cuts.sort((x, y) => x - y).filter((t, j, v) => j === 0 || t - v[j - 1] > 1e-8);
            for (let j = 1; j < sorted.length; j++) {
                const s = this.unique(lerp(a, b, (sorted[j - 1] + sorted[j]) / 2));
                if (!s) throw Error('Route crosses unknown or ambiguous supporting surface');
                const prior = spans.at(-1),
                    start = out.length - 1;
                if (prior && !this.linked(prior.surfaceId, s.id, out[start]))
                    throw Error('Route crosses an unverified surface contact');
                out.push(lerp(a, b, sorted[j]));
                if (prior?.surfaceId === s.id) prior.end = out.length - 1;
                else
                    spans.push({
                        surfaceId: s.id,
                        ...(s.kind === 'floor' ? { layerId: s.layerId } : { transition: s.connects }),
                        start,
                        end: out.length - 1
                    });
            }
        }
        if (out.length === 1 && !this.unique(out[0])) throw Error('Unknown route endpoint');
        return { points: out, surfaces: spans, catalog: this.fingerprint };
    }
}

/** Consumes accepted native ticks; it never writes the controller or camera. */
export class SupportTracker {
    private previous: SupportAssociation | null = null;
    private point: SurfacePoint | null = null;
    private sampled: SupportAssociation | null = null;
    constructor(readonly index: SurfaceCatalogIndex) {}
    sample(s: WalkPhysicsState): SupportAssociation {
        if (this.sampled?.tick === s.tick && this.sampled.epoch === s.epoch) return this.sampled;
        this.sampled = this.resolve(s);
        return this.sampled;
    }
    private resolve(s: WalkPhysicsState): SupportAssociation {
        const result: SupportAssociation = {
            catalog: this.index.fingerprint,
            collisionFingerprint: this.index.catalog.collisionFingerprint,
            tick: s.tick,
            epoch: s.epoch,
            surfaceId: null,
            layerId: null,
            status: 'unknown'
        };
        if (this.previous?.epoch !== s.epoch) {
            this.previous = null;
            this.point = null;
        }
        if (
            s.collision !== 'active' ||
            !s.grounded ||
            s.jumping ||
            s.supportHeight === null ||
            ![s.position.x, s.position.z, s.supportHeight].every(Number.isFinite)
        ) {
            // Native jumps/airborne or held collision end the walking contact chain.
            // A unique real landing may reacquire support; no jump trajectory is
            // required to lie along the ground's walking portals.
            this.previous = null;
            this.point = null;
            return result;
        }
        const point = { ...s.position, y: s.supportHeight },
            found = this.index.at(point);
        let surface = this.index.unique(point);
        // Shared boundary belongs to the previous surface until the next unambiguous tick.
        if (!surface && this.previous?.surfaceId)
            surface = found.find((v) => v.id === this.previous!.surfaceId) ?? null;
        if (!surface) {
            result.status = found.length ? 'ambiguous' : 'unknown';
            return result;
        }
        if (this.previous?.surfaceId && this.point && this.previous.surfaceId !== surface.id) {
            try {
                const path = this.index.route([this.point, point]);
                const first = path.surfaces[0],
                    last = path.surfaces.at(-1);
                if (first && !this.index.linked(this.previous.surfaceId, first.surfaceId, this.point)) return result;
                if (last && !this.index.linked(last.surfaceId, surface.id, point)) return result;
            } catch {
                return result;
            }
        }
        result.surfaceId = surface.id;
        result.status = surface.kind === 'floor' ? 'confirmed' : 'transition';
        result.layerId =
            surface.kind === 'floor'
                ? surface.layerId
                : this.previous?.layerId && surface.connects.includes(this.previous.layerId)
                  ? this.previous.layerId
                  : null;
        this.previous = result;
        this.point = point;
        return result;
    }
}
