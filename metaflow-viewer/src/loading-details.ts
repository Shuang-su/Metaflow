import type { Asset } from 'playcanvas';

import type { Global } from './types';

type RetryDetail = { url: string; attempt: number; maxAttempts: number; error: string };
type ResourceTiming = Pick<PerformanceResourceTiming, 'name' | 'startTime' | 'decodedBodySize' | 'transferSize'>;

/** Counts observable resource completions, not an estimate of a scene's full download size. */
class LoadingMetrics {
    private scopes: { url: string; directory: boolean }[];
    private seen = new Set<string>();
    private bytes = new Map<string, number>();
    private samples: { time: number; bytes: number }[] = [];
    completed = 0;
    cached = 0;
    retries = 0;
    lastError = '';

    constructor(
        sources: string[],
        private base: string,
        readonly started: number
    ) {
        this.scopes = sources.filter(Boolean).flatMap((source) => {
            try {
                const url = new URL(source, base);
                const directory = url.pathname.endsWith('.json') && !url.pathname.endsWith('/index.json');
                return [{ url: directory ? new URL('.', url).href : url.href, directory }];
            } catch {
                return [];
            }
        });
    }

    matches(source: string) {
        try {
            const url = new URL(source, this.base);
            url.hash = '';
            return this.scopes.some((scope) =>
                scope.directory
                    ? url.href.startsWith(scope.url)
                    : url.origin + url.pathname === new URL(scope.url).origin + new URL(scope.url).pathname
            );
        } catch {
            return false;
        }
    }

    received(source: string, bytes: number) {
        if (Number.isFinite(bytes) && bytes >= 0) this.bytes.set(source, Math.max(this.bytes.get(source) ?? 0, bytes));
    }

    resource(entry: ResourceTiming) {
        if (entry.startTime < this.started || !this.matches(entry.name)) return;
        const key = `${entry.name}:${entry.startTime}`;
        if (this.seen.has(key)) return;
        this.seen.add(key);
        this.completed++;
        if (entry.decodedBodySize > 0 && entry.transferSize === 0) this.cached++;
        this.received(entry.name, entry.decodedBodySize);
    }

    retry(detail: RetryDetail) {
        if (!this.matches(detail.url)) return;
        this.retries++;
        this.error(detail.error);
    }

    error(error: unknown) {
        // Keep useful causes without long URLs, query tokens, or stack traces.
        this.lastError = String(error instanceof Error ? error.message : error)
            .replace(/https?:\/\/\S+/g, (url) => {
                try {
                    return new URL(url).pathname;
                } catch {
                    return '[resource]';
                }
            })
            .slice(0, 240);
    }

    snapshot(now: number) {
        const bytes = [...this.bytes.values()].reduce((sum, n) => sum + n, 0);
        this.samples.push({ time: now, bytes });
        while (this.samples.length > 2 && this.samples[1].time < now - 4000) this.samples.shift();
        const first = this.samples[0];
        const seconds = (now - first.time) / 1000;
        return {
            bytes,
            rate: seconds >= 0.5 ? Math.max(0, bytes - first.bytes) / seconds : null,
            seconds: Math.max(0, now - this.started) / 1000
        };
    }
}

