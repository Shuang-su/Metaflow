// Build the optional hosted index from the same immutable inventory used for release.
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
const inventory = JSON.parse(
    gunzipSync(fs.readFileSync(new URL('../../metadata/shenzhen-asset-manifest.json.gz', import.meta.url)))
);
const sizes = new Map(inventory.map(([file, bytes]) => [file, bytes]));
const index = {};
const texturesByDir = new Map();
for (const [file, size] of sizes) {
    if (!file.endsWith('.webp')) continue;
    const dir = path.posix.dirname(file);
    texturesByDir.set(dir, (texturesByDir.get(dir) || 0) + size);
}
for (const manifest of sizes.keys()) {
    if (!manifest.endsWith('/lod-meta.json')) continue;
    const dir = path.posix.dirname(manifest) + '/';
    const chunks = {};
    for (const [file, size] of sizes) {
        if (!file.startsWith(dir)) continue;
        const relative = file.slice(dir.length);
        if (/\.sog$/.test(relative)) chunks[relative] = size;
        if (!relative.endsWith('/meta.json')) continue;
        chunks[relative] = size + (texturesByDir.get(path.posix.dirname(file)) ?? 0);
    }
    if (Object.keys(chunks).length) index['/' + manifest] = chunks;
}
fs.writeFileSync(new URL('../src/shenzhen/opening-byte-index.json', import.meta.url), JSON.stringify(index) + '\n');
