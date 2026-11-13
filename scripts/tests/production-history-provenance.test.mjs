import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { validateVersionHistories } from '../mcl.mjs';
import {
    PRODUCTION_HISTORY_RECOVERY_PATH,
    PRODUCTION_HISTORY_RECOVERY_URL,
    PRODUCTION_HISTORY_SNAPSHOT_PATH,
    validateProductionHistoryRecovery
} from '../production-history-provenance.mjs';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const manifestBytes = await readFile(join(repoRoot, PRODUCTION_HISTORY_RECOVERY_PATH));
const snapshotBytes = await readFile(join(repoRoot, PRODUCTION_HISTORY_SNAPSHOT_PATH));
const productRef = '47a8d9a155492285a61875594360e503f9e99956';
const candidateRef = 'eca0cb7d3fba8cec7f6101a5a0fd6eacf6f6792c';
const publicSnapshot = 'data/production-history-recovery/production-5.23.1-20261114.json';

function releaseHistory() {
    const history = JSON.parse(snapshotBytes);
    history.productionHistoryRecovery = PRODUCTION_HISTORY_RECOVERY_URL;
    history.current = {
        ...history.current,
        displayVersion: '5.23.2',
        appSemver: '5.23.2',
        date: '2026-11-14',
        gitRef: productRef
    };
    history.documentedThrough = productRef;
    history.entries.push({
        displayVersion: '5.23.2',
        appSemver: '5.23.2',
        date: '2026-11-14',
        type: 'fix',
        scope: 'viewer',
        gitRef: productRef,
        summary: 'Preserve production runtime and restore Apple mobile compatibility',
        trace: {
            changeId: 'MF-T0-20261114-webgpu-compat',
            pullRequest: 'https://github.com/Shuang-su/Metaflow/pull/167'
        }
    });
    history.maintenanceCommits.push({
        gitRef: candidateRef,
        date: '2026-11-13',
        summary: 'Unpublished compatibility candidate incorporated into 5.23.2'
    });
    return history;
}

async function fixture(context) {
    // Nest the fixture in the real checkout so Git can verify the pinned historical
    // baseline and actual recovery commits without inventing replacement objects.
    const parent = join(repoRoot, '.codex-work/tmp');
    await mkdir(parent, { recursive: true });
    const root = await mkdtemp(join(parent, 'production-history-'));
    context.after(() => rm(root, { recursive: true, force: true }));
    const files = [
        [PRODUCTION_HISTORY_RECOVERY_PATH, manifestBytes],
        [PRODUCTION_HISTORY_RECOVERY_URL.slice(1), manifestBytes],
        [PRODUCTION_HISTORY_SNAPSHOT_PATH, snapshotBytes],
        [publicSnapshot, snapshotBytes]
    ];
    for (const [path, bytes] of files) {
        await mkdir(dirname(join(root, path)), { recursive: true });
        await writeFile(join(root, path), bytes);
    }
    return { root, history: releaseHistory() };
}

test('bounded recovery preserves all production records and returns only the four observed refs', async (context) => {
    const { root, history } = await fixture(context);
    const result = await validateProductionHistoryRecovery(root, history);
    assert.equal(result.importedRefs.size, 4);
    assert.equal(result.importedEntryRefs.size, 2);
    assert.ok(!result.importedRefs.has(productRef));
    assert.ok(!result.importedRefs.has(candidateRef));
});

test('ordinary repository history does not acquire a production exemption', async () => {
    const history = JSON.parse(execFileSync('git', [
        'show', 'a76f2708232d9d6acba8a370ecbe7808a2a7052d:metadata/version-history.json'
    ], { cwd: repoRoot, env: { ...process.env, GIT_NO_LAZY_FETCH: '1' } }));
    assert.equal(await validateProductionHistoryRecovery(repoRoot, history), null);
});

const invalidHistories = [
    ['missing provenance link', (history) => delete history.productionHistoryRecovery, /require productionHistoryRecovery/],
    ['removed provenance and all four production-only records', (history) => {
        delete history.productionHistoryRecovery;
        history.entries.splice(133, 2);
        history.maintenanceCommits.splice(74, 2);
    }, /require productionHistoryRecovery/],
    ['arbitrary provenance URL', (history) => {
        history.productionHistoryRecovery = '/data/unreviewed-recovery.json';
    }, /fixed evidence URL/],
    ['deleted published release', (history) => history.entries.splice(133, 1), /preserve every observed production record/],
    ['rewritten imported summary', (history) => {
        history.entries[133].summary = 'An unobserved replacement claim';
    }, /preserve every observed production record/],
    ['fabricated original trace', (history) => {
        history.entries[134].trace = { changeId: 'MF-167', pullRequest: 'https://example.invalid/167' };
    }, /preserve every observed production record/],
    ['rewritten verified repository history', (history) => {
        history.entries[0].gitRef = '0000000';
    }, /preserve every observed production record/],
    ['deleted published maintenance', (history) => history.maintenanceCommits.splice(74, 1), /preserve every observed production record/],
    ['observed-only current SHA', (history) => {
        history.current.gitRef = history.entries[134].gitRef;
        history.documentedThrough = history.current.gitRef;
    }, /current release cannot use an observed-only Git ref/],
    ['an earlier candidate substituted for the first recovery product', (history) => {
        history.current.gitRef = candidateRef;
        history.documentedThrough = candidateRef;
        history.entries.at(-1).gitRef = candidateRef;
        history.maintenanceCommits.pop();
    }, /first recovery release must retain the verified recovery product commit/],
    ['missing new release date', (history) => delete history.entries.at(-1).date, /valid ISO calendar date/],
    ['invalid new release calendar date', (history) => {
        history.entries.at(-1).date = '2026-11-31';
    }, /valid ISO calendar date/],
    ['backdating a new release before the trace cutoff', (history) => {
        history.entries.at(-1).date = '2026-08-08';
        delete history.entries.at(-1).trace;
    }, /cannot predate the observed production version/],
    ['missing new release object', (history) => {
        const next = { ...history.entries.at(-1), displayVersion: '5.23.3', appSemver: '5.23.3', gitRef: '0'.repeat(40) };
        history.entries.push(next);
        history.current = { ...history.current, displayVersion: '5.23.3', appSemver: '5.23.3', gitRef: next.gitRef };
        history.documentedThrough = next.gitRef;
    }, /requires an existing Git commit/],
    ['missing new maintenance object', (history) => {
        history.maintenanceCommits.at(-1).gitRef = '1'.repeat(40);
    }, /requires an existing Git commit/],
    ['reused observed SHA in a new record', (history) => {
        history.maintenanceCommits.push({ gitRef: history.entries[133].gitRef, summary: 'Not another observation' });
    }, /history refs must remain unique/]
];

