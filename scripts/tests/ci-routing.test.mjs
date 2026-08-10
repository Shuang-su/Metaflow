import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
    CHECK_IDS,
    evaluateGate,
    parseNameStatus,
    routePaths,
    validateComponentRegistry,
    validateRoutingManifest
} from '../ci-routing.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const registry = validateComponentRegistry(
    JSON.parse(await readFile(join(root, 'metadata/components.json'), 'utf8'))
);
const routing = validateRoutingManifest(
    JSON.parse(await readFile(join(root, 'metadata/ci-routing.json'), 'utf8'))
);

function route(paths, overrides = {}) {
    return routePaths(paths, {
        ownershipRegistries: overrides.ownershipRegistries || [registry],
        routingManifests: overrides.routingManifests || [routing]
    });
}

test('pure documentation selects only documentation checks', () => {
    const result = route(['docs/guides/viewer.md', 'README.md']);
    assert.deepEqual(result.checks, ['docs']);
    assert.deepEqual(result.unowned, []);
    assert.deepEqual(result.unrouted, []);
    assert.deepEqual(Object.keys(result.ownership), ['platform']);
});

test('documentation and governance changes take the union without product jobs', () => {
    const result = route(['docs/guides/viewer.md', '.github/pull_request_template.md']);
    assert.deepEqual(result.checks, ['docs', 'governance']);
    assert.equal(result.checks.includes('viewer'), false);
    assert.equal(result.checks.includes('editor'), false);
    assert.equal(result.checks.includes('codeql'), false);
});

test('Viewer, Editor, data, Design, and reference source routes stay independent', () => {
    assert.deepEqual(route(['metaflow-viewer/src/main.ts']).checks, ['viewer', 'codeql']);
    assert.deepEqual(route(['supersplat-v2.28.0/src/index.ts']).checks, ['editor', 'codeql']);
    assert.deepEqual(route(['data/Shenzhen/example/settings.json']).checks, ['viewer', 'data']);
    assert.deepEqual(route(['aave-liquid-glass-lab/src/App.tsx']).checks, ['design', 'codeql']);
    assert.deepEqual(
        route(['references/supersplat-viewer-v1.18.2/src/index.ts']).checks,
        ['governance', 'reference']
    );
    assert.deepEqual(
        route(['references/splat-transform-v3.2.0/README.md']).checks,
        ['governance', 'reference']
    );
});

test('dependency routes add review only for active products, never immutable references', () => {
    assert.deepEqual(
        route(['metaflow-viewer/package-lock.json']).checks,
        ['viewer', 'dependency-review']
    );
    assert.deepEqual(
        route(['supersplat-v2.28.0/package.json']).checks,
        ['editor', 'dependency-review']
    );
    assert.deepEqual(
        route(['references/supersplat-viewer-v1.18.2/package-lock.json']).checks,
        ['governance', 'reference']
    );
});

test('release configuration selects governance, affected products, and static release smoke', () => {
    const result = route(['netlify.toml']);
    assert.deepEqual(result.checks, ['governance', 'viewer', 'editor', 'release']);
    assert.equal(result.checks.includes('codeql'), false);
});

test('base and head manifests are unioned when a routing bypass is attempted', () => {
    const headRegistry = structuredClone(registry);
    headRegistry.components.find((component) => component.id === 'viewer').ownedPaths = [
        'metadata/version-history.json'
    ];
    const headRouting = structuredClone(routing);
    headRouting.routes.find((item) => item.id === 'viewer-source').includePaths = [
        'metadata/version-history.json'
    ];

    const result = route(
        ['metadata/ci-routing.json', 'metaflow-viewer/src/main.ts'],
        {
            ownershipRegistries: [headRegistry, registry],
            routingManifests: [headRouting, routing]
        }
    );

    assert.deepEqual(result.unowned, []);
    assert.deepEqual(result.unrouted, []);
    assert.ok(result.checks.includes('governance'));
    assert.ok(result.checks.includes('viewer'));
    assert.ok(result.checks.includes('codeql'));
});

