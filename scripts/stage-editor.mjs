#!/usr/bin/env node
/** Explicit Editor build -> tracked mirror staging, with source and byte provenance. */
import { verifyExportViewer } from './prepare-export-viewer.mjs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = data => createHash('sha256').update(data).digest('hex');
const json = async file => JSON.parse(await readFile(file, 'utf8'));

async function filesBelow(directory, prefix = '') {
    const result = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const relative = path.posix.join(prefix, entry.name);
        if (entry.isSymbolicLink()) throw new Error(`Unexpected symlink: ${directory}/${relative}`);
        if (entry.isDirectory()) result.push(...await filesBelow(path.join(directory, entry.name), relative));
        else if (entry.isFile()) result.push(relative);
    }
    return result.sort();
}

export async function editorSourceDigest(root, sourcePath) {
    const source = path.join(root, sourcePath);
    const inputs = ['package.json', 'package-lock.json', '.nvmrc', 'rollup.config.mjs', 'copy-and-watch.mjs', 'tsconfig.json', 'global.d.ts'];
    for (const directory of ['src', 'static']) {
        inputs.push(...(await filesBelow(path.join(source, directory))).map(file => `${directory}/${file}`));
    }
    const records = [];
    for (const relative of inputs.sort()) records.push(`${relative}\t${sha256(await readFile(path.join(source, relative)))}\n`);
    records.push(`build-provenance\t${sha256(await readFile(path.join(root, 'scripts/stage-editor.mjs')))}\n`);
    records.push(`shared-reveal\t${sha256(await readFile(path.join(root, 'metaflow-viewer/src/gsplat-reveal-radial.ts')))}\n`);
    for (const relative of await filesBelow(path.join(root, 'editor-shared'))) {
        records.push(`editor-shared/${relative}\t${sha256(await readFile(path.join(root, 'editor-shared', relative)))}\n`);
    }
    const exportViewer = await verifyExportViewer(root);
    records.push(`standalone-viewer\t${exportViewer.source}\t${exportViewer.bundle}\n`);
    return sha256(records.join(''));
}

export async function editorEditions(root) {
    const history = await json(path.join(root, 'metadata/editor-version-history.json'));
    if (!history.compatibility) throw new Error('Editor compatibility release metadata is missing');
    return [
        { edition: 'default', destination: 'metaflow-editor', current: history.current },
        { edition: 'compatibility', destination: 'metaflow-editor-legacy', current: { ...history.current, ...history.compatibility } }
    ].map(entry => ({ ...entry, history }));
}

export function editorRuntime(history, current, edition, buildId) {
    const entry = history.entries[0];
    return {
        productName: current.productName, displayVersion: current.displayVersion, appSemver: current.appSemver,
        date: current.date, gitRef: current.gitRef, historyUrl: current.historyUrl, runtimeUrl: current.runtimeUrl,
        sourcePath: current.sourcePath, edition, development: false, buildType: 'release', buildId,
        upstream: current.upstream, dependencies: current.dependencies,
        latestChange: { type: entry.type, scope: entry.scope, summary: entry.summary, changes: entry.changes },
        generatedFrom: 'metadata/editor-version-history.json'
    };
}

async function fileHashes(directory) {
    const hashes = {};
    for (const relative of await filesBelow(directory)) {
        if (relative === 'build-manifest.json') continue;
        hashes[relative] = sha256(await readFile(path.join(directory, relative)));
    }
    return hashes;
}

