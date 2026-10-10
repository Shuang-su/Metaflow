import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/loading-details.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022
} });
const { LoadingMetrics, initLoadingDetails, loadingIssueKey } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const metric = () => new LoadingMetrics(['/data/scene/lod-meta.json', '/data/index.json', '/index.js'], 'https://viewer.test/', 100);
const entry = (name, startTime, decodedBodySize = 1024, transferSize = 1324) => ({
    name: 'https://viewer.test' + name, startTime, decodedBodySize, transferSize
});

test('counts only this scene and bootstrap requests, excluding other scenes and earlier loads', () => {
    const m = metric();
    for (const e of [entry('/data/scene/1/meta.json', 100), entry('/index.js?mf_retry=1', 100),
        entry('/data/index.json', 101), entry('/analytics', 102), entry('/data/other/scene.sog', 102),
        entry('/data/scene-2/lod-meta.json', 102), entry('/data/scene/2/meta.json', 99)]) m.resource(e);
    assert.equal(m.completed, 3);
    assert.equal(m.snapshot(1000).bytes, 3072);
});

test('progress and buffered completion for the same URL never double count bytes or requests', () => {
    const m = metric(), e = entry('/data/scene/0/scene.sog', 105, 4096);
    m.received(e.name, 2048);
    assert.equal(m.snapshot(500).bytes, 2048);
    m.resource(e);
    m.resource(e);
    m.received(e.name, 1024); // A retry or stale progress callback cannot run bytes backwards.
    assert.equal(m.snapshot(1000).bytes, 4096);
    assert.equal(m.completed, 1);
    assert.equal(m.cached, 0);
});

test('unknown sizes remain zero measured bytes; measurable cache reads are identified', () => {
    const m = metric();
    m.resource(entry('/data/scene/0/meta.json', 101, 0, 0));
    m.resource(entry('/data/scene/0/means.webp', 102, 2048, 0));
    assert.equal(m.completed, 2);
    assert.equal(m.cached, 1);
    assert.equal(m.snapshot(500).bytes, 2048);
    assert.equal(m.snapshot(501).rate, null);
});

test('read rate uses a bounded rolling interval and stays finite when progress is unchanged', () => {
    const m = metric();
    m.snapshot(100);
    m.received('file', 1024);
    assert.equal(m.snapshot(1100).rate, 1024);
    for (let t = 2100; t <= 8100; t += 1000) m.snapshot(t);
    assert.equal(m.snapshot(9100).rate, 0);
});

test('retry causes remain visible, strip query secrets, and exclude unrelated resources', () => {
    const m = metric();
    m.retry({ url: '/data/scene/0/meta.json', attempt: 2, maxAttempts: 4, error: 'HTTP 503: https://viewer.test/data/scene/0/meta.json?token=secret' });
    m.retry({ url: '/analytics', attempt: 2, maxAttempts: 4, error: 'Ignored' });
    assert.equal(m.retries, 1);
    assert.equal(m.lastError, 'HTTP 503: /data/scene/0/meta.json');
});

test('completion and repeated disposal release observers, timers and every asset listener', () => {
    const saved = new Map(['window', 'location', 'PerformanceObserver', 'setInterval', 'clearInterval'].map(key =>
        [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    const emitter = () => {
        const listeners = new Map();
        return {
            listeners,
            on(name, fn) { listeners.set(name, fn); return { off: () => this.off(name, fn) }; },
            off(name, fn) { if (listeners.get(name) === fn) listeners.delete(name); }
        };
    };
    const events = emitter(), asset = { ...emitter(), id: 1, loading: true, file: { url: '/data/scene/scene.sog' } };
    const registry = { ...emitter(), list: () => [asset] };
    let disconnected = 0, cleared = 0;
    try {
        globalThis.window = { addEventListener() {}, removeEventListener() {} };
        globalThis.location = { href: 'https://viewer.test/' };
        globalThis.PerformanceObserver = class { observe() {} disconnect() { disconnected++; } };
        globalThis.setInterval = () => 7;
        globalThis.clearInterval = value => { assert.equal(value, 7); cleared++; };
        const stop = initLoadingDetails({ app: { assets: registry }, events,
            config: { contentUrl: '/data/scene/scene.sog', exposeGlobals: false },
            localize: key => key, root: { dataset: { loadStarted: '0' } } }, {});
        assert.ok(registry.listeners.size > 0);
        assert.ok(asset.listeners.size > 0);
        events.listeners.get('loaded:changed')();
        stop();
        assert.equal(disconnected, 1);
        assert.equal(cleared, 1);
        assert.equal(registry.listeners.size, 0);
        assert.equal(asset.listeners.size, 0);
        assert.equal(events.listeners.size, 0);
    } finally {
        for (const [key, descriptor] of saved) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor);
            else delete globalThis[key];
        }
    }
});


test('network causes have user-facing categories without exposing technical error details', () => {
    for (const [cause, key] of [
        ['HTTP 404: /missing.sog', 'not-found'],
        ['HTTP 403', 'access'],
        ['HTTP 429', 'busy'],
        ['HTTP 503', 'service'],
        ['HTTP 408', 'timeout'],
        ['Request timed out', 'timeout'],
        ['Failed to fetch dynamically imported module: /index.js', 'request']
    ]) assert.equal(loadingIssueKey(cause), 'loading.issue.' + key);
});
