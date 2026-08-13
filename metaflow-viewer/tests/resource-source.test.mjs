import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
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
    const [generator, index] = await Promise.all([
        readFile(new URL('../../scripts/generate_index.py', import.meta.url), 'utf8'),
        readFile(new URL('../../data/index.json', import.meta.url), 'utf8').then(JSON.parse)
    ]);

    const streamingFinder = generator.slice(
        generator.indexOf('def find_streaming_model_file'),
        generator.indexOf('def normalize_subcategory_key')
    );
    assert.match(streamingFinder, /folder_path \/ "lod-meta\.json"/);
    assert.doesNotMatch(streamingFinder, /"meta\.json"/);

    assert.equal(index.resources.length, 87);
    assert.equal(index.resources.filter((resource) => resource.files.model.endsWith('/lod-meta.json')).length, 9);
    assert.equal(index.resources.filter((resource) => resource.files.model.endsWith('.sog')).length, 78);
    assert.equal(index.resources.filter((resource) => resource.files.model.endsWith('/meta.json')).length, 0);

    const sogResources = index.resources.filter((resource) => resource.files.model.endsWith('.sog'));
    assert.equal(sogResources.filter((resource) => resource.files.environment).length, 44);
    assert.equal(sogResources.filter((resource) => !resource.files.environment).length, 34);

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
