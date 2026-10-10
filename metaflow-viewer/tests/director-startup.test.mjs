import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadDirectorEntry, loadViewerEntry, siteHtml } from '../site-html.mjs';

test('Director startup recovers from rejected network imports with fresh module URLs', async () => {
    const urls = [], delays = [];
    await loadDirectorEntry(async (url) => {
        urls.push(url);
        if (urls.length < 4) throw new TypeError('Failed to fetch dynamically imported module: ' + url);
    }, async (ms) => delays.push(ms));
    assert.deepEqual(urls, ['/director/entry.js', '/director/entry.js?mf_retry=1',
        '/director/entry.js?mf_retry=2', '/director/entry.js?mf_retry=3']);
    assert.deepEqual(delays, [100, 300, 900]);
});

test('Director startup has a finite retry budget and preserves the final network error', async () => {
    let requests = 0;
    const error = new TypeError('Importing a module script failed.');
    await assert.rejects(loadDirectorEntry(async () => { requests++; throw error; }, async () => {}),
        (actual) => actual === error);
    assert.equal(requests, 4);
});

test('Director startup does not retry evaluation, syntax, or capability errors', async () => {
    for (const error of [new SyntaxError('Unexpected token'), new TypeError('GPU unavailable'),
        new Error('scene initialization failed')]) {
        let requests = 0, waits = 0;
        await assert.rejects(loadDirectorEntry(async () => { requests++; throw error; },
            async () => { waits++; }), (actual) => actual === error);
        assert.equal(requests, 1);
        assert.equal(waits, 0);
    }
});

test('only the hosted Director bootstrap gets bounded recovery and explicit exit controls', async () => {
    const template = await readFile(new URL('../src/index.html', import.meta.url), 'utf8');
    const hosted = siteHtml(template);
    assert.ok(hosted.includes(loadDirectorEntry.toString()));
    assert.match(hosted, /重试摄影页面/);
    assert.match(hosted, /retry\.addEventListener\('click', \(\) => location\.reload\(\)\)/);
    assert.match(hosted, /back\.href = location\.pathname\.replace/);
    assert.ok(hosted.includes(loadViewerEntry.toString()));
    assert.ok(!template.includes('mf_retry='), 'SDK/export template is unchanged');
});
