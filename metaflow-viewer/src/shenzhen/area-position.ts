import type { ViewerHandle } from '../types';

type Ring = [number, number][];
type Area = {
    id: string;
    name: string;
    floorId: string;
    kind: string;
    viewerRings: Ring[];
    selectionPriority: number;
    supportYRangeViewer: [number, number] | null;
    labelIds: string[];
    surfaceYViewer: number | null;
};
export type VenueAreas = {
    areas: Area[];
    floors: { id: string; label: string }[];
    legacyAnnotations: {
        id: string;
        title: string;
        text: string;
        catalogCode: string;
        catalogTitle: string;
        catalogTitleEn: string;
        positionViewer: [number, number, number];
        camera: { position: [number, number, number]; target: [number, number, number]; fov: number };
    }[];
};

function inside(x: number, z: number, ring: Ring) {
    let result = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [ax, az] = ring[i];
        const [bx, bz] = ring[j];
        if (az > z !== bz > z && x < ax + ((bx - ax) * (z - az)) / (bz - az)) result = !result;
    }
    return result;
}

export function makeAreaLookup(data: VenueAreas) {
    // Two landings have measured elevated contacts in the native collision mesh.
    const landingHeights: Record<string, [number, number]> = { CL096: [2.84, 3.89], CL101: [2.85, 4.9] };
    const landings = data.areas
        .filter((a) => a.id in landingHeights)
        .map<Area>((a) => {
            const [low, high] = landingHeights[a.id];
            const offset = (a.surfaceYViewer ?? 0) + 0.055;
            return {
                ...a,
                id: a.id + '-landing',
                name: '楼梯及夹层平台',
                floorId: 'hall2-landing',
                supportYRangeViewer: [low + offset, high + offset] as [number, number],
                selectionPriority: 120,
                labelIds: []
            };
        });
    // Unnamed CAD hypotheses have no visitor-facing room name. Use the enclosing public area.
    const named = data.areas.filter((a) => !/候选|未确认|待核|未命名|闭合假设/.test(a.name));
    const regions = [...landings, ...named]
        .map((area) => {
            const ring = area.viewerRings[0];
            const xs = ring.map((p) => p[0]);
            const zs = ring.map((p) => p[1]);
            const extent = [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
            return { area, extent, size: (extent[2] - extent[0]) * (extent[3] - extent[1]) };
        })
        .sort((a, b) => b.area.selectionPriority - a.area.selectionPriority || a.size - b.size);
    return (x: number, y: number, z: number, walkingFloor: number | null) => {
        for (const { area, extent } of regions) {
            if (x < extent[0] || z < extent[1] || x > extent[2] || z > extent[3]) continue;
            const heights = area.supportYRangeViewer;
            if (heights && area.kind !== 'hall') {
                const floor = walkingFloor ?? y;
                const headroom = walkingFloor === null ? 3.6 : 0.5;
                if (floor < heights[0] - 0.5 || floor > heights[1] + headroom) continue;
            }
            if (inside(x, z, area.viewerRings[0]) && !area.viewerRings.slice(1).some((r) => inside(x, z, r)))
                return area;
        }
        return null;
    };
}

function nearBoundary(x: number, z: number, area: Area) {
    return area.viewerRings.some((ring) =>
        ring.some(([ax, az], i) => {
            const [bx, bz] = ring[(i + 1) % ring.length];
            const dx = bx - ax;
            const dz = bz - az;
            const fraction = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
            return Math.hypot(x - ax - fraction * dx, z - az - fraction * dz) < 0.15;
        })
    );
}

export function attachAreaPosition(viewer: ViewerHandle, data: VenueAreas) {
    const camera = viewer.app.root.findComponents('camera')[0].entity;
    const lookup = makeAreaLookup(data);
    const labels = new Map(data.legacyAnnotations.map((mark, i) => [mark.id, i]));
    const floors = new Map(data.floors.map((f) => [f.id, f.label]));
    floors.set('hall2-landing', '2号馆夹层');
    let active: Area | null = null;
    let pending: Area | null = null;
    let duration = 0;
    let elapsed = 0;
    let initialized = false;
    function tick(dt: number) {
        elapsed += dt;
        if (elapsed < 0.1) return;
        const { x, y, z } = camera.getPosition();
        let area = lookup(x, y, z, viewer.state.cameraMode === 'walk' ? viewer.walkSupportHeight : null);
        if (active && area && active !== area && active.floorId === area.floorId && nearBoundary(x, z, active))
            area = active;
        duration = area === pending ? duration + elapsed : 0;
        pending = area;
        elapsed = 0;
        if (initialized && (active === area || duration < 0.35)) return;
        initialized = true;
        active = area;
        viewer.events.fire('ui:locationLabel', {
            title: area?.name ?? '场馆外围',
            index:
                area && !['hall', 'corridor', 'exterior'].includes(area.kind)
                    ? (area.labelIds.map((id) => labels.get(id)).find((i) => i !== undefined) ?? null)
                    : null
        });
    }
    viewer.app.on('update', tick);
    return {
        floorLabel: () => floors.get(active?.floorId ?? '') ?? '场馆外围',
        destroy: () => viewer.app.off('update', tick)
    };
}
