#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY_PATH = 'metadata/components.json';
const ROUTING_PATH = 'metadata/ci-routing.json';
const REQUIRED_COMPONENTS = new Set(['viewer', 'editor', 'design', 'data', 'platform', 'reference']);
const REQUIRED_CATEGORIES = new Set([
    'docs',
    'governance',
    'dependency',
    'viewer',
    'editor',
    'data',
    'design',
    'reference',
    'release'
]);
export const CHECK_IDS = [
    'docs',
    'governance',
    'viewer',
    'editor',
    'design',
    'data',
    'reference',
    'release',
    'codeql',
    'dependency-review'
];

function assertion(condition, message) {
    if (!condition) throw new Error(message);
}

function normalizePath(value) {
    return value.replaceAll('\\', '/').replace(/^\.\//, '');
}

function validatePattern(pattern, source) {
    assertion(typeof pattern === 'string' && pattern.length > 0, `${source}: path pattern must be non-empty`);
    assertion(!pattern.startsWith('/'), `${source}: path pattern must be repository-relative`);
    assertion(!pattern.split('/').includes('..'), `${source}: path pattern must not escape the repository`);
}

export function globToRegExp(pattern) {
    validatePattern(pattern, pattern);
    let result = '^';
    for (let index = 0; index < pattern.length; index += 1) {
        const char = pattern[index];
        const next = pattern[index + 1];
        const afterNext = pattern[index + 2];
        if (char === '*' && next === '*' && afterNext === '/') {
            result += '(?:.*/)?';
            index += 2;
        } else if (char === '*' && next === '*') {
            result += '.*';
            index += 1;
        } else if (char === '*') {
            result += '[^/]*';
        } else if (char === '?') {
            result += '[^/]';
        } else {
            result += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }
    }
    return new RegExp(`${result}$`);
}

export function validateComponentRegistry(registry, source = REGISTRY_PATH) {
    assertion(registry && typeof registry === 'object', `${source}: expected an object`);
    assertion(['1.0', '1.1'].includes(registry.schemaVersion), `${source}: unsupported schemaVersion`);
    assertion(Array.isArray(registry.components), `${source}: components must be an array`);
    const seen = new Set();
    for (const component of registry.components) {
        assertion(REQUIRED_COMPONENTS.has(component.id), `${source}: invalid component "${component.id}"`);
        assertion(!seen.has(component.id), `${source}: duplicate component "${component.id}"`);
        seen.add(component.id);
        assertion(
            Array.isArray(component.ownedPaths) && component.ownedPaths.length > 0,
            `${source}: ${component.id}.ownedPaths must be non-empty`
        );
        for (const pattern of component.ownedPaths) validatePattern(pattern, `${source}: ${component.id}`);
        if (registry.schemaVersion === '1.0') {
            assertion(
                Array.isArray(component.checks) && component.checks.length > 0,
                `${source}: legacy ${component.id}.checks must be non-empty`
            );
        } else {
            assertion(component.checks === undefined, `${source}: checks belong in ${ROUTING_PATH}`);
        }
    }
    for (const required of REQUIRED_COMPONENTS) {
        assertion(seen.has(required), `${source}: missing component "${required}"`);
    }
    return registry;
}

export function validateRoutingManifest(manifest, source = ROUTING_PATH) {
    assertion(manifest && typeof manifest === 'object', `${source}: expected an object`);
    assertion(manifest.schemaVersion === '1.0', `${source}: unsupported schemaVersion`);
    assertion(Array.isArray(manifest.checks), `${source}: checks must be an array`);
    assertion(new Set(manifest.checks).size === manifest.checks.length, `${source}: duplicate check id`);
    assertion(
        CHECK_IDS.every((check) => manifest.checks.includes(check)) && manifest.checks.length === CHECK_IDS.length,
        `${source}: check catalog must exactly match the workflow job surface`
    );
    assertion(Array.isArray(manifest.routes) && manifest.routes.length > 0, `${source}: routes must be non-empty`);

    const routeIds = new Set();
    const categories = new Set();
    for (const route of manifest.routes) {
        assertion(/^[a-z][a-z0-9-]*$/.test(route.id), `${source}: invalid route id "${route.id}"`);
        assertion(!routeIds.has(route.id), `${source}: duplicate route id "${route.id}"`);
        routeIds.add(route.id);
        assertion(REQUIRED_CATEGORIES.has(route.category), `${source}: invalid category "${route.category}"`);
        categories.add(route.category);
        assertion(
            Array.isArray(route.includePaths) && route.includePaths.length > 0,
            `${source}: ${route.id}.includePaths must be non-empty`
        );
        assertion(Array.isArray(route.excludePaths), `${source}: ${route.id}.excludePaths must be an array`);
        assertion(
            Array.isArray(route.checks) && route.checks.length > 0,
            `${source}: ${route.id}.checks must be non-empty`
        );
        assertion(new Set(route.checks).size === route.checks.length, `${source}: ${route.id} has duplicate checks`);
        for (const check of route.checks) {
            assertion(manifest.checks.includes(check), `${source}: ${route.id} uses unknown check "${check}"`);
        }
        for (const pattern of route.includePaths) validatePattern(pattern, `${source}: ${route.id}`);
        for (const pattern of route.excludePaths) validatePattern(pattern, `${source}: ${route.id}`);
    }
    for (const category of REQUIRED_CATEGORIES) {
        assertion(categories.has(category), `${source}: missing route category "${category}"`);
    }
    return manifest;
}

function pathMatches(path, includePaths, excludePaths = []) {
    const included = includePaths.some((pattern) => globToRegExp(pattern).test(path));
    const excluded = excludePaths.some((pattern) => globToRegExp(pattern).test(path));
    return included && !excluded;
}

export function routePaths(paths, { ownershipRegistries, routingManifests }) {
    assertion(Array.isArray(ownershipRegistries) && ownershipRegistries.length > 0, 'ownership registry is required');
    assertion(Array.isArray(routingManifests) && routingManifests.length > 0, 'routing manifest is required');
    ownershipRegistries.forEach((registry, index) => validateComponentRegistry(registry, `ownership[${index}]`));
    routingManifests.forEach((manifest, index) => validateRoutingManifest(manifest, `routing[${index}]`));

    const normalizedPaths = [...new Set(paths.map(normalizePath).filter(Boolean))].sort();
    const ownership = new Map();
    const routes = new Map();
    const checks = new Set();
    const unowned = [];
    const unrouted = [];

    for (const path of normalizedPaths) {
        let owned = false;
        for (const registry of ownershipRegistries) {
            for (const component of registry.components) {
                if (!pathMatches(path, component.ownedPaths)) continue;
                owned = true;
                if (!ownership.has(component.id)) ownership.set(component.id, new Set());
                ownership.get(component.id).add(path);
            }
        }
        if (!owned) unowned.push(path);

        let routed = false;
        for (const manifest of routingManifests) {
            for (const route of manifest.routes) {
                if (!pathMatches(path, route.includePaths, route.excludePaths)) continue;
                routed = true;
                if (!routes.has(route.id)) routes.set(route.id, new Set());
                routes.get(route.id).add(path);
                route.checks.forEach((check) => checks.add(check));
            }
        }
        if (!routed) unrouted.push(path);
    }

    const orderChecks = CHECK_IDS.filter((check) => checks.has(check));
    return {
        paths: normalizedPaths,
        ownership: Object.fromEntries([...ownership].sort().map(([id, values]) => [id, [...values].sort()])),
        routes: Object.fromEntries([...routes].sort().map(([id, values]) => [id, [...values].sort()])),
        checks: orderChecks,
        unowned,
        unrouted
    };
}

export function parseNameStatus(output) {
    const tokens = output.split('\0');
    if (tokens.at(-1) === '') tokens.pop();
    const changes = [];
    let index = 0;
    while (index < tokens.length) {
        let status = tokens[index++];
        let firstPath = null;
        if (status.includes('\t')) {
            const separator = status.indexOf('\t');
            firstPath = status.slice(separator + 1);
            status = status.slice(0, separator);
        } else {
            firstPath = tokens[index++];
        }
        assertion(status && firstPath, 'git diff emitted an incomplete name-status record');
        if (/^[RC]/.test(status)) {
            const secondPath = tokens[index++];
            assertion(secondPath, `git diff emitted an incomplete ${status} record`);
            changes.push({ status, paths: [normalizePath(firstPath), normalizePath(secondPath)] });
        } else {
            changes.push({ status, paths: [normalizePath(firstPath)] });
        }
    }
    return changes;
}

export function changedPathChanges(root, base = null) {
    const range = base ? `${base}...HEAD` : 'HEAD';
    const output = execFileSync(
        'git',
        ['diff', '--name-status', '-z', '--find-renames', '--diff-filter=ACMRD', range],
        { cwd: root, encoding: 'utf8' }
    );
    return parseNameStatus(output);
}

async function readJson(path, source = path) {
    let value;
    try {
        value = JSON.parse(await readFile(path, 'utf8'));
    } catch (error) {
        throw new Error(`${source}: ${error.message}`);
    }
    return value;
}

function readGitJson(root, ref, path) {
    let text;
    try {
        text = execFileSync('git', ['show', `${ref}:${path}`], {
            cwd: root,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore']
        });
    } catch {
        return null;
    }
    try {
        return JSON.parse(text);
    } catch (error) {
        throw new Error(`${ref}:${path}: ${error.message}`);
    }
}

async function loadCurrentConfiguration(root = REPO_ROOT) {
    const registry = validateComponentRegistry(
        await readJson(join(root, REGISTRY_PATH), REGISTRY_PATH),
        REGISTRY_PATH
    );
    const routing = validateRoutingManifest(
        await readJson(join(root, ROUTING_PATH), ROUTING_PATH),
        ROUTING_PATH
    );
    return { registry, routing };
}

async function loadConfigurationUnion(root, base) {
    const current = await loadCurrentConfiguration(root);
    if (!base) return { ownershipRegistries: [current.registry], routingManifests: [current.routing] };
    const baseRegistry = readGitJson(root, base, REGISTRY_PATH);
    const baseRouting = readGitJson(root, base, ROUTING_PATH);
    return {
        ownershipRegistries: [current.registry, ...(baseRegistry ? [baseRegistry] : [])],
        routingManifests: [current.routing, ...(baseRouting ? [baseRouting] : [])]
    };
}

export function evaluateGate({ selectedChecks, results, eventName, classifyResult }) {
    const errors = [];
    if (classifyResult !== 'success') errors.push(`classify=${classifyResult || 'missing'}`);
    const selected = new Set(selectedChecks);
    const unknown = [...selected].filter((check) => !CHECK_IDS.includes(check));
    if (unknown.length > 0) errors.push(`unknown checks: ${unknown.join(',')}`);
    const expected = new Set(selected);
    if (eventName !== 'pull_request') expected.delete('dependency-review');

    for (const check of CHECK_IDS) {
        const result = results[check] || 'missing';
        if (expected.has(check)) {
            if (result !== 'success') errors.push(`${check}=${result}, expected success`);
        } else if (result !== 'skipped') {
            errors.push(`${check}=${result}, expected skipped`);
        }
    }
    return { ok: errors.length === 0, expectedJobs: [...expected], errors };
}

function valueAfter(args, flag) {
    const index = args.indexOf(flag);
    if (index < 0) return null;
    assertion(args[index + 1], `${flag} requires a value`);
    const value = args[index + 1];
    args.splice(index, 2);
    return value;
}

function usage() {
    return `Usage:
  node scripts/ci-routing.mjs validate
  node scripts/ci-routing.mjs route [--base <git-ref>] [path ...]
  node scripts/ci-routing.mjs gate`;
}

async function main(argv) {
    const [command, ...args] = argv;
    if (!command || command === '--help' || command === '-h') {
        console.log(usage());
        return;
    }
    if (command === 'validate') {
        const { registry, routing } = await loadCurrentConfiguration();
        console.log(JSON.stringify({
            ok: true,
            schemaVersions: { ownership: registry.schemaVersion, routing: routing.schemaVersion },
            routes: routing.routes.map((route) => route.id),
            checks: routing.checks
        }, null, 2));
        return;
    }
    if (command === 'route') {
        const base = valueAfter(args, '--base');
        const changes = args.length > 0
            ? args.map((path) => ({ status: 'explicit', paths: [normalizePath(path)] }))
            : changedPathChanges(REPO_ROOT, base);
        const paths = changes.flatMap((change) => change.paths);
        const configuration = await loadConfigurationUnion(REPO_ROOT, base);
        const result = routePaths(paths, configuration);
        console.log(JSON.stringify({ ...result, changes }, null, 2));
        if (result.unowned.length > 0 || result.unrouted.length > 0) process.exitCode = 2;
        return;
    }
    if (command === 'gate') {
        const selectedChecks = (process.env.CI_SELECTED_CHECKS || '').split(',').filter(Boolean);
        const results = Object.fromEntries(CHECK_IDS.map((check) => [
            check,
            process.env[`CI_RESULT_${check.toUpperCase().replaceAll('-', '_')}`]
        ]));
        const result = evaluateGate({
            selectedChecks,
            results,
            eventName: process.env.CI_EVENT_NAME,
            classifyResult: process.env.CI_CLASSIFY_RESULT
        });
        console.log(JSON.stringify(result, null, 2));
        if (!result.ok) process.exitCode = 1;
        return;
    }
    throw new Error(`unknown command "${command}"\n${usage()}`);
}

const isCli = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isCli) {
    main(process.argv.slice(2)).catch((error) => {
        console.error(`CI routing failed: ${error.message}`);
        process.exitCode = 1;
    });
}
