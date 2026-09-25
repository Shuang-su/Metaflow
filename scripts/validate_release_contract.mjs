#!/usr/bin/env node

import { appendFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const RELEASE_TAG = /^(viewer|editor|design)-v(\d+\.\d+\.\d+(?:-beta\.\d+)?)$/;
const GIT_REF = /^[0-9a-f]{7,40}$/;

async function readJson(root, relativePath) {
    return JSON.parse(await readFile(resolve(root, relativePath), 'utf8'));
}

function requireEqual(errors, label, actual, expected) {
    if (actual !== expected) {
        errors.push(`${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
    }
}

export function parseReleaseTag(tag) {
    const match = RELEASE_TAG.exec(tag);
    if (!match) {
        throw new Error(`Invalid namespaced release tag: ${tag}`);
    }
    return { component: match[1], version: match[2] };
}

export async function validateViewerReleaseContract(root, version) {
    const [packageJson, packageLock, metadata, publishedHistory, index] = await Promise.all([
        readJson(root, 'metaflow-viewer/package.json'),
        readJson(root, 'metaflow-viewer/package-lock.json'),
        readJson(root, 'metadata/version-history.json'),
        readJson(root, 'data/version-history.json'),
        readJson(root, 'data/index.json')
    ]);
    const errors = [];

    requireEqual(errors, 'metaflow-viewer/package.json version', packageJson.version, version);
    requireEqual(errors, 'metaflow-viewer/package-lock.json version', packageLock.version, version);
    requireEqual(
        errors,
        'metaflow-viewer/package-lock.json root package version',
        packageLock.packages?.['']?.version,
        version
    );
    requireEqual(errors, 'metadata current displayVersion', metadata.current?.displayVersion, version);
    requireEqual(errors, 'metadata current appSemver', metadata.current?.appSemver, version);
    requireEqual(errors, 'published current displayVersion', publishedHistory.current?.displayVersion, version);
    requireEqual(errors, 'published current appSemver', publishedHistory.current?.appSemver, version);
    requireEqual(errors, 'index release displayVersion', index.release?.displayVersion, version);
    requireEqual(errors, 'index release appSemver', index.release?.appSemver, version);

    if (JSON.stringify(publishedHistory) !== JSON.stringify(metadata)) {
        errors.push('data/version-history.json must exactly mirror metadata/version-history.json');
    }

    const productGitRef = metadata.current?.gitRef;
    if (typeof productGitRef !== 'string' || !GIT_REF.test(productGitRef)) {
        errors.push('metadata current gitRef must be a 7-40 character lowercase hexadecimal ref');
    }
    requireEqual(errors, 'published current gitRef', publishedHistory.current?.gitRef, productGitRef);
    requireEqual(errors, 'index release gitRef', index.release?.gitRef, productGitRef);

    if (errors.length) {
        throw new Error(`Viewer release contract validation failed:\n- ${errors.join('\n- ')}`);
    }

    return { productGitRef };
}

export async function validateReleaseContract({ root = process.cwd(), tag }) {
    const parsed = parseReleaseTag(tag);
    const result = {
        ...parsed,
        productGitRef: ''
    };
    if (parsed.component === 'viewer') {
        Object.assign(result, await validateViewerReleaseContract(root, parsed.version));
    }
    return result;
}

function parseArguments(argv) {
    const options = { root: process.cwd(), tag: '', githubOutput: '' };
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (argument === '--root') options.root = argv[++index];
        else if (argument === '--tag') options.tag = argv[++index];
        else if (argument === '--github-output') options.githubOutput = argv[++index];
        else throw new Error(`Unknown argument: ${argument}`);
    }
    if (!options.tag) throw new Error('--tag is required');
    return options;
}

async function main() {
    const options = parseArguments(process.argv.slice(2));
    const result = await validateReleaseContract(options);
    if (options.githubOutput) {
        await appendFile(
            options.githubOutput,
            `component=${result.component}\nversion=${result.version}\nproduct_git_ref=${result.productGitRef}\n`,
            'utf8'
        );
    }
    process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) {
    main().catch((error) => {
        process.stderr.write(`${error.message}\n`);
        process.exitCode = 1;
    });
}
