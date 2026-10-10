import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { loadViewerEntry, siteHtml } from '../site-html.mjs';

const template = await readFile(new URL('../src/index.html', import.meta.url), 'utf8');

test('Viewer imports resolve against the document base and recover with fresh module URLs', async () => {
    const namespace = { createViewer() {} }, urls = [], delays = [];
    const result = await loadViewerEntry('https://viewer.test/', async (url) => {
        urls.push(url);
        if (urls.length < 4) throw new TypeError('Importing a module script failed.');
        return namespace;
    }, async (ms) => delays.push(ms));
    assert.equal(result, namespace);
    assert.deepEqual(urls, ['https://viewer.test/index.js', 'https://viewer.test/index.js?mf_retry=1',
        'https://viewer.test/index.js?mf_retry=2', 'https://viewer.test/index.js?mf_retry=3']);
    assert.deepEqual(delays, [100, 300, 900]);
    let subdirectory;
    await loadViewerEntry('https://viewer.test/embed/', async (url) => { subdirectory = url; });
    assert.equal(subdirectory, 'https://viewer.test/embed/index.js');
});

test('Viewer import exhaustion preserves the final cause and does not retry evaluation faults', async () => {
    for (const [error, attempts] of [
        [new TypeError('Failed to fetch dynamically imported module'), 4],
        [new SyntaxError('Unexpected token'), 1],
        [new TypeError('Graphics device unavailable'), 1],
        [new Error('Viewer initialization failed'), 1]
    ]) {
        let calls = 0;
        await assert.rejects(loadViewerEntry('https://viewer.test/', async () => {
            calls++;
            throw error;
        }, async () => {}), (actual) => actual === error);
        assert.equal(calls, attempts);
    }
});

function bootstrap(outcomes, search = '') {
    const calls = [], delays = [], warnings = [];
    const location = new URL('https://viewer.test/shenzhen/dayun' + search);
    const window = { setTimeout: (callback, ms) => { delays.push(ms); callback(); } };
    const context = {
        window, location, URL, Image: class {},
        console: { warn: (...args) => warnings.push(args) },
        document: {
            getElementById: () => ({ textContent: 'null' }),
            querySelector: () => null
        },
        fetch: async (url, options) => {
            calls.push({ url, options });
            if (url === '/data/index.json') {
                const outcome = outcomes.shift();
                if (outcome instanceof Error) throw outcome;
                if (typeof outcome === 'number') return { ok: false, status: outcome };
                return { ok: true, json: async () => outcome };
            }
            return { ok: true, text: async () => '{}', status: 200 };
        }
    };
    const script = template.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
    vm.runInNewContext(script, context);
    return { ready: window.sseReady, calls, delays, warnings };
}

const index = { resources: [{ route: '/shenzhen/dayun', files: {
    model: 'Dayun/lod-meta.json', settings: 'Dayun/settings.json'
} }] };

test('route lookup recovers from network and HTTP failures and retains no-store policy', async () => {
    const scenario = bootstrap([new TypeError('connection reset'), 503, index]);
    const result = await scenario.ready;
    assert.equal(result.config.contentUrl, '/data/Dayun/lod-meta.json');
    assert.equal(scenario.calls.filter((c) => c.url === '/data/index.json').length, 3);
    assert.deepEqual(scenario.delays, [500, 1000]);
    assert.ok(scenario.calls.filter((c) => c.url === '/data/index.json').every((c) => c.options.cache === 'no-store'));
});

test('exhausted or permanent route failures never fall through to a default scene', async () => {
    const cause = new TypeError('offline');
    for (const [outcomes, attempts, match] of [
        [[cause, cause, cause, cause], 4, (error) => error === cause],
        [[404], 1, /HTTP 404/],
        [[503, 503, 503, 503], 4, /HTTP 503/]
    ]) {
        const scenario = bootstrap(outcomes);
        await assert.rejects(scenario.ready, match);
        assert.equal(scenario.calls.length, attempts);
        assert.ok(scenario.calls.every((c) => c.url === '/data/index.json'));
    }
});

test('explicit content bypasses the index even on a deep route', async () => {
    const scenario = bootstrap([], '?content=/custom/scene.sog&settings=/custom/settings.json');
    assert.equal((await scenario.ready).config.contentUrl, '/custom/scene.sog');
    assert.ok(!scenario.calls.some((c) => c.url === '/data/index.json'));
});
