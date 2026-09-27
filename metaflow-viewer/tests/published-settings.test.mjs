import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { importSettings, validateSettings } from '../dist/settings.js';
const template = await readFile(new URL('../src/index.html', import.meta.url), 'utf8');
const parser = template.slice(
    template.indexOf('const stripJsonComments'),
    template.indexOf('const retryableResponseStatuses')
);
const parse = vm.runInNewContext(parser + ';parseJsonc');
const data = new URL('../../data/', import.meta.url);
const index = JSON.parse(await readFile(new URL('index.json', data), 'utf8'));
test('all 99 published settings remain readable without mutation or authoring clamps', async () => {
    assert.equal(index.resources.length, 99);
    for (const resource of index.resources) {
        if (!resource.files.settings) continue;
        let text;
        try {
            text = await readFile(new URL(resource.files.settings, data), 'utf8');
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
            // Sparse CI still checks every committed settings file, without pulling model blobs.
            text = execFileSync('git', ['show', `HEAD:data/${resource.files.settings}`], {
                cwd: fileURLToPath(new URL('../../', import.meta.url)),
                encoding: 'utf8'
            });
        }
        const original = parse(text);
        const before = structuredClone(original);
        const normalized = importSettings(original);
        assert.equal(JSON.stringify(original), JSON.stringify(before), resource.id + ': input was mutated');
        assert.doesNotThrow(() => validateSettings(normalized), resource.id);
        if (original.version === 2) {
            assert.deepEqual(normalized.cameras, original.cameras, resource.id + ': cameras changed');
            assert.deepEqual(normalized.background, original.background, resource.id + ': background changed');
            assert.deepEqual(normalized.animTracks, original.animTracks, resource.id + ': animation changed');
        }
    }
});