const formatBytes = (bytes: number) =>
    bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MiB` : `${(bytes / 1024).toFixed(0)} KiB`;

function loadingIssueKey(error: string) {
    if (/HTTP 404/.test(error)) return 'loading.issue.not-found';
    if (/HTTP (401|403)/.test(error)) return 'loading.issue.access';
    if (/HTTP 429/.test(error)) return 'loading.issue.busy';
    if (/HTTP 5\d\d/.test(error)) return 'loading.issue.service';
    if (/HTTP 408|timeout|timed out/i.test(error)) return 'loading.issue.timeout';
    return 'loading.issue.request';
}

/** Observation only: no fetch monkey-patching or new buffering of large scene bodies. */
function initLoadingDetails(global: Global, node: HTMLElement) {
    const { app, config, events, localize, root } = global;
    const sources = [
        config.contentUrl,
        config.environmentUrl,
        config.skyboxUrl,
        ...Object.values(config.analyticsResourceUrls ?? {})
    ].filter((url): url is string => typeof url === 'string');
    const started = config.exposeGlobals ? 0 : Number(root.dataset.loadStarted);
    if (config.exposeGlobals) sources.push(new URL('./index.js', document.baseURI).href);
    const metrics = new LoadingMetrics(sources, location.href, started);
    const disposers: (() => void)[] = [];
    const attempts = new Map<number, number>();
    const assets = new Set<Asset>();
    const bind = (asset: Asset) => {
        const fileUrl = (asset.file as { url?: string })?.url;
        if (assets.has(asset) || !fileUrl || !metrics.matches(fileUrl)) return;
        assets.add(asset);
        if (asset.loading || asset.loaded) attempts.set(asset.id, 1);
        const progress = (received: number) => {
            // Loose SOG's parent JSON aggregates its child textures. Counting
            // both would double the bytes; individual HTTP completions cover it.
            if (!new URL(fileUrl, location.href).pathname.endsWith('.json'))
                metrics.received(new URL(fileUrl, location.href).href, received);
        };
        const error = (error: unknown) => metrics.error(error);
        asset.on('progress', progress);
        asset.on('error', error);
        disposers.push(() => {
            asset.off('progress', progress);
            asset.off('error', error);
        });
    };
    for (const asset of app.assets.list()) bind(asset);
    const start = (asset: Asset) => {
        bind(asset);
        if (!assets.has(asset)) return;
        const count = attempts.get(asset.id) ?? 0;
        if (count > 0) metrics.retries++;
        attempts.set(asset.id, count + 1);
    };
    app.assets.on('add', bind);
    app.assets.on('load:start', start);
    disposers.push(() => {
        app.assets.off('add', bind);
        app.assets.off('load:start', start);
    });

    const startup = (window as unknown as { metaflowStartup?: { retries: RetryDetail[] } }).metaflowStartup;
    if (config.exposeGlobals) for (const detail of startup?.retries ?? []) metrics.retry(detail);
    const retry = (event: Event) => metrics.retry((event as CustomEvent<RetryDetail>).detail);
    window.addEventListener('metaflow:loadretry', retry);
    disposers.push(() => window.removeEventListener('metaflow:loadretry', retry));

    let observable = false;
    if (typeof PerformanceObserver !== 'undefined') {
        try {
            const observer = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) metrics.resource(entry as PerformanceResourceTiming);
            });
            observer.observe({ type: 'resource', buffered: true });
            observable = true;
            disposers.push(() => observer.disconnect());
        } catch {
            /* Some WebViews do not expose resource timing. */
        }
    }
    const update = () => {
        const { bytes, rate, seconds } = metrics.snapshot(performance.now());
        const active = [...assets].filter((asset) => asset.loading).length;
        const value = observable ? String(metrics.completed) : localize('loading.unavailable');
        node.textContent =
            `${localize('loading.requests')} ${value} · ${localize('loading.active')} ${active}\n` +
            `${localize('loading.received')} ${bytes > 0 ? formatBytes(bytes) : localize('loading.unavailable')} · ${localize('loading.rate')} ${bytes === 0 || rate === null ? localize('loading.unavailable') : formatBytes(rate) + '/s'}\n` +
            `${localize('loading.elapsed')} ${seconds.toFixed(1)} s · ${localize('loading.retries')} ${metrics.retries} · ${localize('loading.cache')} ${metrics.cached}` +
            (metrics.lastError
                ? `\n${localize('loading.last-error')} ${localize(loadingIssueKey(metrics.lastError))}`
                : '') +
            (root.dataset.posterStatus === 'unavailable' ? `\n${localize('loading.poster.unavailable')}` : '');
    };
    update();
    const interval = setInterval(update, 500);
    let stopped = false;
    const stop = () => {
        if (stopped) return;
        stopped = true;
        clearInterval(interval);
        for (const dispose of disposers) dispose();
        disposers.length = 0;
        assets.clear();
        attempts.clear();
    };
    const loaded = events.on('loaded:changed', stop);
    disposers.push(() => loaded.off());
    return stop;
}

export { LoadingMetrics, initLoadingDetails, loadingIssueKey };
