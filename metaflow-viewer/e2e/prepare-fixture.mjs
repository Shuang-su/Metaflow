import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const viewerRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(viewerRoot, 'e2e', 'fixture');
const target = join(viewerRoot, 'public', 'data');

await mkdir(target, { recursive: true });
await cp(join(source, 'index.json'), join(target, 'index.json'));
await cp(join(source, 'e2e'), join(target, 'e2e'), { recursive: true });
const encodedPly = await readFile(join(source, 'e2e', 'single-gaussian.ply.base64'), 'utf8');
await writeFile(join(target, 'e2e', 'single-gaussian.ply'), Buffer.from(encodedPly.trim(), 'base64'));
