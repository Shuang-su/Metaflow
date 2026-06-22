import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const normalizePath = (value) => {
    if (!value || value === '/') {
        return '/';
    }
    const trimmed = value.endsWith('/') ? value.slice(0, -1) : value;
    return trimmed || '/';
};

const parseDomainRedirects = (html) => {
    const match = html.match(/const domainRedirects = \{([\s\S]*?)\};/);
    assert.ok(match, 'domainRedirects block is missing from index.html');

    return new Map(
        Array.from(match[1].matchAll(/'([^']+)':\s*'([^']+)'/g), ([, host, path]) => [
            host,
            path
        ])
    );
};

test('深圳技术大学.com redirects resolve to indexed C2-Lib routes', async () => {
    const [html, index] = await Promise.all([
        readFile(new URL('../src/index.html', import.meta.url), 'utf8'),
        readFile(new URL('../../data/index.json', import.meta.url), 'utf8').then(JSON.parse)
    ]);

    const redirects = parseDomainRedirects(html);
    const indexedPaths = new Set();
    for (const resource of index.resources || []) {
        indexedPaths.add(normalizePath(resource.route));
        for (const alias of resource.aliases || []) {
            indexedPaths.add(normalizePath(alias));
        }
    }

    for (const host of ['xn--fes68bkzcz5lkjgrkl.com', 'www.xn--fes68bkzcz5lkjgrkl.com']) {
        const target = redirects.get(host);
        assert.equal(target, '/sztu/c2-lib');
        assert.ok(indexedPaths.has(normalizePath(target)), `${host} target is not in data/index.json`);
    }

    const c2Lib = index.resources.find((resource) => resource.id === 'c2-lib');
    assert.equal(c2Lib?.route, '/sztu/c2-lib');
    assert.ok(c2Lib.aliases?.includes('/c2-lib'), 'legacy /c2-lib alias should remain available');
});
