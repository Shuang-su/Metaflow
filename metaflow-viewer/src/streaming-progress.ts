import type { Asset, AssetRegistry } from 'playcanvas';

/** Initial LOD work: one unit per chunk, with byte progress inside each unit. */
class InitialLodProgress {
    private chunks = new Map<string, { fraction: number; complete: boolean }>();
    private total = 0;
    private displayed = 0;

    start(url: string) {
        this.chunks.set(url, { fraction: 0, complete: false });
    }

    received(url: string, received: number, total: number) {
        const chunk = this.chunks.get(url);
        if (!chunk || chunk.complete || !Number.isFinite(received) || !Number.isFinite(total) || total <= 0) return;
        // Bytes can finish before image decoding/GPU preparation. Only load marks a chunk done.
        chunk.fraction = Math.max(chunk.fraction, Math.min(0.99, Math.max(0, received / total)));
    }

    complete(url: string) {
        this.chunks.set(url, { fraction: 1, complete: true });
    }

    remove(url: string) {
        this.chunks.delete(url); // Cancellation is not a completed chunk.
    }

    frame(pending: number) {
        const completed = [...this.chunks.values()].filter((chunk) => chunk.complete).length;
        this.total = Math.max(this.total, completed + Math.max(0, pending));
    }

    percentage() {
        if (this.total === 0) return this.displayed; // Wait for the initial scheduled wave.
        const total = Math.max(this.total, this.chunks.size);
        const work = [...this.chunks.values()].reduce((sum, chunk) => sum + chunk.fraction, 0);
        if (total > 0) this.displayed = Math.max(this.displayed, Math.min(99, Math.floor((work / total) * 100)));
        return this.displayed;
    }
}

/** Observe this octree's assets; no duplicate downloads, body buffering, or UI dependency. */
function observeInitialLodProgress(
    registry: AssetRegistry,
    urls: string[],
    base: string,
    update: (value: number) => void
) {
    const normalize = (url: string) => new URL(url, base).href;
    const sources = new Set(urls.map(normalize));
    const model = new InitialLodProgress();
    const bound = new Map<Asset, () => void>();
    let stopped = false;
    const publish = () => {
        if (!stopped) update(model.percentage());
    };
    const bind = (asset: Asset) => {
        const file = (asset.file as { url?: string })?.url;
        if (!file || bound.has(asset)) return;
        const url = normalize(file);
        if (!sources.has(url)) return;
        if (asset.loaded) model.complete(url);
        else model.start(url);
        const progress = (received: number, total: number) => {
            model.received(url, received, total);
            publish();
        };
        const load = () => {
            model.complete(url);
            publish();
        };
        const error = () => model.start(url);
        asset.on('progress', progress);
        asset.on('load', load);
        asset.on('error', error);
        bound.set(asset, () => {
            asset.off('progress', progress);
            asset.off('load', load);
            asset.off('error', error);
        });
    };
    const start = (asset: Asset) => {
        bind(asset);
        if (bound.has(asset)) model.start(normalize((asset.file as { url: string }).url));
    };
    const remove = (asset: Asset) => {
        if (!bound.has(asset)) return;
        bound.get(asset)();
        bound.delete(asset);
        model.remove(normalize((asset.file as { url: string }).url));
    };
    registry.list().forEach(bind);
    registry.on('add', bind);
    registry.on('load:start', start);
    registry.on('remove', remove);
    return {
        frame(pending: number) {
            model.frame(pending);
            publish();
        },
        stop() {
            if (stopped) return;
            stopped = true;
            registry.off('add', bind);
            registry.off('load:start', start);
            registry.off('remove', remove);
            bound.forEach((dispose) => dispose());
            bound.clear();
        }
    };
}

export { InitialLodProgress, observeInitialLodProgress };
