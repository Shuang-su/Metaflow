#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function readPath(value, dottedPath) {
    return dottedPath.split('.').reduce((current, key) => current?.[key], value);
}

export async function discoverTargets(root = REPO_ROOT) {
    const registry = JSON.parse(await readFile(join(root, 'metadata/components.json'), 'utf8'));
    const targets = [];
    for (const component of registry.components) {
        if (!component.upstream || !component.versionSource) continue;
        const versionDocument = JSON.parse(await readFile(join(root, component.versionSource), 'utf8'));
        const currentVersion = readPath(versionDocument, component.upstream.versionField);
        if (typeof currentVersion !== 'string' || currentVersion.length === 0) {
            throw new Error(`${component.id}: cannot resolve ${component.upstream.versionField}`);
        }
        targets.push({
            component: component.id,
            repository: component.upstream.repository,
            currentVersion
        });
    }
    return targets;
}

async function main() {
    const targets = await discoverTargets();
    console.log(JSON.stringify({ targets }, null, 2));
}

const isCli = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isCli) {
    main().catch((error) => {
        console.error(`Upstream watcher failed: ${error.message}`);
        process.exitCode = 1;
    });
}
