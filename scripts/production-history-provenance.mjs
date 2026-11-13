import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const PRODUCTION_HISTORY_RECOVERY_URL = '/data/production-history-recovery.json';
export const PRODUCTION_HISTORY_RECOVERY_PATH = 'metadata/production-history-recovery.json';
export const PRODUCTION_HISTORY_SNAPSHOT_PATH =
    'metadata/production-history-recovery/production-5.23.1-20261114.json';

// A single, reviewed production observation, not a general missing-commit exemption.
// Changing this evidence requires an explicit new provenance review.
const MANIFEST_SHA256 = 'cc3e4e0c48d0183eaae31123f70534976aa005275d63c0387fe1dea7fd4d81a6';
const RECOVERY_RELEASE = '5.23.2';
const IMPORTED_REFS = new Set([
    '1074d34f9db25729e9d6abf14d1fb13f084d1b22',
    '3c95767645a506dbe311d3ecce59380c011fe780',
    '3aa6ed6',
    'f4520e159c38cc7b775e329d66929bc6f8723f92'
]);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function git(root, args) {
    return execFileSync('git', args, {
        cwd: root,
        env: { ...process.env, GIT_NO_LAZY_FETCH: '1' },
        stdio: ['ignore', 'pipe', 'pipe']
    });
}

function assertRealCommit(root, ref) {
    assert.match(ref ?? '', /^[0-9a-f]{7,40}$/, 'release references must be hexadecimal Git refs');
    try {
        git(root, ['cat-file', '-e', `${ref}^{commit}`]);
    } catch {
        assert.fail(`${ref} requires an existing Git commit; production evidence cannot prove a new release`);
    }
    try {
        git(root, ['merge-base', '--is-ancestor', ref, 'HEAD']);
    } catch {
        const tags = git(root, ['tag', '--contains', ref, '--list', 'viewer-v*']).toString().trim();
        assert.ok(tags, `${ref} must be in HEAD or a preserved Viewer release tag`);
    }
}

function compareSemver(left, right) {
    const parse = (value) => {
        assert.match(value ?? '', /^\d+\.\d+\.\d+$/, 'recovery current must use full SemVer');
        return value.split('.').map(Number);
    };
    const a = parse(left);
    const b = parse(right);
    for (let index = 0; index < 3; index++) {
        if (a[index] !== b[index]) return a[index] - b[index];
    }
    return 0;
}

/**
 * Validate the four immutable production-only records and their published evidence.
 * Their original gitRef values remain claims in the observed production snapshot.
 * Existing repository history and every new/current release retain Git verification.
 * A null result means no production-history import has been requested.
 */
