import type { Asset, AssetRegistry } from 'playcanvas';

type Chunk = {
    size: number;
    points: number;
    received: number;
    reportedTotal: number;
    parts: Map<string, number>;
    ready: boolean;
};
export type OpeningSnapshot = {
    bytes: number;
    total: number;
    estimated: boolean;
    rate: number | null;
    fraction: number;
    readyFraction: number;
};

export class OpeningBytes {
    private chunks = new Map<string, Chunk>();
    private required = new Set<string>();
    private samples: { time: number; bytes: number }[] = [];
    private networkBytes = 0;
    // Keep credit for useful intermediate levels after they leave the active cut.
    private completed = new Map<string, number>();

    constructor(files: { url: string; size?: number; points?: number }[]) {
        for (const file of files) {
            this.chunks.set(file.url, {
                size: file.size > 0 ? file.size : 0,
                points: file.points || 1,
                received: 0,
                reportedTotal: 0,
                parts: new Map(),
                ready: false
            });
        }
    }
    select(urls: Iterable<string>) {
        for (const url of this.required) {
            const c = this.chunks.get(url);
            if (c?.ready) this.remember(url, c);
        }
        this.required = new Set(urls);
    }
    private remember(url: string, c: Chunk) {
        const finished = [...c.parts.values()].reduce((sum, part) => sum + part, 0);
        const bytes = Math.max(c.size, finished, c.received);
        if (bytes) this.completed.set(url, bytes);
    }
    start(url: string) {
        const c = this.chunks.get(url);
        if (!c) return;
        if (c.ready && this.required.has(url)) this.remember(url, c);
        c.received = c.reportedTotal = 0;
        c.parts.clear();
        c.ready = false;
    }
    progress(url: string, bytes: number, total: number) {
        const c = this.chunks.get(url);
        if (!c || !Number.isFinite(bytes) || bytes < 0) return;
        c.received = Math.max(c.received, bytes);
        if (Number.isFinite(total) && total > 0) c.reportedTotal = total;
    }
    resource(url: string, part: string, bytes: number, wireBytes: number) {
        const c = this.chunks.get(url);
        if (!c || !Number.isFinite(bytes) || bytes <= 0) return;
        if (wireBytes > 0 && this.required.has(url)) this.networkBytes += Math.min(bytes, wireBytes);
        c.parts.set(part, bytes);
    }
    complete(url: string) {
        const c = this.chunks.get(url);
        if (c) c.ready = true;
    }
    snapshot(now: number): OpeningSnapshot {
        let bytes = 0,
            total = 0,
            readyBytes = 0,
            knownBytes = 0,
            knownPoints = 0,
            unknownPoints = 0,
            unknownReady = 0;
        let estimated = false;
        for (const [url, credit] of this.completed) {
            if (this.required.has(url)) continue;
            total += credit;
            bytes += credit;
            readyBytes += credit;
        }
        for (const url of this.required) {
            const c = this.chunks.get(url);
            if (!c) continue;
            let finished = 0;
            for (const part of c.parts.values()) finished += part;
            const received = Math.max(finished, c.received);
            const measured = c.size || (c.ready && received) || c.reportedTotal;
            estimated ||= !c.size;
            if (measured > 0) {
                const expected = Math.max(received, measured);
                total += expected;
                knownBytes += expected;
                knownPoints += c.points;
                bytes += c.ready ? expected : received;
                if (c.ready) readyBytes += expected;
            } else {
                bytes += received;
                unknownPoints += c.points;
                if (c.ready) unknownReady += c.points;
            }
        }
        // Old packages have no size index. Scale observed bytes by the manifest's splat counts.
        const scale = knownPoints ? knownBytes / knownPoints : 0;
        total += unknownPoints * scale;
        readyBytes += unknownReady * scale;
        if (!this.samples.length || now - this.samples.at(-1).time >= 200)
            this.samples.push({ time: now, bytes: this.networkBytes });
        while (this.samples.length > 1 && this.samples[1].time < now - 4000) this.samples.shift();
        const first = this.samples[0];
        const rate = now - first.time >= 500 ? ((this.networkBytes - first.bytes) * 1000) / (now - first.time) : null;
        return {
            bytes,
            total: total ? Math.max(bytes, total) : 0,
            estimated,
            rate,
            fraction: total ? Math.min(1, bytes / total) : unknownPoints ? unknownReady / unknownPoints : 0,
            readyFraction: total ? Math.min(1, readyBytes / total) : unknownPoints ? unknownReady / unknownPoints : 0
        };
    }
}

