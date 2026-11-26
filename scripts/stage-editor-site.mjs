#!/usr/bin/env node
/** Prepare an Editor-only candidate from an immutable, fully hashed production site. */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { cp, lstat, link, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { verifyEditorMirrors } from './stage-editor.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = async file => {
    const digest = createHash('sha256');
    for await (const chunk of createReadStream(file)) digest.update(chunk);
    return digest.digest('hex');
};
async function inventory(directory, prefix = '') {
    const files = [];
    for (const item of await readdir(directory, { withFileTypes: true })) {
        if (item.name === '.DS_Store') continue; // Finder metadata is never a deployed asset.
        const relative = path.posix.join(prefix, item.name);
        if (item.isSymbolicLink()) throw Error(`Symlink is not a release file: ${relative}`);
        if (item.isDirectory()) files.push(...await inventory(path.join(directory, item.name), relative));
        else if (item.isFile()) files.push(relative);
    }
    return files.sort();
}
const editorPath = name => name.startsWith('editor/') || name.startsWith('editor-legacy/') || name === 'data/editor-version-history.json';
export async function stageEditorSite({ baseline, manifest, destination, baselineDeploy, repository = root, additionalFiles = new Map() }) {
    const editions = await verifyEditorMirrors(repository);
    const replaced = name => editorPath(name) || additionalFiles.has(name);
    for (const name of additionalFiles.keys()) {
        if (!/^(?:[^/.][^/]*\.(?:html|css|js|map|json)|assets\/[^/]+|data\/(?:index|version-history)\.json)$/.test(name))
            throw Error(`Forbidden Viewer overlay: ${name}`);
    }
    baseline = path.resolve(baseline);
    destination = path.resolve(destination);
    if (destination === baseline || destination.startsWith(`${baseline}/`) || baseline.startsWith(`${destination}/`)) {
        throw Error('Candidate and production baseline must be separate directories');
    }
    if (!/^[a-f0-9]{24}$/.test(baselineDeploy)) throw Error('An exact Netlify baseline deployment ID is required');
    try { await lstat(destination); throw Error('Candidate destination already exists; choose a fresh directory'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const sourceManifest = JSON.parse(await readFile(manifest, 'utf8'));
    const records = new Map(sourceManifest.files.map(file => [file.path, file]));
    const baselineFiles = await inventory(baseline);
    if (records.size !== sourceManifest.files.length || JSON.stringify([...records.keys()].sort()) !== JSON.stringify(baselineFiles)) {
        throw Error('Production baseline inventory differs from its manifest');
    }
    for (const relative of baselineFiles) {
        const file = path.join(baseline, relative);
        const record = records.get(relative);
        if ((await lstat(file)).size !== record.bytes || await hash(file) !== record.sha256) {
            throw Error(`Production baseline hash differs: ${relative}`);
        }
    }
    await mkdir(destination, { recursive: true });
    for (const relative of baselineFiles.filter(name => !replaced(name))) {
        const target = path.join(destination, relative);
        await mkdir(path.dirname(target), { recursive: true });
        // These links are immutable. New/replaced Editor files use independent copies.
        await link(path.join(baseline, relative), target);
    }
    await cp(path.join(repository, 'metaflow-editor'), path.join(destination, 'editor'), { recursive: true });
    await cp(path.join(repository, 'metaflow-editor-legacy'), path.join(destination, 'editor-legacy'), { recursive: true });
    await cp(path.join(repository, 'data/editor-version-history.json'), path.join(destination, 'data/editor-version-history.json'));
    for (const [relative, source] of additionalFiles) {
        await mkdir(path.dirname(path.join(destination, relative)), { recursive: true });
        await cp(source, path.join(destination, relative));
    }
    const candidateFiles = await inventory(destination);
    const output = [];
    let preserved = 0;
    for (const relative of candidateFiles) {
        const target = path.join(destination, relative);
        const digest = await hash(target);
        if (!replaced(relative)) {
            if (digest !== records.get(relative)?.sha256) throw Error(`Non-Editor artifact changed: ${relative}`);
            preserved++;
        }
        output.push({ path: relative, bytes: (await lstat(target)).size, sha256: digest });
    }
    const expectedPreserved = baselineFiles.filter(name => !replaced(name)).length;
    if (preserved !== expectedPreserved) throw Error('Non-Editor file inventory changed');
    const receipt = { status: 'local-candidate-not-deployed', baselineDeploy, baseline, destination,
        baselineCommit: sourceManifest.commit, editions, preserved, files: output };
    await writeFile(`${destination}.manifest.json`, `${JSON.stringify(receipt, null, 2)}\n`);
    return { status: receipt.status, baselineDeploy, destination, preserved, totalFiles: output.length, editions };
}
if (import.meta.url === pathToFileURL(path.resolve(process.argv[1] ?? '')).href) {
    const args = {};
    const names = { '--baseline': 'baseline', '--manifest': 'manifest', '--destination': 'destination', '--baseline-deploy': 'baselineDeploy' };
    for (let i = 2; i < process.argv.length; i += 2) {
        if (!names[process.argv[i]] || !process.argv[i + 1]) throw Error('Use --baseline DIR --manifest FILE --destination NEW_DIR --baseline-deploy ID');
        args[names[process.argv[i]]] = process.argv[i + 1];
    }
    if (Object.keys(args).length !== 4) throw Error('All four staging arguments are required');
    console.log(JSON.stringify(await stageEditorSite(args), null, 2));
}
