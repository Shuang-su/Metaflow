// Build an isolated, ready-to-host static website. No model or repository tree is copied.
import { mkdir, readdir, readFile, writeFile, copyFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const editor = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.dirname(editor);
const viewer = path.join(repo, 'metaflow-viewer');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = path.resolve(process.env.STUDIO_PACKAGE_OUTPUT || path.join(repo, '.codex-work/downloads', `mf-58-studio-site-${stamp}`));
await mkdir(path.dirname(output), { recursive: true });
await mkdir(output); // Never overwrite an existing delivery.
const site = path.join(output, 'site');
const build = path.join(output, 'build');
await mkdir(site); await mkdir(build);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
const diff = execFileSync('git', ['diff', '--binary', 'HEAD'], { cwd: repo });
const status = execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' });
async function run(command, args, cwd, env = {}) {
    await new Promise((resolve, reject) => {
        const child = spawn(command, args, { cwd, env: { ...process.env, ...env }, stdio: 'inherit' });
        child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${command} failed: ${code}`)));
    });
}
await run(process.execPath, ['node_modules/rollup/dist/bin/rollup', '-c'], editor,
    { STUDIO_BUILD: '1', STUDIO_PACKAGE: '1', STUDIO_OUTPUT_DIR: path.join(build, 'studio'), BUILD_TYPE: 'release', BASE_HREF: '/studio/' });
await run(process.execPath, ['node_modules/rollup/dist/bin/rollup', '-c'], viewer,
    { STUDIO_PACKAGE: '1', VIEWER_OUTPUT_DIR: path.join(build, 'viewer'), BASE_HREF: '/viewer/', METAFLOW_POSTHOG_KEY: '', METAFLOW_ANALYTICS_ENDPOINT: '' });
async function list(root, prefix = '') {
    const result = [];
    for (const entry of await readdir(path.join(root, prefix), { withFileTypes: true })) {
        const name = path.posix.join(prefix, entry.name);
        if (entry.isDirectory()) result.push(...await list(root, name));
        else if (entry.isFile()) result.push(name);
        else throw new Error(`Unexpected symlink in build: ${name}`);
    }
    return result.sort();
}
for (const component of ['studio', 'viewer']) {
    const source = path.join(build, component);
    for (const name of await list(source)) {
        if (name.endsWith('.map') || name.startsWith('.') || name === 'manifest.json' || name === 'local-files-sw.js' || name.endsWith('/README.md')) continue;
        if (!/\.(html|js|mjs|css|json|svg|png|jpg|webp|wasm|ttf|woff2?|txt|ico)$/i.test(name)) throw new Error(`Unreviewed build asset: ${name}`);
        const dest = path.join(site, component, name);
        await mkdir(path.dirname(dest), { recursive: true });
        let content = await readFile(path.join(source, name));
        if (/\.(js|css)$/.test(name)) content = Buffer.from(content.toString().replace(/\n\/\/# sourceMappingURL=[^\n]*\n?$/, '').replace(/\/\*# sourceMappingURL=.*?\*\//g, ''));
        await writeFile(dest, content);
    }
}
for (const name of await list(site)) {
    if (/\.(js|mjs)$/.test(name)) execFileSync(process.execPath, ['--check', path.join(site, name)], { stdio: 'pipe' });
}
await copyFile(path.join(editor, 'src/studio/local-files-sw.js'), path.join(site, 'local-files-sw.js'));
await writeFile(path.join(site, 'studio/viewer-manifest.json'), JSON.stringify(await list(path.join(site, 'viewer')), null, 2) + '\n');
await writeFile(path.join(site, 'index.html'), '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Metaflow Studio</title><meta http-equiv="refresh" content="0;url=/studio/"><a href="/studio/">打开 Metaflow Studio</a></html>\n');
await writeFile(path.join(site, '_headers'), '/local-files-sw.js\n  Cache-Control: no-cache\n/studio/*\n  Cache-Control: no-cache\n/viewer/*\n  Cache-Control: no-cache\n');

// Retain available package license texts, including bundled transitive dependencies.
const notices = new Map();
for (const cwd of [editor, viewer]) {
    const lock = JSON.parse(await readFile(path.join(cwd, 'package-lock.json'), 'utf8'));
    for (const relative of ['', ...Object.keys(lock.packages).filter(p => p.startsWith('node_modules/'))]) {
        const directory = path.join(cwd, relative);
        let pkg;
        try { pkg = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8')); } catch { continue; }
        const id = `${pkg.name}@${pkg.version}`;
        if (notices.has(id)) continue;
        const texts = [];
        for (const name of await readdir(directory)) {
            if (/^(licen[sc]e|copying|notice)([.-]|$)/i.test(name) && (await stat(path.join(directory, name))).isFile()) texts.push(`${name}\n${await readFile(path.join(directory, name), 'utf8')}`);
        }
        if (texts.length) notices.set(id, texts.join('\n\n'));
    }
}
await writeFile(path.join(site, 'THIRD-PARTY-NOTICES.txt'), [...notices].map(([name, text]) => `${name}\n${'='.repeat(72)}\n${text}`).join('\n\n'));
await copyFile(path.join(repo, 'docs/guides/studio-site-delivery.md'), path.join(output, 'README.md'));
const metadata = { product: 'Metaflow Studio', packageVersion: '0.1.0-preview', createdAt: new Date().toISOString(), sourceCommit: commit, sourceDirty: Boolean(status.trim()), sourceDiffSha256: hash(diff), deployment: 'HTTPS origin root', analytics: false, modelUpload: false };
await writeFile(path.join(site, 'studio-package.json'), JSON.stringify(metadata, null, 2) + '\n');
const checksums = [];
for (const name of await list(site)) checksums.push(`${hash(await readFile(path.join(site, name)))}  ${name}`);
await writeFile(path.join(site, 'SHA256SUMS'), checksums.join('\n') + '\n');
await run('zip', ['-qr', path.join(output, 'metaflow-studio-site.zip'), '.'], site);
await writeFile(path.join(output, 'SHA256SUMS'), `${hash(await readFile(path.join(output, 'metaflow-studio-site.zip')))}  metaflow-studio-site.zip\n`);
console.log(`\nStudio delivery: ${output}\nDeploy the contents of site/ or the ZIP at an HTTPS origin root.`);
