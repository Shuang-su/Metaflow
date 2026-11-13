import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { createAssetLoader } from './asset-loader.mjs';

function deferred() {
    let resolve;
    const promise = new Promise((yes) => { resolve = yes; });
    return { promise, resolve };
}

async function waitFor(predicate) {
    for (let i = 0; i < 50; i++) {
        if (predicate()) return;
        await nextTurn();
    }
    assert.ok(predicate(), 'expected async stage was not reached');
}

function streamResponse(chunks, { declaredBytes, neverEnd = false } = {}) {
    let cursor = 0;
    const state = { cancelled: 0, pulled: 0 };
    const body = new ReadableStream({
        pull(controller) {
            state.pulled += 1;
            if (cursor < chunks.length) controller.enqueue(Uint8Array.from(chunks[cursor++]));
            else if (!neverEnd) controller.close();
        },
        cancel() { state.cancelled += 1; }
    });
    const headers = declaredBytes === undefined ? {} : { 'content-length': String(declaredBytes) };
    return { response: new Response(body, { headers }), state };
}

function fixture({ fetchImpl, ...options } = {}) {
    const instances = [];
    const requests = [];
    const registry = {
        entries: new Set(),
        loads: [],
        add(asset) { this.entries.add(asset); },
        remove(asset) { this.entries.delete(asset); },
        load(asset) { asset.loading = true; this.loads.push(asset); },
        complete(asset, resource = { destroyed: 0, destroy() { this.destroyed += 1; } }) {
            asset.loading = false;
            asset.loaded = true;
            asset.resource = resource;
            asset.fire('load', asset);
            return resource;
        },
        error(asset, message = 'invalid PLY') {
            asset.loading = false;
            asset.loaded = true;
            asset.fire('error', message, asset);
        }
    };
    class Asset {
        constructor(name, type, file) {
            Object.assign(this, { name, type, file, loading: false, loaded: false, resource: null, unloaded: 0 });
            this.events = new Map();
            instances.push(this);
        }
        on(name, handler) {
            if (!this.events.has(name)) this.events.set(name, new Set());
            this.events.get(name).add(handler);
        }
        off(name, handler) { this.events.get(name)?.delete(handler); }
        fire(name, ...args) { for (const handler of [...(this.events.get(name) ?? [])]) handler(...args); }
        count(name) { return this.events.get(name)?.size ?? 0; }
        unload() {
            this.unloaded += 1;
            this.resource?.destroy();
            this.resource = null;
            this.loaded = false;
        }
    }
    const loader = createAssetLoader({
        app: { assets: registry }, Asset, timeoutMs: 5000,
        fetchImpl: async (url, init) => {
            requests.push({ url, init });
            return fetchImpl ? fetchImpl(url, init) : new Response(Uint8Array.of(1, 2, 3));
        },
        ...options
    });
    return { loader, registry, instances, requests };
}

const input = { url: 'https://example.test/person.ply', filename: 'person.ply' };

test('streams into Asset.contents, detaches terminal listeners, and transfers successful ownership', async () => {
    const f = fixture({ fetchImpl: async () => streamResponse([[1, 2], [3, 4]]).response });
    const promise = f.loader.load(input);
    await waitFor(() => f.registry.loads.length === 1);
    const asset = f.registry.loads[0];
    assert.equal(asset.type, 'gsplat');
    assert.equal(asset.file.filename, input.filename);
    assert.equal(f.requests[0].url, input.url);
    assert.equal(f.requests[0].init.credentials, 'omit');
    assert.deepEqual([...new Uint8Array(await (await asset.file.contents).arrayBuffer())], [1, 2, 3, 4]);
    const resource = f.registry.complete(asset);
    assert.equal(await promise, asset);
    assert.equal(asset.count('load') + asset.count('error'), 0);
    f.loader.cancel();
    assert.equal(resource.destroyed, 0);
    assert.equal(asset.unloaded, 0);
    assert.equal(f.registry.entries.has(asset), true);
});

test('rejects an oversized Content-Length before constructing or parsing an asset', async () => {
    const stream = streamResponse([[1]], { declaredBytes: 11, neverEnd: true });
    const f = fixture({ fetchImpl: async () => stream.response, limitBytes: 10 });
    await assert.rejects(f.loader.load(input), { name: 'RangeError' });
    assert.equal(f.instances.length, 0);
    assert.equal(stream.state.cancelled, 1);
    assert.equal(f.requests[0].init.signal.aborted, true);
});

test('enforces the limit on actual chunks when Content-Length is missing or understated', async () => {
    for (const declaredBytes of [undefined, 1]) {
        const stream = streamResponse([[1, 2, 3, 4], [5, 6, 7, 8], [9]], { declaredBytes, neverEnd: true });
        const f = fixture({ fetchImpl: async () => stream.response, limitBytes: 6 });
        await assert.rejects(f.loader.load(input), { name: 'RangeError' });
        assert.equal(f.instances.length, 0);
        assert.equal(stream.state.cancelled, 1);
        assert.equal(f.requests[0].init.signal.aborted, true);
    }
});

