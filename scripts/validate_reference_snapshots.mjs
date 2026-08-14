#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
    lstat,
    mkdtemp,
    readFile,
    readlink,
    readdir,
    rm
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const defaultRoot = resolve(scriptDirectory, '..');
const sha1Pattern = /^[0-9a-f]{40}$/;
const sha256Pattern = /^[0-9a-f]{64}$/;
const snapshotIdPattern = /^(?:supersplat-viewer|supersplat|splat-transform)-v\d+\.\d+\.\d+$/;
const canonicalFormat = 'lexicographically sorted complete <mode> <git-blob-sha1>\\t<relative-path>\\n lines';
const forbiddenDirectoryNames = new Set([
    '.cache',
    '.git',
    '.parcel-cache',
    '.turbo',
    'coverage',
    'dist',
    'node_modules'
]);
const forbiddenFileNames = new Set([
    '.DS_Store',
    '.env',
    '.env.local',
    'npm-debug.log',
    'yarn-error.log'
]);
const repositoryByIdPrefix = new Map([
    ['supersplat-viewer-', 'https://github.com/playcanvas/supersplat-viewer'],
    ['splat-transform-', 'https://github.com/playcanvas/splat-transform'],
    ['supersplat-', 'https://github.com/playcanvas/supersplat']
]);

const gitObjectHash = (type, data) => {
    const body = Buffer.isBuffer(data) ? data : Buffer.from(data);
    return createHash('sha1')
        .update(Buffer.from(`${type} ${body.length}\0`))
        .update(body)
        .digest('hex');
};

const gitSortKey = (name, directory) => Buffer.from(`${name}${directory ? '/' : ''}`);

const compareBuffers = (left, right) => Buffer.compare(left, right);

const normalizeRepository = (repository) => repository.replace(/\.git$/, '').replace(/\/$/, '');

const expectedRepository = (id) => {
    for (const [prefix, repository] of repositoryByIdPrefix) {
        if (id.startsWith(prefix)) return repository;
    }
    return null;
};

const expectedTag = (id) => id.slice(id.lastIndexOf('-v') + 1);

const ensureInsideRoot = (root, target, label) => {
    const relativePath = relative(root, target);
    if (relativePath === '..' || relativePath.startsWith(`..${sep}`)) {
        throw new Error(`${label} escapes repository root`);
    }
};

const validateArtifactName = (name, isDirectory, relativePath) => {
    if (isDirectory && forbiddenDirectoryNames.has(name)) {
        throw new Error(`generated or nested Git directory is forbidden: ${relativePath}`);
    }
    if (!isDirectory && forbiddenFileNames.has(name)) {
        throw new Error(`generated or machine-local file is forbidden: ${relativePath}`);
    }
};

async function hashDirectory(directory, root, records) {
    const children = [];
    for (const name of await readdir(directory)) {
        const absolutePath = join(directory, name);
        const stats = await lstat(absolutePath);
        const isDirectory = stats.isDirectory();
        const relativePath = relative(root, absolutePath).split(sep).join('/');
        validateArtifactName(name, isDirectory, relativePath);
        children.push({ name, absolutePath, stats, isDirectory, relativePath });
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
            records.push({ mode, blob: objectId, path: child.relativePath });
        } else if (child.stats.isFile()) {
            mode = child.stats.mode & 0o111 ? '100755' : '100644';
            objectId = gitObjectHash('blob', await readFile(child.absolutePath));
            records.push({ mode, blob: objectId, path: child.relativePath });
        } else {
            throw new Error(`unsupported filesystem entry: ${child.relativePath}`);
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
    let stats;
    try {
        stats = await lstat(absolutePath);
    } catch (error) {
        if (error.code === 'ENOENT') throw new Error(`snapshot directory is missing: ${snapshotPath}`);
        throw error;
    }
    if (!stats.isDirectory()) throw new Error(`snapshot path is not a directory: ${snapshotPath}`);

    const records = [];
    const tree = await hashDirectory(absolutePath, absolutePath, records);
    const canonical = records
        .map(({ mode, blob, path }) => `${mode} ${blob}\t${path}\n`)
        .sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)))
        .join('');
    records.sort((left, right) => Buffer.compare(Buffer.from(left.path), Buffer.from(right.path)));
    return {
        tree,
        trackedFileCount: records.length,
        canonicalContentSha256: createHash('sha256').update(canonical).digest('hex'),
        records
    };
}

