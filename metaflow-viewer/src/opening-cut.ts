// PlayCanvas 2.24 exposes the solved, budget-constrained cut on each instance.
// Read it after the native solver: distance bands include camera, FOV and behind-camera penalty.
export type OpeningTree = {
    lodLevels: number;
    files: { url: string; lodLevel: number }[];
    nodes: { lods: { fileIndex: number; count: number }[] }[];
    parentIndex: Int32Array;
    childStart: Int32Array;
    childCount: Int32Array;
    nodeLevel: Int32Array;
    pollFileResource(index: number): boolean;
    fileResources: Map<number, unknown>;
    submitRequests(instance: CutInstance, requests: Map<number, number>): void;
    assetLoader?: { _failed?: Set<string> };
};
export type CutInstance = {
    octree: OpeningTree;
    prefetchPending?: Set<number>;
    needsLodUpdate?: boolean;
    treeStamp: number;
    treeRefined: Uint32Array;
    nodeInfos: { worldDistanceSq: number }[];
};
export function targetCut(inst: CutInstance): Map<number, number> {
    const targets = new Map<number, number>();
    const tree = inst.octree;
    if (!inst.treeRefined || !inst.treeStamp) return targets;
    const visit = (n: number) => {
        if (inst.treeRefined[n] === inst.treeStamp && tree.childCount[n]) {
            const end = tree.childStart[n] + tree.childCount[n];
            for (let c = tree.childStart[n]; c < end; c++) visit(c);
        } else {
            const index = tree.nodes[n].lods[tree.nodeLevel[n]].fileIndex;
            if (index < 0) return;
            const priority = 2 + 1 / (1 + Math.max(0, inst.nodeInfos[n].worldDistanceSq));
            targets.set(index, Math.max(priority, targets.get(index) || 0));
        }
    };
    for (let n = 0; n < tree.nodes.length && tree.parentIndex[n] < 0; n++) visit(n);
    return targets;
}

export function measuredLink(entries: PerformanceResourceTiming[], since: number) {
    const downloads = entries.filter(
        (e) =>
            e.startTime >= since &&
            e.transferSize > 0 &&
            e.encodedBodySize >= 8192 &&
            e.responseEnd > e.responseStart &&
            e.responseStart > 0
    );
    if (!downloads.length) return 0;
    // Union of active transfer intervals avoids counting overlapping requests as serial.
    downloads.sort((a, b) => a.responseStart - b.responseStart);
    let end = 0,
        ms = 0,
        bytes = 0;
    for (const d of downloads) {
        ms += Math.max(0, d.responseEnd - Math.max(end, d.responseStart));
        end = Math.max(end, d.responseEnd);
        bytes += d.encodedBodySize;
    }
    return ms >= 20 ? (bytes * 1000) / ms : 0;
}

export function installTargetRequests(
    tree: OpeningTree,
    sizes: (i: number) => number,
    rate: number,
    trial: boolean,
    report: (strategy: string, forecast: { saved: number; total: number; rate: number }) => void
) {
    const original = tree.submitRequests;
    let enabled: boolean;
    let awaitingAdoption = false;
    const submit: OpeningTree['submitRequests'] = function (inst, native) {
        const targets = targetCut(inst);
        if (!targets.size) return original.call(tree, inst, native);
        if (enabled === undefined) {
            let saved = 0,
                total = 0,
                known = true;
            for (const i of targets.keys()) {
                const bytes = sizes(i);
                known &&= bytes > 0;
                total += bytes;
            }
            // Coarse-first also refines through intermediate parents. A packed root file may
            // still be part of the final mixed cut because another distant node shares it.
            const ancestors = new Set<number>();
            for (let n = 0; n < tree.nodes.length; n++) {
                if (inst.treeRefined[n] !== inst.treeStamp) continue;
                const i = tree.nodes[n].lods[tree.nodeLevel[n]].fileIndex;
                if (i >= 0 && !targets.has(i) && !tree.fileResources?.has(i)) ancestors.add(i);
            }
            for (const i of ancestors) saved += sizes(i);
            // Avoid a direct burst when it saves little wire time or has an excessive decode working set.
            enabled = trial || (known && rate > 0 && saved / rate > 0.35 && total < 96e6 && saved > total * 0.04);
            report(enabled ? 'target' : 'native', { saved, total, rate });
        }
        if (!enabled) return original.call(tree, inst, native);
        const missing = new Map<number, number>();
        for (const [i, priority] of targets) if (!tree.pollFileResource(i)) missing.set(i, priority);
        // Native placement owns residency and release. Once target files are resident it can
        // atomically adopt them. Native fallback remains available on the normal error path.
        if (missing.size || awaitingAdoption) {
            // The instance uses this set to poll arrivals and trigger the next LOD solve.
            // Keep failure detection and engine loadingCount on the exact same request set.
            native.clear();
            inst.prefetchPending?.clear();
            for (const [index, priority] of missing) {
                native.set(index, priority);
                inst.prefetchPending?.add(index);
            }
            if (!missing.size) inst.needsLodUpdate = true;
            awaitingAdoption = missing.size > 0;
        }
        original.call(tree, inst, native);
    };
    tree.submitRequests = submit;
    return () => {
        if (tree.submitRequests === submit) tree.submitRequests = original;
    };
}