test('new load cancels old fetch immediately, and late fetch response is discarded', async () => {
    const oldFetch = deferred();
    let calls = 0;
    const f = fixture({ fetchImpl: () => calls++ === 0 ? oldFetch.promise : Promise.resolve(new Response(Uint8Array.of(9))) });
    const old = f.loader.load(input);
    const oldRejected = assert.rejects(old, { name: 'AbortError' });
    const next = f.loader.load({ ...input, url: 'https://example.test/next.ply' });
    await oldRejected;
    assert.equal(f.requests[0].init.signal.aborted, true);
    const late = streamResponse([[4]], { neverEnd: true });
    oldFetch.resolve(late.response);
    await waitFor(() => f.registry.loads.length === 1 && late.state.cancelled === 1);
    f.registry.complete(f.registry.loads[0]);
    assert.equal((await next).file.filename, input.filename);
    assert.equal(f.instances.length, 1);
});

test('cancel unblocks a stalled stream read and never starts the parser', async () => {
    const stream = streamResponse([[1, 2]], { neverEnd: true });
    const f = fixture({ fetchImpl: async () => stream.response });
    const pending = f.loader.load(input);
    const rejected = assert.rejects(pending, { name: 'AbortError' });
    await waitFor(() => stream.state.pulled > 1);
    f.loader.cancel();
    await rejected;
    await nextTurn();
    assert.equal(stream.state.cancelled, 1);
    assert.equal(f.instances.length, 0);
});

test('timeout covers network wait even if a fetch implementation ignores its abort signal', async () => {
    const waiting = deferred();
    const f = fixture({ fetchImpl: () => waiting.promise, timeoutMs: 20 });
    await assert.rejects(f.loader.load(input), { name: 'TimeoutError' });
    assert.equal(f.requests[0].init.signal.aborted, true);
    const late = streamResponse([[3]], { neverEnd: true });
    waiting.resolve(late.response);
    await waitFor(() => late.state.cancelled === 1);
    assert.equal(f.instances.length, 0);
});

test('cancel while parsing retains only late cleanup and destroys a late resource', async () => {
    const f = fixture();
    const pending = f.loader.load(input);
    const rejected = assert.rejects(pending, { name: 'AbortError' });
    await waitFor(() => f.registry.loads.length === 1);
    const asset = f.registry.loads[0];
    f.loader.cancel();
    await rejected;
    assert.equal(f.registry.entries.has(asset), false);
    assert.equal(asset.count('load'), 1);
    assert.equal(asset.count('error'), 1);
    const resource = f.registry.complete(asset);
    assert.equal(resource.destroyed, 1);
    assert.equal(asset.resource, null);
    assert.equal(asset.count('load') + asset.count('error'), 0);
});

test('timeout while parsing also cleans a subsequent load/error terminal callback', async () => {
    for (const result of ['load', 'error']) {
        const f = fixture({ timeoutMs: 20 });
        const rejected = assert.rejects(f.loader.load(input), { name: 'TimeoutError' });
        await waitFor(() => f.registry.loads.length === 1);
        const asset = f.registry.loads[0];
        await rejected;
        if (result === 'load') assert.equal(f.registry.complete(asset).destroyed, 1);
        else f.registry.error(asset);
        assert.equal(asset.count('load') + asset.count('error'), 0);
        assert.equal(f.registry.entries.has(asset), false);
    }
});

test('same-URL retry has an isolated cache key, and old completion cannot destroy the new resource', async () => {
    const f = fixture();
    const old = f.loader.load(input);
    const oldRejected = assert.rejects(old, { name: 'AbortError' });
    await waitFor(() => f.registry.loads.length === 1);
    const retry = f.loader.load(input);
    await oldRejected;
    await waitFor(() => f.registry.loads.length === 2);
    const [oldAsset, newAsset] = f.registry.loads;
    assert.notEqual(oldAsset.file.url, newAsset.file.url);
    assert.equal(f.requests[0].url, f.requests[1].url);
    const newResource = f.registry.complete(newAsset);
    assert.equal(await retry, newAsset);
    assert.equal(f.registry.complete(oldAsset).destroyed, 1);
    assert.equal(newResource.destroyed, 0);
    assert.equal(f.registry.entries.has(newAsset), true);
    assert.equal(oldAsset.count('load') + oldAsset.count('error'), 0);
});

test('a parse error detaches listeners and permits a clean retry', async () => {
    const f = fixture();
    const rejected = assert.rejects(f.loader.load(input), /bad model/);
    await waitFor(() => f.registry.loads.length === 1);
    const first = f.registry.loads[0];
    f.registry.error(first, 'bad model');
    await rejected;
    assert.equal(first.count('load') + first.count('error'), 0);
    assert.equal(f.registry.entries.size, 0);
    const retry = f.loader.load(input);
    await waitFor(() => f.registry.loads.length === 2);
    const second = f.registry.loads[1];
    f.registry.complete(second);
    assert.equal(await retry, second);
});

test('HTTP errors cancel the body, and only PLY/SOG names enter the fetch path', async () => {
    const f = fixture({ fetchImpl: async () => new Response('missing', { status: 404 }) });
    await assert.rejects(f.loader.load(input), /404/);
    assert.equal(f.instances.length, 0);
    await assert.rejects(f.loader.load({ ...input, filename: 'meta.json' }), { name: 'TypeError' });
    assert.equal(f.requests.length, 1);
});