const requireString = (snapshot, field) => {
    if (typeof snapshot[field] !== 'string' || snapshot[field].length === 0) {
        throw new Error(`${snapshot.id || '<unknown>'}: missing ${field}`);
    }
};

const validateGitIdentity = (value, label) => {
    if (!sha1Pattern.test(value)) throw new Error(`${label}: expected a 40-character Git object id`);
};

const validateLineage = (snapshot) => {
    const lineage = snapshot.upstreamLineage;
    if (!lineage || typeof lineage !== 'object') {
        throw new Error(`${snapshot.id}: metaflow-history requires upstreamLineage`);
    }
    for (const field of ['repository', 'tag', 'tagObject', 'commit', 'tree', 'note']) {
        if (typeof lineage[field] !== 'string' || lineage[field].length === 0) {
            throw new Error(`${snapshot.id}.upstreamLineage: missing ${field}`);
        }
    }
    for (const field of ['tagObject', 'commit', 'tree']) {
        validateGitIdentity(lineage[field], `${snapshot.id}.upstreamLineage.${field}`);
    }
    if (lineage.contentMatch !== false) {
        throw new Error(`${snapshot.id}: upstream lineage must not claim content identity`);
    }
    if (normalizeRepository(lineage.repository) !== expectedRepository(snapshot.id)) {
        throw new Error(`${snapshot.id}: upstream lineage repository does not match snapshot id`);
    }
    if (lineage.tag !== expectedTag(snapshot.id)) {
        throw new Error(`${snapshot.id}: upstream lineage tag does not match snapshot id`);
    }
};

export function validateSnapshotMetadata(snapshot) {
    for (const field of [
        'id',
        'path',
        'kind',
        'repository',
        'commit',
        'tree',
        'canonicalContentSha256',
        'canonicalFormat',
        'license',
        'identityVerification'
    ]) {
        requireString(snapshot, field);
    }
    if (!snapshotIdPattern.test(snapshot.id)) throw new Error(`${snapshot.id}: invalid snapshot id`);
    if (snapshot.path !== `references/${snapshot.id}`) {
        throw new Error(`${snapshot.id}: path must be references/${snapshot.id}`);
    }
    if (!['upstream', 'metaflow-history'].includes(snapshot.kind)) {
        throw new Error(`${snapshot.id}: invalid kind`);
    }
    validateGitIdentity(snapshot.commit, `${snapshot.id}.commit`);
    validateGitIdentity(snapshot.tree, `${snapshot.id}.tree`);
    if (!sha256Pattern.test(snapshot.canonicalContentSha256)) {
        throw new Error(`${snapshot.id}: invalid canonicalContentSha256`);
    }
    if (!Number.isInteger(snapshot.trackedFileCount) || snapshot.trackedFileCount < 1) {
        throw new Error(`${snapshot.id}: invalid trackedFileCount`);
    }
    if (snapshot.canonicalFormat !== canonicalFormat) {
        throw new Error(`${snapshot.id}: unsupported canonicalFormat`);
    }
    if (snapshot.mutable !== false) {
        throw new Error(`${snapshot.id}: reference snapshot must set mutable to false`);
    }
    if (snapshot.previousPath !== undefined && snapshot.previousPath !== snapshot.id) {
        throw new Error(`${snapshot.id}: previousPath must preserve the former root-level path`);
    }

    if (snapshot.kind === 'upstream') {
        for (const field of ['tag', 'tagObject']) requireString(snapshot, field);
        validateGitIdentity(snapshot.tagObject, `${snapshot.id}.tagObject`);
        if (normalizeRepository(snapshot.repository) !== expectedRepository(snapshot.id)) {
            throw new Error(`${snapshot.id}: repository does not match snapshot id`);
        }
        if (snapshot.tag !== expectedTag(snapshot.id)) {
            throw new Error(`${snapshot.id}: tag does not match snapshot id`);
        }
        if (snapshot.identityVerification !== 'exact-upstream-tree') {
            throw new Error(`${snapshot.id}: upstream snapshot must use exact-upstream-tree verification`);
        }
        if (snapshot.upstreamLineage !== undefined) {
            throw new Error(`${snapshot.id}: upstream snapshot must not use upstreamLineage`);
        }
    } else {
        if (snapshot.tag !== null || snapshot.tagObject !== null) {
            throw new Error(`${snapshot.id}: metaflow-history tag and tagObject must be null`);
        }
        if (snapshot.identityVerification !== 'local-content-only') {
            throw new Error(`${snapshot.id}: metaflow-history must use local-content-only verification`);
        }
        validateLineage(snapshot);
    }
}

