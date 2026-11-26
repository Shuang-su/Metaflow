#!/usr/bin/env node
/** Gradient release: compose new Editor/Viewer artifacts over a verified complete production deployment. */
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stageEditorSite } from './stage-editor-site.mjs';
import { verifyExportViewer } from './prepare-export-viewer.mjs';
import { validateViewerReleaseContract } from './validate_release_contract.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = {};
const names = { '--baseline': 'baseline', '--manifest': 'manifest', '--destination': 'destination', '--baseline-deploy': 'baselineDeploy' };
for (let i = 2; i < process.argv.length; i += 2) {
    if (!names[process.argv[i]] || !process.argv[i + 1]) throw Error('Use --baseline DIR --manifest FILE --destination NEW_DIR --baseline-deploy ID');
    args[names[process.argv[i]]] = process.argv[i + 1];
}
if (Object.keys(args).length !== 4) throw Error('All four staging arguments are required');
await verifyExportViewer(root, true);
const metadata = JSON.parse(await readFile(path.join(root, 'metadata/version-history.json'))).current;
await validateViewerReleaseContract(root, metadata.appSemver);
const oldIndex = JSON.parse(await readFile(path.join(args.baseline, 'data/index.json')));
const newIndex = JSON.parse(await readFile(path.join(root, 'data/index.json')));
// The approved exception is confined to release metadata. Nothing in the resource index may drift.
delete oldIndex.release; delete newIndex.release;
if (JSON.stringify(oldIndex) !== JSON.stringify(newIndex)) throw Error('Resource index content changed outside release metadata');
const publicDir = path.join(root, 'metaflow-viewer/public');
const additionalFiles = new Map();
for (const entry of await readdir(publicDir, { withFileTypes: true })) {
    if (entry.isFile() && /\.(?:html|js|css|map)$/.test(entry.name)) additionalFiles.set(entry.name, path.join(publicDir, entry.name));
}
for (const entry of await readdir(path.join(publicDir, 'assets'), { withFileTypes: true })) {
    if (entry.isFile()) additionalFiles.set(`assets/${entry.name}`, path.join(publicDir, 'assets', entry.name));
}
for (const file of ['index', 'version-history']) additionalFiles.set(`data/${file}.json`, path.join(root, `data/${file}.json`));
const oldBuild = JSON.parse(await readFile(path.join(args.baseline, 'build.json')));
const build = { ...oldBuild, commit: execFileSync('git', ['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
    version: metadata.appSemver, productCommit: metadata.gitRef, builtAt: new Date().toISOString(),
    preservedDirectorFrom: args.baselineDeploy };
const buildFile = path.join(root, '.codex-work/deploy/gradient-build.json');
await mkdir(path.dirname(buildFile), { recursive:true }); await writeFile(buildFile,JSON.stringify(build,null,2)+'\n');
additionalFiles.set('build.json',buildFile);
console.log(JSON.stringify(await stageEditorSite({ ...args, repository:root, additionalFiles }),null,2));