export async function validateProductionHistoryRecovery(root, history) {
    const records = [...(history.entries ?? []), ...(history.maintenanceCommits ?? [])];
    if (history.productionHistoryRecovery === undefined) {
        const version = history.current?.displayVersion;
        const requiresRecovery = /^\d+\.\d+\.\d+$/.test(version ?? '') && compareSemver(version, RECOVERY_RELEASE) >= 0;
        assert.ok(
            !requiresRecovery && !records.some((entry) => IMPORTED_REFS.has(entry.gitRef)),
            'observed production records and releases from 5.23.2 require productionHistoryRecovery evidence'
        );
        return null;
    }
    assert.equal(
        history.productionHistoryRecovery,
        PRODUCTION_HISTORY_RECOVERY_URL,
        'productionHistoryRecovery must reference the reviewed, fixed evidence URL'
    );

    const [manifestBytes, publishedManifest, snapshotBytes, publishedSnapshot] = await Promise.all([
        readFile(resolve(root, PRODUCTION_HISTORY_RECOVERY_PATH)),
        readFile(resolve(root, PRODUCTION_HISTORY_RECOVERY_URL.slice(1))),
        readFile(resolve(root, PRODUCTION_HISTORY_SNAPSHOT_PATH)),
        readFile(resolve(root, 'data/production-history-recovery/production-5.23.1-20261114.json'))
    ]);
    assert.equal(sha256(manifestBytes), MANIFEST_SHA256, 'production recovery manifest must match reviewed evidence');
    assert.ok(manifestBytes.equals(publishedManifest), 'public recovery manifest must exactly mirror its source');
    const manifest = JSON.parse(manifestBytes);
    assert.equal(sha256(snapshotBytes), manifest.snapshot.sha256, 'production history snapshot hash changed');
    assert.equal(snapshotBytes.length, manifest.snapshot.bytes, 'production history snapshot size changed');
    assert.ok(snapshotBytes.equals(publishedSnapshot), 'public production snapshot must exactly mirror its source');
    const snapshot = JSON.parse(snapshotBytes);

    const baselineBytes = git(root, ['show', `${manifest.repositoryBaseline.commit}:${manifest.repositoryBaseline.path}`]);
    assert.equal(sha256(baselineBytes), manifest.repositoryBaseline.sha256, 'repository history baseline changed');
    const baseline = JSON.parse(baselineBytes);
    assertRealCommit(root, manifest.repositoryBaseline.commit);
    assertRealCommit(root, manifest.recovery.productCommit);

    for (const collection of ['entries', 'maintenanceCommits']) {
        assert.equal(baseline[collection].length, manifest.repositoryBaseline[collection]);
        assert.equal(snapshot[collection].length, manifest.snapshot[collection]);
        assert.deepEqual(
            snapshot[collection].slice(0, baseline[collection].length),
            baseline[collection],
            `production ${collection} must preserve the verified repository prefix`
        );
        assert.ok(Array.isArray(history[collection]), `${collection} must remain an array`);
        assert.deepEqual(
            history[collection].slice(0, snapshot[collection].length),
            snapshot[collection],
            `${collection} must preserve every observed production record unchanged and in order`
        );
    }
    for (const [key, value] of Object.entries(snapshot)) {
        if (['current', 'documentedThrough', 'entries', 'maintenanceCommits'].includes(key)) continue;
        assert.deepEqual(history[key], value, `recovery must preserve production history field ${key}`);
    }
    assert.deepEqual(new Set(manifest.imports.map((item) => item.gitRef)), IMPORTED_REFS);
    for (const item of manifest.imports) {
        assert.equal(snapshot[item.collection][item.index].gitRef, item.gitRef);
        if (item.displayVersion) assert.equal(snapshot[item.collection][item.index].displayVersion, item.displayVersion);
    }
    assert.equal(new Set(records.map((entry) => entry.gitRef)).size, records.length, 'history refs must remain unique');

    const newEntries = history.entries.slice(snapshot.entries.length);
    const firstRecoveryRelease = newEntries[0];
    assert.equal(firstRecoveryRelease?.displayVersion, RECOVERY_RELEASE, 'first recovery release must remain 5.23.2');
    assert.equal(firstRecoveryRelease?.appSemver, RECOVERY_RELEASE);
    assert.equal(
        firstRecoveryRelease?.gitRef,
        manifest.recovery.productCommit,
        'first recovery release must retain the verified recovery product commit'
    );
    for (const entry of newEntries) {
        const date = typeof entry.date === 'string' ? new Date(`${entry.date}T00:00:00Z`) : new Date(NaN);
        assert.ok(
            /^\d{4}-\d{2}-\d{2}$/.test(entry.date ?? '') && Number.isFinite(date.valueOf()) &&
                date.toISOString().slice(0, 10) === entry.date,
            'new release entries require a valid ISO calendar date'
        );
        assert.ok(entry.date >= snapshot.current.date, 'new release entries cannot predate the observed production version');
    }

    const current = history.current;
    assert.ok(current && !IMPORTED_REFS.has(current.gitRef), 'current release cannot use an observed-only Git ref');
    assert.ok(
        compareSemver(current.displayVersion, snapshot.current.displayVersion) > 0,
        'current release must follow the observed production version'
    );
    assert.equal(current.appSemver, current.displayVersion);
    assert.equal(history.documentedThrough, current.gitRef);
    const latest = history.entries.at(-1);
    assert.equal(latest?.displayVersion, current.displayVersion, 'current must identify the new final release entry');
    assert.equal(latest?.appSemver, current.appSemver);
    assert.equal(latest?.gitRef, current.gitRef, 'current and final release must reference the same real commit');

    const newRecords = [
        ...newEntries,
        ...history.maintenanceCommits.slice(snapshot.maintenanceCommits.length)
    ];
    for (const ref of new Set([current.gitRef, ...newRecords.map((entry) => entry.gitRef)])) {
        assert.ok(!IMPORTED_REFS.has(ref), 'new records cannot reuse an observed-only Git ref');
        assertRealCommit(root, ref);
    }
    return {
        importedRefs: new Set(IMPORTED_REFS),
        importedEntryRefs: new Set(manifest.imports.filter((item) => item.collection === 'entries').map((item) => item.gitRef)),
        newEntryRefs: new Set(newEntries.map((entry) => entry.gitRef))
    };
}