export async function validateSnapshot(root, snapshot) {
    validateSnapshotMetadata(snapshot);
    const absoluteRoot = resolve(root);
    const absolutePath = resolve(absoluteRoot, snapshot.path);
    ensureInsideRoot(absoluteRoot, absolutePath, `${snapshot.id}.path`);
    const actual = await computeSnapshotIdentity(absolutePath);
    const errors = [];
    if (actual.tree !== snapshot.tree) {
        errors.push(`tree expected ${snapshot.tree}, got ${actual.tree}`);
    }
    if (actual.trackedFileCount !== snapshot.trackedFileCount) {
        errors.push(`trackedFileCount expected ${snapshot.trackedFileCount}, got ${actual.trackedFileCount}`);
    }
    if (actual.canonicalContentSha256 !== snapshot.canonicalContentSha256) {
        errors.push(
            `canonicalContentSha256 expected ${snapshot.canonicalContentSha256}, ` +
            `got ${actual.canonicalContentSha256}`
        );
    }
    if (errors.length > 0) throw new Error(`${snapshot.id}: ${errors.join('; ')}`);
    return actual;
}

const runGit = async (args, options = {}) => {
    const { stdout } = await execFileAsync('git', args, {
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
        ...options
    });
    return stdout.trim();
};

const upstreamCachePath = (cacheRoot, repository) => {
    const name = basename(normalizeRepository(repository));
    return join(cacheRoot, `${name}.git`);
};

export async function verifyUpstreamIdentity(snapshot, options = {}) {
    validateSnapshotMetadata(snapshot);
    if (snapshot.kind === 'metaflow-history') {
        return { id: snapshot.id, status: 'skipped-local-content-only' };
    }

    let gitDirectory = options.gitDirectory;
    let temporaryDirectory;
    try {
        if (!gitDirectory && options.cacheRoot) {
            gitDirectory = upstreamCachePath(resolve(options.cacheRoot), snapshot.repository);
        }
        if (!gitDirectory) {
            temporaryDirectory = await mkdtemp(join(tmpdir(), 'metaflow-upstream-identity-'));
            gitDirectory = join(temporaryDirectory, 'source.git');
            await runGit(['init', '--bare', gitDirectory]);
            await runGit([
                `--git-dir=${gitDirectory}`,
                'fetch',
                '--quiet',
                '--depth=1',
                snapshot.repository,
                `refs/tags/${snapshot.tag}:refs/tags/${snapshot.tag}`
            ]);
        }

        const reference = `refs/tags/${snapshot.tag}`;
        const actual = {
            tagObject: await runGit([`--git-dir=${gitDirectory}`, 'rev-parse', reference]),
            commit: await runGit([`--git-dir=${gitDirectory}`, 'rev-parse', `${reference}^{commit}`]),
            tree: await runGit([`--git-dir=${gitDirectory}`, 'rev-parse', `${reference}^{tree}`])
        };
        const errors = [];
        for (const field of ['tagObject', 'commit', 'tree']) {
            if (actual[field] !== snapshot[field]) {
                errors.push(`${field} expected ${snapshot[field]}, got ${actual[field]}`);
            }
        }
        if (errors.length > 0) throw new Error(`${snapshot.id}: upstream identity mismatch: ${errors.join('; ')}`);
        return { id: snapshot.id, status: 'verified', ...actual };
    } finally {
        if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
    }
}

