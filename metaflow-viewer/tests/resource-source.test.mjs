import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { publishedStudioIndex } from '../../scripts/netlify-release-git.mjs';
import ts from 'typescript';

const loadResourceSourceModule = async () => {
    const source = await readFile(new URL('../src/resource-source.ts', import.meta.url), 'utf8');
    const { outputText } = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022
        }
    });
    const encoded = Buffer.from(outputText).toString('base64');
    return import(`data:text/javascript;base64,${encoded}`);
};

const createBound = () => ({ min: [-1, -2, -3], max: [1, 2, 3] });
const validManifest = () => ({
    lodLevels: 2,
    filenames: ['0/meta.json', '1/meta.json'],
    tree: {
        bound: createBound(),
        children: [
            {
                bound: createBound(),
                lods: {
                    0: { file: 0, offset: 0, count: 10 },
                    1: { file: 1, offset: 0, count: 5 }
                }
            }
        ]
    }
});

test('primary source identity matches PlayCanvas parser selection', async () => {
    const { classifyPrimarySource, getResourceComposition } = await loadResourceSourceModule();

    assert.equal(classifyPrimarySource('/asset/lod-meta.json'), 'streaming-lod');
    assert.equal(classifyPrimarySource('/asset/LOD-META.JSON?cache=1'), 'streaming-lod');
    assert.equal(classifyPrimarySource('/asset/model.sog'), 'sog-bundle');
    assert.equal(classifyPrimarySource('/asset/meta.json'), 'sog-meta');
    assert.equal(classifyPrimarySource('/asset/model.compressed.ply'), 'ply');
    assert.equal(classifyPrimarySource('/asset/model.spz'), 'unsupported');
    assert.equal(getResourceComposition(), 'subject-only');
    assert.equal(getResourceComposition('/asset/environment.ply'), 'subject-with-environment');
});

test('streaming manifest validator accepts the engine contract', async () => {
    const { validateStreamingLodManifest } = await loadResourceSourceModule();
    assert.doesNotThrow(() => validateStreamingLodManifest(validManifest()));
});

test('streaming manifest validator rejects malformed bounds and topology', async () => {
    const { validateStreamingLodManifest } = await loadResourceSourceModule();

    const malformedBounds = validManifest();
    malformedBounds.tree.bound.min = [2, 0, 0];
    assert.throws(() => validateStreamingLodManifest(malformedBounds), /must not exceed/);

    const emptyTree = validManifest();
    emptyTree.tree.children = [];
    assert.throws(() => validateStreamingLodManifest(emptyTree), /non-empty children or lods/);

    const missingFilenames = validManifest();
    missingFilenames.filenames = [];
    assert.throws(() => validateStreamingLodManifest(missingFilenames), /filenames must be a non-empty array/);
});

test('streaming manifest validator rejects invalid file ranges and byte spans', async () => {
    const { validateStreamingLodManifest } = await loadResourceSourceModule();

    const invalidFile = validManifest();
    invalidFile.tree.children[0].lods[1].file = 2;
    assert.throws(() => validateStreamingLodManifest(invalidFile), /outside filenames/);

    const invalidLevel = validManifest();
    invalidLevel.tree.children[0].lods[2] = { file: 1, offset: 0, count: 1 };
    assert.throws(() => validateStreamingLodManifest(invalidLevel), /exceeds lodLevels/);

    const negativeOffset = validManifest();
    negativeOffset.tree.children[0].lods[0].offset = -1;
    assert.throws(() => validateStreamingLodManifest(negativeOffset), /offset must be a non-negative integer/);

    const fractionalCount = validManifest();
    fractionalCount.tree.children[0].lods[0].count = 1.5;
    assert.throws(() => validateStreamingLodManifest(fractionalCount), /count must be a non-negative integer/);
});

