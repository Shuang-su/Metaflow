#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { lstat, readFile, readlink, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const defaultRoot = resolve(scriptDirectory, '..');
const sha1Pattern = /^[0-9a-f]{40}$/;
const sha256Pattern = /^[0-9a-f]{64}$/;

const gitObjectHash = (type, data) => {
    const body = Buffer.isBuffer(data) ? data : Buffer.from(data);
    return createHash('sha1')
        .update(Buffer.from(`${type} ${body.length}\0`))
        .update(body)
        .digest('hex');
};

const gitSortKey = (name, directory) => Buffer.from(`${name}${directory ? '/' : ''}`);

const compareBuffers = (left, right) => Buffer.compare(left, right);

async function hashDirectory(directory, root, records) {
    const children = [];
    for (const name of await readdir(directory)) {
        const absolutePath = join(directory, name);
        const stats = await lstat(absolutePath);
        const isDirectory = stats.isDirectory();
        children.push({ name, absolutePath, stats, isDirectory });
    }
    children.sort((left, right) => compareBuffers(
        gitSortKey(left.name, left.isDirectory),
        gitSortKey(right.name, right.isDirectory)
    ));

    const treeParts = [];
    for (const child of children) {
        let mode;
        let objectId;
        if (child.isDirectory) {
            mode = '40000';
            objectId = await hashDirectory(child.absolutePath, root, records);
        } else if (child.stats.isSymbolicLink()) {
            mode = '120000';
            objectId = gitObjectHash('blob', Buffer.from(await readlink(child.absolutePath)));
            records.push({
                mode,
                blob: objectId,
                path: relative(root, child.absolutePath).split(sep).join('/')
            });
        } else if (child.stats.isFile()) {
            mode = child.stats.mode & 0o111 ? '100755' : '100644';
            objectId = gitObjectHash('blob', await readFile(child.absolutePath));
            records.push({
                mode,
                blob: objectId,
                path: relative(root, child.absolutePath).split(sep).join('/')
            });
        } else {
            throw new Error(`unsupported filesystem entry: ${child.absolutePath}`);
        }
        treeParts.push(Buffer.concat([
            Buffer.from(`${mode} ${child.name}\0`),
            Buffer.from(objectId, 'hex')
        ]));
    }

    return gitObjectHash('tree', Buffer.concat(treeParts));
}

export async function computeSnapshotIdentity(snapshotPath) {
    const absolutePath = resolve(snapshotPath);
    const records = [];
    const tree = await hashDirectory(absolutePath, absolutePath, records);
    const canonical = records
        .map(({ mode, blob, path }) => `${mode} ${blob}\t${path}\n`)
        .sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)))
        .join('');
    records.sort((left, right) => Buffer.compare(Buffer.from(left.path), Buffer.from(right.path)));
    const canonicalTreeSha256 = createHash('sha256').update(canonical).digest('hex');
    return {
        tree,
        fileCount: records.length,
        canonicalTreeSha256,
        records
    };
}

const ensureInsideRoot = (root, target, label) => {
    const relativePath = relative(root, target);
    if (relativePath.startsWith('..') || relativePath === '..' || relativePath.startsWith(`..${sep}`)) {
        throw new Error(`${label} escapes repository root`);
    }
};

export async function validateSnapshot(root, snapshot) {
    for (const field of ['id', 'path', 'kind', 'repository', 'tag', 'tagObject', 'commit', 'tree', 'canonicalTreeSha256', 'license']) {
        if (typeof snapshot[field] !== 'string' || snapshot[field].length === 0) {
            throw new Error(`${snapshot.id || '<unknown>'}: missing ${field}`);
        }
    }
    if (!sha1Pattern.test(snapshot.tagObject) || !sha1Pattern.test(snapshot.commit) || !sha1Pattern.test(snapshot.tree)) {
        throw new Error(`${snapshot.id}: invalid upstream Git identity`);
    }
    if (!sha256Pattern.test(snapshot.canonicalTreeSha256)) {
        throw new Error(`${snapshot.id}: invalid canonicalTreeSha256`);
    }
    if (!Number.isInteger(snapshot.fileCount) || snapshot.fileCount < 1) {
        throw new Error(`${snapshot.id}: invalid fileCount`);
    }
    if (snapshot.mutable !== false) {
        throw new Error(`${snapshot.id}: reference snapshot must set mutable to false`);
    }

    const absolutePath = resolve(root, snapshot.path);
    ensureInsideRoot(root, absolutePath, `${snapshot.id}.path`);
    const actual = await computeSnapshotIdentity(absolutePath);
    const errors = [];
    if (actual.tree !== snapshot.tree) {
        errors.push(`tree expected ${snapshot.tree}, got ${actual.tree}`);
    }
    if (actual.fileCount !== snapshot.fileCount) {
        errors.push(`fileCount expected ${snapshot.fileCount}, got ${actual.fileCount}`);
    }
    if (actual.canonicalTreeSha256 !== snapshot.canonicalTreeSha256) {
        errors.push(`canonicalTreeSha256 expected ${snapshot.canonicalTreeSha256}, got ${actual.canonicalTreeSha256}`);
    }
    if (errors.length > 0) {
        throw new Error(`${snapshot.id}: ${errors.join('; ')}`);
    }
    return actual;
}

export async function validateRegistry(root = defaultRoot, registryPath = join(root, 'metadata/reference-snapshots.json')) {
    const registry = JSON.parse(await readFile(registryPath, 'utf8'));
    if (registry.schemaVersion !== '1.0' || !Array.isArray(registry.snapshots)) {
        throw new Error('metadata/reference-snapshots.json must use schemaVersion 1.0 and snapshots[]');
    }
    const ids = new Set();
    const paths = new Set();
    const results = [];
    for (const snapshot of registry.snapshots) {
        if (ids.has(snapshot.id)) throw new Error(`duplicate snapshot id: ${snapshot.id}`);
        if (paths.has(snapshot.path)) throw new Error(`duplicate snapshot path: ${snapshot.path}`);
        ids.add(snapshot.id);
        paths.add(snapshot.path);
        const actual = await validateSnapshot(root, snapshot);
        results.push({
            id: snapshot.id,
            path: snapshot.path,
            tagObject: snapshot.tagObject,
            commit: snapshot.commit,
            tree: actual.tree,
            fileCount: actual.fileCount,
            canonicalTreeSha256: actual.canonicalTreeSha256
        });
    }
    return results;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const results = await validateRegistry();
        process.stdout.write(`${JSON.stringify({ ok: true, snapshots: results }, null, 2)}\n`);
    } catch (error) {
        process.stderr.write(`Reference snapshot validation failed: ${error.message}\n`);
        process.exitCode = 1;
    }
}