test('later releases can reference another real commit while retaining the first recovery release', async (context) => {
    const { root, history } = await fixture(context);
    const rollbackRef = 'b1d15b1e5272557230d789c58e68e145d5367edb';
    const later = {
        ...history.entries.at(-1),
        displayVersion: '5.23.3',
        appSemver: '5.23.3',
        date: '2026-11-15',
        gitRef: rollbackRef,
        summary: 'Test fixture: an explicitly recorded later rollback to a real ancestor'
    };
    history.entries.push(later);
    history.current = { ...history.current, displayVersion: later.displayVersion, appSemver: later.appSemver, gitRef: rollbackRef };
    history.documentedThrough = rollbackRef;
    const result = await validateProductionHistoryRecovery(root, history);
    assert.ok(result.newEntryRefs.has(rollbackRef));
    assert.equal(history.entries[135].gitRef, productRef);
});

for (const [name, mutate, expected] of invalidHistories) {
    test(`recovery rejects ${name}`, async (context) => {
        const { root, history } = await fixture(context);
        mutate(history);
        await assert.rejects(validateProductionHistoryRecovery(root, history), expected);
    });
}

test('adding a fifth imported-ref exemption changes the pinned manifest and is rejected', async (context) => {
    const { root, history } = await fixture(context);
    const manifest = JSON.parse(manifestBytes);
    manifest.imports.push({ collection: 'entries', index: 135, gitRef: productRef, gitObjectStatus: 'unavailable' });
    const bytes = JSON.stringify(manifest);
    await writeFile(join(root, PRODUCTION_HISTORY_RECOVERY_PATH), bytes);
    await writeFile(join(root, PRODUCTION_HISTORY_RECOVERY_URL.slice(1)), bytes);
    await assert.rejects(validateProductionHistoryRecovery(root, history), /manifest must match reviewed evidence/);
});

test('changing both snapshot copies still fails the pinned production snapshot hash', async (context) => {
    const { root, history } = await fixture(context);
    const snapshot = JSON.parse(snapshotBytes);
    snapshot.entries[133].summary = 'Changed archive';
    const bytes = JSON.stringify(snapshot);
    await writeFile(join(root, PRODUCTION_HISTORY_SNAPSHOT_PATH), bytes);
    await writeFile(join(root, publicSnapshot), bytes);
    await assert.rejects(validateProductionHistoryRecovery(root, history), /snapshot hash changed/);
});

for (const [path, expected] of [
    [PRODUCTION_HISTORY_RECOVERY_URL.slice(1), /public recovery manifest must exactly mirror/],
    [publicSnapshot, /public production snapshot must exactly mirror/]
]) {
    test(`recovery rejects a drifting public evidence file: ${path}`, async (context) => {
        const { root, history } = await fixture(context);
        await writeFile(join(root, path), '{}\n');
        await assert.rejects(validateProductionHistoryRecovery(root, history), expected);
    });
}

test('MCL uses the same bounded evidence while retaining trace requirements for the new release', async (context) => {
    const { root, history } = await fixture(context);
    await writeFile(join(root, 'metadata/version-history.json'), JSON.stringify(history));
    await writeFile(join(root, 'metadata/editor-version-history.json'), JSON.stringify({
        schemaVersion: '1.1', current: {}, entries: []
    }));
    // Existing traces refer to checkout documents. Use their real repository paths
    // rather than creating fabricated historical evidence inside the fixture.
    for (const entry of history.entries) {
        if (!entry.trace) continue;
        for (const key of ['proposal', 'spec', 'plan', 'evidence', 'completionManifest', 'completionDossier']) {
            const value = entry.trace[key];
            if (typeof value === 'string' && !value.startsWith('http')) {
                await mkdir(dirname(join(root, value)), { recursive: true });
                await writeFile(join(root, value), await readFile(join(repoRoot, value)));
            }
        }
    }
    await validateVersionHistories(root);
    delete history.entries.at(-1).trace;
    await writeFile(join(root, 'metadata/version-history.json'), JSON.stringify(history));
    await assert.rejects(validateVersionHistories(root), /post-MCL entry 5\.23\.2 requires trace/);
});
