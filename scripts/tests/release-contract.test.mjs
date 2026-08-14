import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
    parseReleaseTag,
    validateReleaseContract,
    validateViewerReleaseContract
} from '../validate_release_contract.mjs';

async function makeViewerFixture(version = '5.19.1', gitRef = 'abcdef1') {
    const root = await mkdtemp(join(tmpdir(), 'metaflow-release-contract-'));
    await Promise.all([
        mkdir(join(root, 'metaflow-viewer'), { recursive: true }),
        mkdir(join(root, 'metadata'), { recursive: true }),
        mkdir(join(root, 'data'), { recursive: true })
    ]);
    const history = {
        current: {
            displayVersion: version,
            appSemver: version,
            gitRef
        },
        entries: []
    };
    await Promise.all([
        writeFile(join(root, 'metaflow-viewer/package.json'), JSON.stringify({ version })),
        writeFile(
            join(root, 'metaflow-viewer/package-lock.json'),
            JSON.stringify({ version, packages: { '': { version } } })
        ),
        writeFile(join(root, 'metadata/version-history.json'), JSON.stringify(history)),
        writeFile(join(root, 'data/version-history.json'), JSON.stringify(history)),
        writeFile(
            join(root, 'data/index.json'),
            JSON.stringify({ release: { displayVersion: version, appSemver: version, gitRef } })
        )
    ]);
    return root;
}

test('release tags use a strict namespaced SemVer contract', () => {
    assert.deepEqual(parseReleaseTag('viewer-v5.19.1'), { component: 'viewer', version: '5.19.1' });
    assert.deepEqual(parseReleaseTag('editor-v1.2.3-beta.4'), {
        component: 'editor',
        version: '1.2.3-beta.4'
    });
    assert.throws(() => parseReleaseTag('viewer-v5.19'), /Invalid namespaced release tag/);
    assert.throws(() => parseReleaseTag('v5.19.1'), /Invalid namespaced release tag/);
    assert.throws(() => parseReleaseTag('viewer-v5.19.1-extra'), /Invalid namespaced release tag/);
});

test('Viewer release surfaces and product gitRef must match the tag', async (context) => {
    const root = await makeViewerFixture();
    context.after(() => rm(root, { recursive: true, force: true }));

    assert.deepEqual(await validateReleaseContract({ root, tag: 'viewer-v5.19.1' }), {
        component: 'viewer',
        version: '5.19.1',
        productGitRef: 'abcdef1'
    });
    assert.deepEqual(await validateViewerReleaseContract(root, '5.19.1'), {
        productGitRef: 'abcdef1'
    });
});

test('Viewer release validation rejects package, mirror, index, and gitRef drift', async (context) => {
    const root = await makeViewerFixture();
    context.after(() => rm(root, { recursive: true, force: true }));

    const published = JSON.parse(await readFile(join(root, 'data/version-history.json'), 'utf8'));
    published.current.displayVersion = '5.19.0';
    await writeFile(join(root, 'data/version-history.json'), JSON.stringify(published));

    await assert.rejects(
        validateViewerReleaseContract(root, '5.19.1'),
        /published current displayVersion[\s\S]*exactly mirror/
    );
});