export function observeOpeningBytes(
    registry: AssetRegistry,
    files: { url: string; size?: number; points?: number }[],
    base: string,
    wake?: () => void,
    since = performance.now()
) {
    const normalize = (url: string) => new URL(url, base).href;
    const names = new Set(files.map((f) => normalize(f.url)));
    const loose = new Map(
        [...names]
            .filter((url) => new URL(url).pathname.endsWith('/meta.json'))
            .map((url) => [new URL('.', url).href, url])
    );
    const model = new OpeningBytes(files.map((f) => ({ ...f, url: normalize(f.url) })));
    const bound = new Map<Asset, () => void>();
    const fileUrl = (asset: Asset) => (asset.file as { url?: string } | null)?.url;
    const bind = (asset: Asset) => {
        if (!fileUrl(asset) || bound.has(asset)) return;
        const url = normalize(fileUrl(asset));
        if (!names.has(url)) return;
        const received = (bytes: number, total: number) => model.progress(url, bytes, total);
        const done = () => {
            model.complete(url);
            wake?.();
        };
        const reset = () => model.start(url);
        if (asset.loaded) model.complete(url);
        asset.on('progress', received);
        asset.on('load', done);
        asset.on('error', reset);
        bound.set(asset, () => {
            asset.off('progress', received);
            asset.off('load', done);
            asset.off('error', reset);
        });
    };
    const start = (asset: Asset) => {
        bind(asset);
        if (bound.has(asset)) model.start(normalize(fileUrl(asset)));
    };
    const remove = (asset: Asset) => {
        if (bound.has(asset)) {
            model.start(normalize(fileUrl(asset)));
            bound.get(asset)();
            bound.delete(asset);
        }
    };
    registry.list().forEach(bind);
    registry.on('add', bind);
    registry.on('load:start', start);
    registry.on('remove', remove);
    const timing =
        typeof PerformanceObserver !== 'undefined'
            ? new PerformanceObserver((list) => {
                  for (const entry of list.getEntries() as PerformanceResourceTiming[]) {
                      if (entry.startTime < since) continue;
                      const url = new URL(entry.name);
                      const owner = names.has(url.href)
                          ? url.href
                          : url.pathname.endsWith('.webp') && loose.get(new URL('.', url).href);
                      if (owner && !(entry.responseStatus >= 400))
                          model.resource(owner, url.href, entry.encodedBodySize, Math.max(0, entry.transferSize - 300));
                  }
              })
            : null;
    try {
        timing?.observe({ type: 'resource', buffered: true });
    } catch {
        timing?.disconnect();
    }
    return {
        sample(urls: Iterable<string>, now: number) {
            model.select(Array.from(urls, normalize));
            return model.snapshot(now);
        },
        stop() {
            timing?.disconnect();
            registry.off('add', bind);
            registry.off('load:start', start);
            registry.off('remove', remove);
            bound.forEach((dispose) => dispose());
            bound.clear();
        }
    };
}

/** Weight wire time against decoder work. The frame barrier owns the final 3%. */
export function openingFraction(s: OpeningSnapshot) {
    // A conservative working throughput for image decode/upload. Bound its weight on
    // unmeasured devices; bytes and actual resource readiness drive both terms.
    const wireWeight = s.rate && s.rate > 0 ? Math.max(0.7, Math.min(0.98, 100e6 / (100e6 + s.rate))) : 0.93;
    return wireWeight * s.fraction + (1 - wireWeight) * s.readyFraction;
}
