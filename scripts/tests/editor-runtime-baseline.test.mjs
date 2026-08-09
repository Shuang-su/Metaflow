import test from 'node:test';
import assert from 'node:assert/strict';

import { compareRuntimeFiles } from '../validate_editor_runtime.mjs';

test('runtime baseline comparison accepts exact files', () => {
    assert.deepEqual(compareRuntimeFiles({ 'index.js': 'aaa' }, { 'index.js': 'aaa' }), []);
});

test('runtime baseline comparison reports missing, extra, and modified files', () => {
    const errors = compareRuntimeFiles(
        { 'index.js': 'aaa', 'sw.js': 'bbb' },
        { 'index.js': 'changed', 'extra.js': 'ccc' }
    );

    assert.ok(errors.some((error) => error.includes('missing: sw.js')));
    assert.ok(errors.some((error) => error.includes('extra: extra.js')));
    assert.ok(errors.some((error) => error.includes('index.js: expected aaa, got changed')));
});
