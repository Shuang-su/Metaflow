import { cp, lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const viewerRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(viewerRoot, 'e2e', 'fixture');
const target = join(viewerRoot, 'public', 'data');

// A historical full-data checkout can symlink public/data to the archive.
const existing = async (path) => lstat(path).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
});
if (process.argv.includes('--if-missing') && await existing(join(target, 'index.json'))) process.exit(0);
if ((await existing(target))?.isSymbolicLink()) throw Error('Choose an independent public/data for the offline fixture');

await mkdir(target, { recursive: true });
await cp(join(source, 'index.json'), join(target, 'index.json'));
await cp(join(source, 'e2e'), join(target, 'e2e'), { recursive: true });
const encodedPly = await readFile(join(source, 'e2e', 'single-gaussian.ply.base64'), 'utf8');
await writeFile(join(target, 'e2e', 'single-gaussian.ply'), Buffer.from(encodedPly.trim(), 'base64'));