test('index generator only treats lod-meta.json as a streaming entry', async () => {
    const originalBuild = '401bfca27b5add08c11aae69a11a3ded9d6b0b79';
    const original = JSON.parse(execFileSync('git', ['show', `${originalBuild}:data/index.json`], {
        cwd: new URL('../../', import.meta.url), encoding: 'utf8'
    }));
    const [generator, index, hosted] = await Promise.all([
        readFile(new URL('../../scripts/generate_index.py', import.meta.url), 'utf8'),
        readFile(new URL('../../data/index.json', import.meta.url), 'utf8').then(JSON.parse),
        readFile(new URL('../../metadata/shenzhen-hosted-scenes.json', import.meta.url), 'utf8').then(JSON.parse)
    ]);

    const streamingFinder = generator.slice(
        generator.indexOf('def find_streaming_model_file'),
        generator.indexOf('def normalize_subcategory_key')
    );
    assert.match(streamingFinder, /folder_path \/ "lod-meta\.json"/);
    assert.doesNotMatch(streamingFinder, /"meta\.json"/);

    const routes = (entries) => entries.map(entry => entry.route).sort();
    const streamResources = (catalog) => catalog.resources.filter(({ files }) => files.model.endsWith('/lod-meta.json'));
    const sogResources = (catalog) => catalog.resources.filter(({ files }) => files.model.endsWith('.sog'));
    assert.equal(original.resources.length, 100);
    assert.equal(streamResources(original).length, 9);
    assert.equal(sogResources(original).length, 91);
    assert.equal(sogResources(original).filter(({ files }) => files.environment).length, 54);
    assert.equal(sogResources(original).filter(({ files }) => !files.environment).length, 37);

    const addedStreamRoutes = [
        '/acg/j04/ggc', '/acg/j04/itasha', '/szmg/广电大厦6楼演播室', '/sztu/c4-hangpai',
        '/sztu/c2-lib', '/sztu/b1-sdi-206', '/sztu/d1-utl-107'
    ];
    const hostedRoutes = routes(hosted);
    assert.deepEqual(hostedRoutes, [
        '/shenzhen/APECMediaCenter',
        '/shenzhen/huafa-ice-and-snow-world',
        '/shenzhen/nanhai-e-cool-building-3',
        '/shenzhen/shenzhen-civic-center',
        '/shenzhen/shenzhen-university-yuehai-campus'
    ]);
    assert.deepEqual(routes(index.resources), [...routes(original.resources), ...hostedRoutes].sort());
    const legacyCatalog = { resources: index.resources.filter(({ route }) => !hostedRoutes.includes(route)) };
    assert.deepEqual(routes(streamResources(legacyCatalog)), [...routes(streamResources(original)), ...addedStreamRoutes].sort());
    assert.equal(sogResources(legacyCatalog).length, 84);
    assert.equal(sogResources(legacyCatalog).filter(({ files }) => files.environment).length, 51);
    assert.equal(sogResources(legacyCatalog).filter(({ files }) => !files.environment).length, 33);
    for (const entry of hosted) {
        const actual = index.resources.find(({ route }) => route === entry.route);
        assert.equal(actual.files.model, entry.files.model, entry.route);
        assert.equal(actual.files.settings, entry.files.settings, entry.route);
    }
    assert.equal(index.resources.filter(({ files }) => files.model.endsWith('/meta.json')).length, 0);
    for (const route of addedStreamRoutes) {
        const previous = original.resources.find(asset => asset.route === route);
        const candidate = index.resources.find(asset => asset.route === route);
        assert.equal(candidate.files.settings, previous.files.settings, route);
        assert.equal(candidate.files.environment, previous.files.environment, route);
    }

    const dualSourceRoutes = [
        '/acg/fireflyfes38/cyrene',
        '/acg/fireflyfes38/diaochan',
        '/acg/fireflyfes38/fursuit',
        '/acg/fireflyfes38/nangong-yu',
        '/acg/fireflyfes38/remielle-dan',
        '/acg/fireflyfes38/remielle-dan-b'
    ];
    for (const route of dualSourceRoutes) {
        const resource = index.resources.find((candidate) => candidate.route === route);
        assert.ok(resource, `missing dual-source route ${route}`);
        assert.match(resource.files.model, /\.sog$/, `${route} must retain its selected SOG entry`);
    }
});
test('APEC adds the canonical streamed scene and preserves the 5.26.0 catalogue in order', async () => {
    const previous = publishedStudioIndex(fileURLToPath(new URL('../../', import.meta.url)));
    const [index, hosted] = await Promise.all([
        readFile(new URL('../../data/index.json', import.meta.url), 'utf8').then(JSON.parse),
        readFile(new URL('../../metadata/shenzhen-hosted-scenes.json', import.meta.url), 'utf8').then(JSON.parse)
    ]);

    assert.equal(previous.resources.length, 104);
    assert.deepEqual(index.resources.slice(0, previous.resources.length), previous.resources);
    const added = index.resources.slice(previous.resources.length);
    assert.equal(added.length, 1);
    assert.equal(index.totalResources, index.resources.length);

    const [apec] = added;
    assert.equal(apec.id, 'apec-media-center-2026');
    assert.equal(apec.route, '/shenzhen/APECMediaCenter');
    assert.deepEqual(apec.aliases, ['/shenzhen/apecmediacenter']);
    assert.equal(apec.files.model, 'Shenzhen/apec-media-center-2026-v1/streamed/lod-meta.json');
    assert.deepEqual(apec, hosted.find(({ id }) => id === apec.id));
});
