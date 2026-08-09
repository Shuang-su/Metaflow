#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDirectory, '..');

const walkFiles = async (directory) => {
    const files = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) files.push(...await walkFiles(path));
        else if (entry.isFile()) files.push(path);
        else throw new Error(`unsupported runtime entry: ${path}`);
    }
    return files;
};

const isExcluded = (path) => path === 'version.json' || path.endsWith('.map');

export const compareRuntimeFiles = (expected, actual) => {
    const errors = [];
    const expectedPaths = Object.keys(expected).sort();
    const actualPaths = Object.keys(actual).sort();
    const missing = expectedPaths.filter((path) => !(path in actual));
    const extra = actualPaths.filter((path) => !(path in expected));
    if (missing.length > 0) errors.push(`missing: ${missing.join(', ')}`);
    if (extra.length > 0) errors.push(`extra: ${extra.join(', ')}`);
    for (const path of expectedPaths.filter((entry) => entry in actual)) {
        if (actual[path] !== expected[path]) {
            errors.push(`${path}: expected ${expected[path]}, got ${actual[path]}`);
        }
    }
    return errors;
};

export async function validateEditorRuntime(root = repoRoot) {
    const baselinePath = join(root, 'metadata/editor-runtime-baseline.json');
    const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
    if (baseline.schemaVersion !== '1.0' || baseline.sourcePath !== 'metaflow-editor') {
        throw new Error('invalid Editor runtime baseline metadata');
    }
    const buildPath = join(root, baseline.buildPath);
    const actual = {};
    for (const absolutePath of await walkFiles(buildPath)) {
        const path = relative(buildPath, absolutePath).split(sep).join('/');
        if (isExcluded(path)) continue;
        actual[path] = createHash('sha256').update(await readFile(absolutePath)).digest('hex');
    }
    const errors = compareRuntimeFiles(baseline.files, actual);
    if (errors.length > 0) {
        throw new Error(`Editor runtime differs from the 1.1.0 baseline: ${errors.join('; ')}`);
    }
    return {
        editorVersion: baseline.editorVersion,
        buildPath: baseline.buildPath,
        comparedFiles: Object.keys(actual).length,
        excluded: baseline.excluded
    };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const result = await validateEditorRuntime();
        process.stdout.write(`${JSON.stringify({ ok: true, ...result }, null, 2)}\n`);
    } catch (error) {
        process.stderr.write(`${error.message}\n`);
        process.exitCode = 1;
    }
}