test('unknown paths fail closed as both unowned and unrouted', () => {
    const result = route(['future-product/src/index.ts']);
    assert.deepEqual(result.unowned, ['future-product/src/index.ts']);
    assert.deepEqual(result.unrouted, ['future-product/src/index.ts']);
    assert.deepEqual(result.checks, []);
});

test('name-status parsing retains added, modified, deleted, and both rename paths', () => {
    const changes = parseNameStatus(
        'A\0docs/new.md\0M\0README.md\0D\0docs/old.md\0R100\0old/path.ts\0new/path.ts\0'
    );
    assert.deepEqual(changes, [
        { status: 'A', paths: ['docs/new.md'] },
        { status: 'M', paths: ['README.md'] },
        { status: 'D', paths: ['docs/old.md'] },
        { status: 'R100', paths: ['old/path.ts', 'new/path.ts'] }
    ]);
});

test('renamed and deleted paths retain checks from their original locations', () => {
    const changes = parseNameStatus(
        'R100\0metaflow-viewer/src/old.ts\0docs/new-name.md\0D\0references/supersplat-viewer-v1.18.2/src/old.ts\0'
    );
    const result = route(changes.flatMap((change) => change.paths));
    assert.deepEqual(result.checks, ['docs', 'governance', 'viewer', 'reference', 'codeql']);
});

test('the route CLI exits non-zero for an unknown path', () => {
    const result = spawnSync(
        process.execPath,
        ['scripts/ci-routing.mjs', 'route', 'future-product/src/index.ts'],
        { cwd: root, encoding: 'utf8' }
    );
    assert.equal(result.status, 2);
    assert.deepEqual(JSON.parse(result.stdout).unrouted, ['future-product/src/index.ts']);
});

test('mixed components select the exact union and leave unrelated products out', () => {
    const result = route([
        'metaflow-viewer/src/main.ts',
        'supersplat-v2.28.0/package-lock.json',
        'docs/guides/configuration.md'
    ]);
    assert.deepEqual(result.checks, ['docs', 'viewer', 'editor', 'codeql', 'dependency-review']);
    assert.equal(result.checks.includes('design'), false);
    assert.equal(result.checks.includes('data'), false);
    assert.equal(result.checks.includes('reference'), false);
});

test('the manual summary requires every selected job and rejects unselected work', () => {
    for (const selected of [
        ['docs'],
        ['governance'],
        ['viewer', 'codeql'],
        ['editor', 'dependency-review'],
        ['design'],
        ['data', 'viewer'],
        ['reference'],
        ['release', 'governance', 'viewer', 'editor']
    ]) {
        const expectedSelected = selected.filter((check) => check !== 'dependency-review');
        const results = Object.fromEntries(CHECK_IDS.map((check) => [
            check,
            expectedSelected.includes(check) ? 'success' : 'skipped'
        ]));
        const outcome = evaluateGate({
            selectedChecks: selected,
            results,
            eventName: 'workflow_dispatch',
            classifyResult: 'success'
        });
        assert.equal(outcome.ok, true, outcome.errors.join('; '));
    }

    const overrun = evaluateGate({
        selectedChecks: ['docs'],
        results: Object.fromEntries(CHECK_IDS.map((check) => [
            check,
            check === 'docs' || check === 'viewer' ? 'success' : 'skipped'
        ])),
        eventName: 'workflow_dispatch',
        classifyResult: 'success'
    });
    assert.equal(overrun.ok, false);
    assert.ok(overrun.errors.some((error) => error.includes('viewer=success, expected skipped')));

    const manualDependency = evaluateGate({
        selectedChecks: ['dependency-review'],
        results: Object.fromEntries(CHECK_IDS.map((check) => [check, 'skipped'])),
        eventName: 'workflow_dispatch',
        classifyResult: 'success'
    });
    assert.equal(manualDependency.ok, true);
});

test('every tracked or proposed repository path is owned and routed', () => {
    const paths = execFileSync(
        'git',
        ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
        { cwd: root, encoding: 'utf8' }
    )
        .split('\0')
        .filter(Boolean);
    const result = route(paths);
    assert.deepEqual(result.unowned, []);
    assert.deepEqual(result.unrouted, []);
});
