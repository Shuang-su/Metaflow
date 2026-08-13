#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function exists(path) {
    try {
        await access(path);
        return true;
    } catch {
        return false;
    }
}

const output = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard'],
    { cwd: root, encoding: 'utf8' }
);
const knownPaths = new Set(output.split('\n').filter(Boolean));
// Immutable upstream snapshots preserve the exact tag, including any links to
// release assets that upstream did not commit. Maintained Metaflow documents
// must stay valid; reference Markdown is verified by snapshot identity instead.
const files = [...knownPaths]
    .filter((file) => file.endsWith('.md') && !file.startsWith('references/'))
    .sort();
const errors = [];

async function registeredNonNormativeMaterials() {
    const materials = new Set();
    const indexes = [...knownPaths]
        .filter((file) => file.endsWith('/completion/source-materials.json'))
        .sort();

    for (const index of indexes) {
        let document;
        try {
            document = JSON.parse(await readFile(resolve(root, index), 'utf8'));
        } catch {
            // Completion validation reports malformed or missing indexes with
            // richer context. Do not weaken normal Markdown validation here.
            continue;
        }
        if (!Array.isArray(document.materials)) continue;
        for (const material of document.materials) {
            if (material?.nonNormative !== true || typeof material.path !== 'string') continue;
            const resolved = resolve(root, dirname(index), material.path);
            if (!resolved.startsWith(`${root}/`)) continue;
            materials.add(relative(root, resolved).split(sep).join('/'));
        }
    }
    return materials;
}

const nonNormativeMaterials = await registeredNonNormativeMaterials();

for (const file of files) {
    // Byte-preserved historical inputs keep links relative to their original
    // location. MCL validates their registration, checksum and safety; they are
    // not maintained as live repository documentation.
    if (nonNormativeMaterials.has(file)) continue;
    let text;
    try {
        text = await readFile(resolve(root, file), 'utf8');
    } catch (error) {
        if (error?.code === 'ENOENT') continue;
        throw error;
    }
    const links = text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g);
    for (const match of links) {
        let target = match[1].trim().replace(/^<|>$/g, '');
        if (!target || /^(?:https?:|mailto:|tel:|#)/i.test(target)) continue;
        if (target.startsWith('/')) continue;
        target = target.split('#', 1)[0].split('?', 1)[0];
        if (!target || /[<{][^>}]+[>}]/.test(target)) continue;
        try {
            target = decodeURIComponent(target);
        } catch {
            errors.push(`${file}: malformed URL encoding in ${match[1]}`);
            continue;
        }
        const resolved = resolve(root, dirname(file), target);
        const repositoryPath = relative(root, resolved).split(sep).join('/');
        const trackedTarget = knownPaths.has(repositoryPath) ||
            [...knownPaths].some((path) => path.startsWith(`${repositoryPath}/`));
        if (!resolved.startsWith(`${root}/`) || (!(await exists(resolved)) && !trackedTarget)) {
            errors.push(`${file}: missing local link target ${match[1]}`);
        }
    }
}

if (errors.length > 0) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
} else {
    console.log(`Markdown link validation passed for ${files.length} files.`);
}
