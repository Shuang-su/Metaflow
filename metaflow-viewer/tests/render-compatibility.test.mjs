import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

import { siteHtml } from '../site-html.mjs';
import { configureWebglImageDecoding, isAppleMobileWebKit } from '../src/render-compatibility.js';

const template = await readFile(new URL('../src/index.html', import.meta.url), 'utf8');
const hosted = siteHtml(template);
const clients = {
    iphone: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 Version/27.0 Mobile/15E148 Safari/604.1', platform: 'iPhone', maxTouchPoints: 5 },
    ipad: { userAgent: 'Mozilla/5.0 (iPad; CPU OS 27_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1', platform: 'iPad', maxTouchPoints: 5 },
    ipadDesktop: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/27.0 Safari/605.1.15', platform: 'MacIntel', maxTouchPoints: 5 },
    embeddedIos: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 MicroMessenger/8.0', platform: 'iPhone', maxTouchPoints: 5 },
    chromeIos: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/157.0 Mobile/15E148 Safari/604.1', platform: 'iPhone', maxTouchPoints: 5 },
    mac: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/27.0 Safari/605.1.15', platform: 'MacIntel', maxTouchPoints: 0 },
    windows: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/157.0 Safari/537.36', platform: 'Win32', maxTouchPoints: 10 },
    android: { userAgent: 'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/157.0 Mobile Safari/537.36', platform: 'Linux armv8l', maxTouchPoints: 5 },
    unknown: {}
};

function runBootstrap(client, query = '', pathname = '/test-scene', html = hosted) {
    const requests = [];
    const location = new URL(`https://viewer.test${pathname}?noui&noanalytics&${query}`);
    const window = { setTimeout: (callback) => callback() };
    const resource = { route: '/test-scene', files: {
        model: 'test/scene.sog', settings: 'test/settings.json', environment: 'test/environment.compressed.ply'
    } };
    const context = {
        window, location, navigator: client, URL, Image: class {}, console,
        document: {
            getElementById: () => ({ textContent: 'null' }),
            querySelector: () => null
        },
        fetch: async (url) => {
            requests.push(url);
            return { ok: true, status: 200, json: async () => ({ resources: [resource] }), text: async () => '{}' };
        }
    };
    vm.runInNewContext(html.match(/<script type="module">([\s\S]*?)<\/script>/)[1], context);
    return { window, requests };
}

for (const [name, expected] of [
    ['iphone', 'webgl'], ['ipad', 'webgl'], ['ipadDesktop', 'webgl'],
    ['embeddedIos', 'webgl'], ['chromeIos', 'webgl'],
    ['mac', 'webgpu'], ['windows', 'webgpu'], ['android', 'webgpu'], ['unknown', 'webgpu']
]) {
    test(`hosted ${name} bootstrap chooses ${expected} and keeps the scene assets`, async () => {
        const { window } = runBootstrap(clients[name]);
        const { config } = await window.sseReady;
        assert.equal(config.renderer, expected);
        assert.equal(config.contentUrl, '/data/test/scene.sog');
        assert.equal(config.environmentUrl, '/data/test/environment.compressed.ply');
    });
}

for (const [query, expected] of [
    ['webgpu', 'webgpu'], ['stochastic', 'webgpu'], ['heatmap', 'webgpu'],
    ['webgl', 'webgl'], ['webgpu&webgl', 'webgl'],
    ['webgl&stochastic', 'webgl'], ['heatmap&webgpu&webgl', 'webgl']
]) {
    test(`hosted iOS explicit flags ${query} choose ${expected}`, async () => {
        const { window } = runBootstrap(clients.iphone, query);
        assert.equal((await window.sseReady).config.renderer, expected);
    });
}

test('direct content keeps the compatibility policy without fetching the route index', async () => {
    const { window, requests } = runBootstrap(clients.iphone,
        'content=/custom/scene.sog&settings=/custom/settings.json&environment=/custom/background.ply');
    const { config } = await window.sseReady;
    assert.equal(config.renderer, 'webgl');
    assert.equal(config.contentUrl, '/custom/scene.sog');
    assert.equal(config.environmentUrl, '/custom/background.ply');
    assert.ok(!requests.includes('/data/index.json'));
});

test('Director routes do not initialize Viewer or fetch a scene', () => {
    for (const pathname of ['/test-scene/director', '/test-scene/director/']) {
        const { window, requests } = runBootstrap(clients.iphone, '', pathname);
        assert.equal(window.metaflowDirectorPath, true);
        assert.equal(window.sseReady, null);
        assert.deepEqual(requests, []);
    }
});

test('the untransformed embed/export template keeps its WebGPU default on iOS', async () => {
    const { window } = runBootstrap(clients.iphone, '', '/test-scene', template);
    assert.equal((await window.sseReady).config.renderer, 'webgpu');
});

test('WebGL uses HTML image decoding on Apple mobile, including embedded browsers', () => {
    for (const name of ['iphone', 'ipad', 'ipadDesktop', 'embeddedIos', 'chromeIos']) {
        const device = { deviceType: 'webgl2', supportsImageBitmap: true };
        configureWebglImageDecoding(device, isAppleMobileWebKit(clients[name]));
        assert.equal(device.supportsImageBitmap, false, name);
    }
});

test('image decoding leaves WebGPU and non-Apple WebGL capabilities untouched', () => {
    for (const deviceType of ['webgpu', 'null']) {
        const device = { deviceType, supportsImageBitmap: true };
        configureWebglImageDecoding(device, isAppleMobileWebKit(clients.iphone));
        assert.equal(device.supportsImageBitmap, true);
    }
    for (const name of ['mac', 'windows', 'android', 'unknown']) {
        for (const supportsImageBitmap of [true, false]) {
            const device = { deviceType: 'webgl2', supportsImageBitmap };
            configureWebglImageDecoding(device, isAppleMobileWebKit(clients[name]));
            assert.equal(device.supportsImageBitmap, supportsImageBitmap);
        }
    }
});
