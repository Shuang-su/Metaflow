/** Geometry identities survive Detour rebuilds; poly refs remain query-local. */
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
