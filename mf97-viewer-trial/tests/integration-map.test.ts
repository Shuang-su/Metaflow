import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';

const require = createRequire(import.meta.url);
const { build } = require('esbuild') as typeof import('esbuild');
const sourceUrl = new URL('../../metaflow-viewer/src/navigation/integration.ts', import.meta.url);

// Execute the actual integration and its pure dependencies. Replace only Drawing,
// which requires WebGL, so lifecycle checks need no browser or graphics device.
const program = (async () => {
    const source = await readFile(sourceUrl, 'utf8');
    const drawingImport = "import { NavigationDrawing } from './drawing';";
    assert.ok(source.includes(drawingImport));
    const result = await build({
        stdin: {
            contents: source.replace(drawingImport, 'const NavigationDrawing = globalThis.__drawing;'),
            resolveDir: new URL('./', sourceUrl).pathname,
            sourcefile: sourceUrl.pathname,
            loader: 'ts'
        },
        bundle: true,
        platform: 'node',
        format: 'cjs',
        write: false,
        logLevel: 'silent'
    });
    return result.outputFiles[0].text;
})();

class Events {
    private handlers = new Map<string, Set<(...args: unknown[]) => void>>();
    on(name: string, callback: (...args: unknown[]) => void) {
        if (!this.handlers.has(name)) this.handlers.set(name, new Set());
        this.handlers.get(name)!.add(callback);
        return { off: () => this.handlers.get(name)!.delete(callback) };
    }
    fire(name: string, ...args: unknown[]) { this.handlers.get(name)?.forEach(callback => callback(...args)); }
}

const settle = async () => {
    for (let i = 0; i < 12; i++) await Promise.resolve();
};

async function fixture(config: { navigationMapUrl?: string; navigationManifestUrl?: string }, fetch: typeof globalThis.fetch) {
    const mapCalls: { url: string; expected: Record<string, unknown> }[] = [];
    let workers = 0;
    class Drawing {
        mapAssets(url: string, expected: Record<string, unknown> = {}) { mapCalls.push({ url, expected }); }
        preferences() {}
        visible() {}
        status() {}
        route() {}
        regions() {}
        choices() {}
        destroy() {}
    }
    const module = { exports: {} as { installNavigation: (global: unknown) => () => void } };
    runInNewContext(await program, {
        module,
        exports: module.exports,
        require,
        __drawing: Drawing,
        URL,
        fetch,
        location: { href: 'http://127.0.0.1:5185/' },
        document: { hidden: false, addEventListener() {}, removeEventListener() {} },
        window: { setInterval: () => 0 },
        clearInterval() {},
        setTimeout,
        clearTimeout,
        performance,
        Worker: class { constructor() { workers++; } postMessage() {} terminate() {} }
    });
    const events = new Events();
    const state = { guidanceMode: false, guidanceMapVisible: true, cameraMode: 'orbit', xrMode: false, loaded: true };
    const dispose = module.exports.installNavigation({
        config: { ...config, navigationWorkerUrl: '/worker.js' },
        state,
        events, app: {}, settings: { annotations: [] }
    });
    await settle();
    return { mapCalls, workers: () => workers, dispose, state, events };
}

test('explicit Gaussian map loads while navigation metadata remains pending and guidance is off', async () => {
    const f = await fixture({ navigationMapUrl: '/maps.json', navigationManifestUrl: '/slow-nav.json' },
        (() => new Promise<Response>(() => {})) as typeof fetch);
    try {
        assert.equal(f.mapCalls.length, 1);
        assert.equal(f.mapCalls[0].url, '/maps.json');
        assert.equal(f.workers(), 0);
    } finally { f.dispose(); }
});

test('sidecar map waits for metadata then receives its collision source identity without booting navigation', async () => {
    let complete!: (response: Response) => void;
    const f = await fixture({ navigationManifestUrl: '/navigation/manifest.json' },
        (() => new Promise<Response>(resolve => { complete = resolve; })) as typeof fetch);
    try {
        assert.equal(f.mapCalls.length, 0);
        complete({ ok: true, json: async () => ({ status: 'complete', sourceHash: 'collision-v1', mapsUrl: '../maps/manifest.json' }) } as Response);
        await settle();
        assert.equal(f.mapCalls.length, 1);
        assert.equal(f.mapCalls[0].url, 'http://127.0.0.1:5185/maps/manifest.json');
        assert.equal(f.mapCalls[0].expected.collisionHash, 'collision-v1');
        assert.equal(f.workers(), 0);
    } finally { f.dispose(); }
});

test('destroyed integration cannot reconnect maps after navigation metadata resolves', async () => {
    let complete!: (response: Response) => void;
    const f = await fixture({ navigationMapUrl: '/maps.json', navigationManifestUrl: '/slow-nav.json' },
        (() => new Promise<Response>(resolve => { complete = resolve; })) as typeof fetch);
    const before = f.mapCalls.length;
    f.dispose();
    complete({ ok: true, json: async () => ({ status: 'complete', sourceHash: 'collision-v1' }) } as Response);
    await settle();
    assert.equal(f.mapCalls.length, before);
    assert.equal(f.workers(), 0);
});

test('map-only scene needs no navigation manifest request or Worker', async () => {
    let requests = 0;
    const f = await fixture({ navigationMapUrl: '/maps.json' },
        (async () => { requests++; throw Error('navigation should not be requested'); }) as typeof fetch);
    try {
        assert.equal(f.mapCalls.length, 1);
        assert.equal(requests, 0);
        assert.equal(f.workers(), 0);
    } finally { f.dispose(); }
});

test('navigation boot does not downgrade then reconnect an already source-verified map', async () => {
    const f = await fixture({ navigationMapUrl: '/maps.json', navigationManifestUrl: '/navigation.json' },
        (async () => ({ ok: true, json: async () => ({ status: 'complete', sourceHash: 'collision-v1' }) } as Response)) as typeof fetch);
    try {
        assert.equal(f.mapCalls.at(-1)?.expected.collisionHash, 'collision-v1');
        const initialConnections = f.mapCalls.length;
        f.state.guidanceMode = true;
        f.events.fire('guidanceMode:changed', true);
        await settle();
        assert.equal(f.mapCalls.length, initialConnections);
        assert.equal(f.workers(), 1);
    } finally { f.dispose(); }
});

test('navigation manifest binds Gaussian identity and exact scene transform as well as collision source', async () => {
    const transform = [1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, 3, 0, 0, 1];
    const f = await fixture({ navigationManifestUrl: '/navigation.json' },
        (async () => ({ ok: true, json: async () => ({
            status: 'complete', sourceHash: 'collision-v1', mapsUrl: '/maps.json',
            mapSource: { gaussianHash: 'gaussian-v1', transform }
        }) } as Response)) as typeof fetch);
    try {
        assert.equal(f.mapCalls.length, 1);
        assert.equal(f.mapCalls[0].expected.collisionHash, 'collision-v1');
        assert.equal(f.mapCalls[0].expected.gaussianHash, 'gaussian-v1');
        assert.deepEqual(Array.from(f.mapCalls[0].expected.transform as number[]), transform);
        assert.equal(f.workers(), 0);
    } finally { f.dispose(); }
});