const readRegistry = async (registryPath) => JSON.parse(await readFile(registryPath, 'utf8'));

const validateRegisteredDirectories = async (root, registry) => {
    const referencesPath = join(root, 'references');
    const entries = await readdir(referencesPath, { withFileTypes: true });
    const unexpectedFiles = entries.filter((entry) => !entry.isDirectory()).map((entry) => entry.name);
    if (unexpectedFiles.length > 0) {
        throw new Error(`references/ must contain snapshot directories only: ${unexpectedFiles.join(', ')}`);
    }
    const actual = entries.map((entry) => `references/${entry.name}`).sort();
    const registered = registry.snapshots.map((snapshot) => snapshot.path).sort();
    const missing = registered.filter((path) => !actual.includes(path));
    const unregistered = actual.filter((path) => !registered.includes(path));
    if (missing.length || unregistered.length) {
        throw new Error(
            `reference directory registry mismatch; missing=${missing.join(',') || '<none>'}; ` +
            `unregistered=${unregistered.join(',') || '<none>'}`
        );
    }
};

export async function validateRegistry(
    root = defaultRoot,
    registryPath = join(root, 'metadata/reference-snapshots.json'),
    options = {}
) {
    const absoluteRoot = resolve(root);
    const registry = await readRegistry(registryPath);
    if (registry.schemaVersion !== '1.0' || !Array.isArray(registry.snapshots)) {
        throw new Error('metadata/reference-snapshots.json must use schemaVersion 1.0 and snapshots[]');
    }
    if (registry.canonicalFormat !== canonicalFormat) {
        throw new Error('metadata/reference-snapshots.json has an unsupported canonicalFormat');
    }
    const ids = new Set();
    const paths = new Set();
    const results = [];
    for (const snapshot of registry.snapshots) {
        if (ids.has(snapshot.id)) throw new Error(`duplicate snapshot id: ${snapshot.id}`);
        if (paths.has(snapshot.path)) throw new Error(`duplicate snapshot path: ${snapshot.path}`);
        ids.add(snapshot.id);
        paths.add(snapshot.path);
        const actual = await validateSnapshot(absoluteRoot, snapshot);
        const upstream = options.verifyUpstream
            ? await verifyUpstreamIdentity(snapshot, { cacheRoot: options.cacheRoot })
            : { status: snapshot.kind === 'upstream' ? 'not-requested' : 'local-content-only' };
        results.push({
            id: snapshot.id,
            path: snapshot.path,
            kind: snapshot.kind,
            tree: actual.tree,
            trackedFileCount: actual.trackedFileCount,
            canonicalContentSha256: actual.canonicalContentSha256,
            upstreamIdentity: upstream.status
        });
    }
    await validateRegisteredDirectories(absoluteRoot, registry);
    return results;
}

const parseArguments = (arguments_) => {
    const options = { root: defaultRoot, verifyUpstream: false, cacheRoot: undefined };
    for (let index = 0; index < arguments_.length; index += 1) {
        const argument = arguments_[index];
        if (argument === '--verify-upstream') {
            options.verifyUpstream = true;
        } else if (argument === '--root') {
            options.root = resolve(arguments_[index += 1]);
        } else if (argument === '--upstream-cache') {
            options.cacheRoot = resolve(arguments_[index += 1]);
        } else {
            throw new Error(`unknown argument: ${argument}`);
        }
    }
    return options;
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const options = parseArguments(process.argv.slice(2));
        const results = await validateRegistry(
            options.root,
            join(options.root, 'metadata/reference-snapshots.json'),
            options
        );
        process.stdout.write(`${JSON.stringify({ ok: true, snapshots: results }, null, 2)}\n`);
    } catch (error) {
        process.stderr.write(`Reference snapshot validation failed: ${error.message}\n`);
        process.exitCode = 1;
    }
}

export { canonicalFormat };
