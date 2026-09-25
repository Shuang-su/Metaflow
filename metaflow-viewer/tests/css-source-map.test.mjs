import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readText = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('production CSS build composes Sass and PostCSS source maps', async () => {
    const rollup = await readText('../rollup.config.mjs');

    assert.match(rollup, /fileName: 'index\.css',[\s\S]*sourceMap: true/);
    assert.match(rollup, /processor: \(css, map\) =>/);
    assert.match(rollup, /previousMap\.sources = previousMap\.sources\.map/);
    assert.match(rollup, /prev: previousMap/);
    assert.match(rollup, /annotation: 'index\.css\.map'/);
    assert.match(rollup, /sourcesContent: true/);
    assert.match(rollup, /map: result\.map\.toString\(\)/);
});
