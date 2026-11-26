import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { importSettings, validateSettings } from '../dist/settings.js';
const template = await readFile(new URL('../src/index.html', import.meta.url), 'utf8');
const parser = template.slice(
    template.indexOf('const stripJsonComments'),
    template.indexOf('const retryableResponseStatuses')
);
const parse = vm.runInNewContext(parser + ';parseJsonc');
const data = new URL('../../data/', import.meta.url);
const index = JSON.parse(await readFile(new URL('index.json', data), 'utf8'));
const hosted = JSON.parse(await readFile(new URL('../../metadata/shenzhen-hosted-scenes.json', import.meta.url), 'utf8'));
const hostedSettings = new Map(hosted.map(({ route, files }) => [route, files.settings]));
const hostedManifest = JSON.parse(gunzipSync(await readFile(new URL('../../metadata/shenzhen-asset-manifest.json.gz', import.meta.url))));
const hostedByPath = new Map(hostedManifest.map(([path, bytes, sha256]) => [path, { bytes, sha256 }]));

async function readHostedSettings(route, path) {
    assert.equal(path, hostedSettings.get(route));
    const expected = hostedByPath.get('data/' + path);
    assert.ok(expected, 'Missing hosted settings from the release asset manifest: ' + route);
    let bytes;
    try {
        bytes = await readFile(new URL(path, data));
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        bytes = await readFile(new URL('./fixtures/shenzhen-settings/' + expected.sha256 + '.json', import.meta.url));
    }
    assert.equal(bytes.length, expected.bytes, route);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected.sha256, route);
    return bytes.toString('utf8');
}
test('all published settings remain readable without mutation or authoring clamps', async () => {
    assert.ok(index.resources.length > 0);
    for (const resource of index.resources) {
        if (!resource.files.settings) continue;
        let text;
        if (hostedSettings.has(resource.route)) {
            text = await readHostedSettings(resource.route, resource.files.settings);
        } else {
            try {
                text = await readFile(new URL(resource.files.settings, data), 'utf8');
            } catch (error) {
                if (error.code !== 'ENOENT') throw error;
                // Sparse CI still checks each tracked settings file without materializing model blobs.
                text = execFileSync('git', ['show', `HEAD:data/${resource.files.settings}`], {
                    cwd: fileURLToPath(new URL('../../', import.meta.url)),
                    encoding: 'utf8'
                });
            }
        }
        if (text.startsWith('version https://git-lfs.github.com/spec/v1')) {
            // Only this 5 KiB settings file is in LFS. Keep sparse CI independent of
            // LFS availability, but require its fixture to match the committed object.
            assert.equal(resource.files.settings, 'Shenzhen/250917 Dayun/settings-rx90-close.json');
            const pointer = text;
            text = await readFile(new URL('./fixtures/dayun-settings.json', import.meta.url), 'utf8');
            assert.equal(createHash('sha256').update(text).digest('hex'), pointer.match(/oid sha256:(\w+)/)[1]);
            assert.equal(Buffer.byteLength(text), Number(pointer.match(/size (\d+)/)[1]));
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
