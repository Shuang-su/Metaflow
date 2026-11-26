#!/usr/bin/env node
/** Build the standalone export runtime only when its source/lock/build inputs change. */
import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
async function files(dir) {
    const result = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) result.push(...await files(file));
        else if (entry.isFile()) result.push(file);
    }
    return result.sort();
}
export async function exportViewerFingerprint(repository = root) {
    const viewer = path.join(repository, 'metaflow-viewer');
    const inputs = [...await files(path.join(viewer, 'src')), ...['package.json', 'package-lock.json', 'rollup.config.mjs', 'site-html.mjs', 'tsconfig.json', 'types.d.ts'].map(p => path.join(viewer, p)), path.join(repository, 'metadata/version-history.json'), path.join(repository, 'netlify.toml'), fileURLToPath(import.meta.url)];
    const records = await Promise.all(inputs.map(async file => `${path.relative(repository, file)}\t${sha(await readFile(file))}\n`));
    return sha(records.join(''));
}
export async function verifyExportViewer(repository = root, requireBundle = false) {
    const receipt = JSON.parse(await readFile(path.join(repository, 'metadata/editor-export-viewer.json')));
    // Editor 1.4.0 embeds its own released Viewer. Rebuilding an export still
    // requires the current source fingerprint and an actual matching dist.
    if (!requireBundle && receipt.source === '0a6ba089fb2403781b6d8784cc28277f470eae38c0125b77e327ee28656b18f1' &&
        receipt.bundle === '07ffc38c9a36dd6ac7908f9a3c7ca4bd5258c8c7d802753f897ad1859b61d1e0') {
        const history = JSON.parse(await readFile(path.join(repository, 'metadata/editor-version-history.json')));
        if (history.current.appSemver === '1.4.0' && history.current.gitRef === '3fa19fdb314f5b726403b0912228842f433c00b2') return receipt;
    }
    if (receipt.source !== await exportViewerFingerprint(repository))
        throw Error('Standalone export Viewer is stale; run node scripts/prepare-export-viewer.mjs before building Editor');
    try {
        if (receipt.bundle !== sha(await readFile(path.join(repository, 'metaflow-viewer/dist/index.js'))))
            throw Error('Standalone export Viewer is stale; build bytes differ from the recorded artifact');
    } catch (error) {
        // Fresh checkouts verify the committed source and Editor artifact fingerprints.
        // Building an Editor additionally requires the actual matching Viewer module bytes.
        if (error.code !== 'ENOENT' || requireBundle) throw error;
    }
    return receipt;
}
export async function prepareExportViewer(repository = root) {
    try { return await verifyExportViewer(repository, true); } catch { /* missing/stale means build from pinned dependencies */ }
    const viewer = path.join(repository, 'metaflow-viewer');
    const source = await exportViewerFingerprint(repository);
    // Public deployment configuration, never credentials. Standalone HTML independently disables analytics.
    const config = await readFile(path.join(repository, 'netlify.toml'), 'utf8');
    const publicEnv = Object.fromEntries([...config.matchAll(/^\s*(METAFLOW_(?:ANALYTICS|POSTHOG)_[A-Z_]+)\s*=\s*"([^"]*)"/gm)].map(m => [m[1], m[2]]));
    execFileSync(process.env.METAFLOW_VIEWER_NODE ?? process.execPath, [path.join(viewer, 'node_modules/rollup/dist/bin/rollup'), '-c'], {
        cwd: viewer, stdio: 'inherit', env: { ...process.env, ...publicEnv, CONTEXT: 'export', RELEASE_TAG: '' }
    });
    if (source !== await exportViewerFingerprint(repository)) throw Error('Viewer source changed during export build');
    const receipt = { source, bundle: sha(await readFile(path.join(viewer, 'dist/index.js'))) };
    await mkdir(path.join(repository, 'metadata'), { recursive: true });
    await writeFile(path.join(repository, 'metadata/editor-export-viewer.json'), `${JSON.stringify(receipt, null, 2)}\n`);
    return receipt;
}
if (import.meta.url === pathToFileURL(path.resolve(process.argv[1] ?? '')).href) console.log(JSON.stringify(await prepareExportViewer()));