export async function verifyEditorMirrors(root = rootDirectory) {
    const results = [];
    for (const { edition, destination, current, history } of await editorEditions(root)) {
        const directory = path.join(root, destination);
        const manifest = await json(path.join(directory, 'build-manifest.json'));
        if (manifest.sourcePath !== current.sourcePath || manifest.sourceDigest !== await editorSourceDigest(root, current.sourcePath)) {
            throw new Error(`${edition}: stale Editor build; rebuild and stage ${current.sourcePath}`);
        }
        const hashes = await fileHashes(directory);
        if (JSON.stringify(hashes) !== JSON.stringify(manifest.files)) throw new Error(`${edition}: staged file hashes differ`);
        const runtime = await json(path.join(directory, 'version.json'));
        const expected = editorRuntime(history, current, edition, hashes['index.js']);
        if (JSON.stringify(runtime) !== JSON.stringify(expected)) throw new Error(`${edition}: runtime release identity differs`);
        // A checkout without dist can still validate its tracked mirror. When a
        // fresh build exists (including release CI), require those exact assets.
        let fresh;
        try { fresh = await fileHashes(path.join(root, current.sourcePath, 'dist')); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        if (fresh) {
            const assets = entries => Object.fromEntries(Object.entries(entries).filter(([name]) => name !== 'version.json'));
            if (JSON.stringify(assets(fresh)) !== JSON.stringify(assets(hashes))) {
                throw new Error(`${edition}: fresh dist differs from the staged mirror; stage the validated build`);
            }
        }
        results.push({ edition, sourcePath: current.sourcePath, version: runtime.appSemver, files: Object.keys(hashes).length, buildId: hashes['index.js'] });
    }
    return results;
}

export async function stageEditors(root = rootDirectory, apply = false) {
    const candidates = [];
    // Validate both editions before replacing either tracked mirror.
    for (const item of await editorEditions(root)) {
        const source = path.join(root, item.current.sourcePath, 'dist');
        const runtime = await json(path.join(source, 'version.json'));
        const hash = sha256(await readFile(path.join(source, 'index.js')));
        if (runtime.development || runtime.buildType !== 'release' || runtime.edition !== item.edition || runtime.buildId !== hash ||
            runtime.appSemver !== item.current.appSemver || runtime.sourcePath !== item.current.sourcePath ||
            runtime.upstream.gitRef !== item.current.upstream.gitRef ||
            runtime.sourceDigest !== await editorSourceDigest(root, item.current.sourcePath)) {
            throw new Error(`${item.edition}: build is a development candidate or does not match release metadata`);
        }
        const files = await filesBelow(source);
        candidates.push({ ...item, source, hash, sourceDigest: await editorSourceDigest(root, item.current.sourcePath), files: files.length });
    }
    if (apply) {
        for (const item of candidates) {
            const destination = path.join(root, item.destination);
            let existing;
            try { existing = await filesBelow(destination); } catch (error) {
                if (error.code !== 'ENOENT') throw error;
                continue;
            }
            const allowed = new Set(execFileSync('git', ['ls-files', '-z', item.destination], { cwd: root, encoding: 'utf8' })
                .split('\0').filter(Boolean).map(file => file.slice(item.destination.length + 1)));
            try {
                const previous = await json(path.join(destination, 'build-manifest.json'));
                for (const file of Object.keys(previous.files)) allowed.add(file);
                allowed.add('build-manifest.json');
            } catch (error) { if (error.code !== 'ENOENT') throw error; }
            const unknown = existing.filter(file => !allowed.has(file));
            if (unknown.length) throw new Error(`${item.edition}: refusing to replace untracked mirror files: ${unknown.join(', ')}`);
        }
        for (const item of candidates) {
            const destination = path.join(root, item.destination);
            // These are task-owned generated mirrors. Unlink before copying to
            // avoid writes through a deployment snapshot's hard links.
            await rm(destination, { recursive: true, force: true });
            await mkdir(destination, { recursive: true });
            await cp(item.source, destination, { recursive: true });
            await writeFile(path.join(destination, 'version.json'), `${JSON.stringify(editorRuntime(item.history, item.current, item.edition, item.hash), null, 2)}\n`);
            await writeFile(path.join(destination, 'build-manifest.json'), `${JSON.stringify({
                schemaVersion: 1, sourcePath: item.current.sourcePath, sourceDigest: item.sourceDigest,
                files: await fileHashes(destination)
            }, null, 2)}\n`);
        }
        return verifyEditorMirrors(root);
    }
    return candidates.map(({ edition, source, destination, files, hash }) => ({ edition, source, destination, files, buildId: hash }));
}

if (import.meta.url === pathToFileURL(path.resolve(process.argv[1] ?? '')).href) {
    const args = process.argv.slice(2);
    if (args.some(arg => !['--apply', '--check'].includes(arg)) || args.length > 1) throw new Error('Use --apply, --check, or no argument for a dry run');
    const result = args.includes('--check') ? await verifyEditorMirrors() : await stageEditors(rootDirectory, args.includes('--apply'));
    console.log(JSON.stringify(result, null, 2));
}
