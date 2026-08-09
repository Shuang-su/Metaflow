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
const files = [...knownPaths].filter((file) => file.endsWith('.md')).sort();
const errors = [];

for (const file of files) {
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
