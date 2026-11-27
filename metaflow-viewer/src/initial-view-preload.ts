/** Opening-view barrier. Coarse readiness can only open the target-detail phase;
 * never reuse that same readiness notification as evidence for the new LOD selection. */
export class InitialViewGate {
    phase: 'coarse' | 'detail' | 'submitted' = 'coarse';
    private openedAt = -1;
    private stableAt = -1;
    beginDetail(frame: number) {
        this.phase = 'detail';
        this.openedAt = frame;
    }
    sample({ frame, ready, pending, started }: { frame: number; ready: boolean; pending: number; started: boolean }) {
        if (this.phase === 'submitted') return 'wait';
        if (this.phase === 'coarse') {
            if (!started || !ready || pending !== 0) return 'wait';
            this.beginDetail(frame);
            return 'open-detail';
        }
        if (!started || frame < this.openedAt + 2 || !ready || pending !== 0) {
            this.stableAt = -1;
            return 'wait';
        }
        if (this.stableAt < 0) this.stableAt = frame;
        if (frame <= this.stableAt) return 'wait';
        this.phase = 'submitted';
        return 'reveal';
    }
}

// 2.24.2 separates current placements from the priority queue for a finer cut.
// Tier zero is speculative prefetch. Tiers one and two replace or add visible geometry.
type ViewWorld = {
    _octreeInstances: Map<
        unknown,
        {
            needsLodUpdate: boolean;
            pending: Set<number>;
            filePlacements: ({ resource: unknown } | null)[];
            _fileRequests?: Map<number, number>;
            octree: { files: { url: string }[]; assetLoader: { _failed?: Set<string> } };
        }
    >;
};

export function openingWork(world: ViewWorld | undefined) {
    let pending = 0,
        resident = 0;
    let failed: string | undefined;
    for (const inst of world?._octreeInstances.values() ?? []) {
        pending += Number(inst.needsLodUpdate);
        resident += inst.filePlacements.filter((p) => p?.resource).length;
        const required = new Set(inst.pending);
        for (const [index, priority] of inst._fileRequests ?? []) {
            if (priority >= 1) required.add(index);
        }
        pending += required.size;
        for (const i of required) {
            const url = inst.octree.files[i]?.url;
            if (inst.octree.assetLoader?._failed?.has(url)) failed = url;
        }
    }
    return { available: Boolean(world?._octreeInstances.size), pending, resident, failed };
}
