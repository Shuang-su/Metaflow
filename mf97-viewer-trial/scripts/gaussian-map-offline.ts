import { loadAssetConfig, resolveAssetUrl, resolveRecordedPath } from "../../scripts/mf97/asset-config.mjs";
/** Node-only source/output helpers shared by the offline map CLIs. */
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import type { createOfflineResources } from '../src/offline-resources';

export const sha = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
export async function hashFile(path: string) {
    const hash = createHash('sha256');
    for await (const bytes of createReadStream(path)) hash.update(bytes);
    return hash.digest('hex');
}
const inside = (root: string, path: string) => {
    const part = relative(root, path);
    return part !== '..' && !part.startsWith(`..${sep}`) && !isAbsolute(part);
};
export function localAsset(url: string) {
    return resolveAssetUrl(url);
}
export function sourceChild(root: string, child: string) {
    const path = resolve(root, child), canonicalRoot = realpathSync(root);
    if (!inside(root, path) || !inside(canonicalRoot, realpathSync(path))) throw Error('Asset escaped source root');
    return path;
}
export function mapOutput(resources: ReturnType<typeof createOfflineResources>, path: string) {
    const output = resources.resolveOutput(path);
    let ancestor = output;
    while (!existsSync(ancestor)) ancestor = dirname(ancestor);
    const physical = resolve(realpathSync(ancestor), relative(ancestor, output));
    for (const kind of ['jobs', 'maps']) {
        const original = kind === "jobs" ? loadAssetConfig().roots.mapJobs : loadAssetConfig().roots.maps;
        if (inside(original, physical)) throw Error('Original Gaussian jobs/maps are read-only; use the continuation cache');
    }
    return output;
}
export type CollisionProvenance = {
    kind: 'single' | 'tiled'; sourceHash: string; file: string; sha256: string;
    binaryValidation: 'current-single-file-hash' | 'previous-frozen-source-audit';
    indexFile?: string; indexSha256?: string;
};
/** A frozen tiled manifest binds the existing source audit. No tile binary is
 * read again here; consumers still verify each binary when they load it. */
export async function collisionIdentity(collisionPath: string, frozenFile?: string) {
    if (!frozenFile) {
        const bytes = readFileSync(collisionPath), meta = JSON.parse(bytes.toString());
        if (meta.tiles || !Number.isFinite(meta.voxelResolution)) throw Error('Tiled collision needs --collision-source with its frozen source manifest');
        const hash = `${sha(bytes)}:${await hashFile(collisionPath.replace(/\.json$/, '.bin'))}`;
        return { hash, provenance: { kind: 'single', sourceHash: hash, file: resolve(collisionPath), sha256: sha(bytes), binaryValidation: 'current-single-file-hash' } as CollisionProvenance };
    }
    const bytes = readFileSync(frozenFile), manifest = JSON.parse(bytes.toString());
    if (manifest.version !== 1 || !['single', 'tiled'].includes(manifest.kind) || !['identity', 'flipXY'].includes(manifest.transform) ||
        !Array.isArray(manifest.tiles) || !manifest.tiles.length || !Number.isFinite(manifest.voxelResolution) || manifest.voxelResolution <= 0)
        throw Error('Invalid frozen collision source manifest');
    if (manifest.kind === 'single' && manifest.tiles.length !== 1) throw Error('Invalid single collision inventory');
    const ids = new Set<string>();
    for (const tile of manifest.tiles) {
        if (typeof tile.id !== 'string' || ids.has(tile.id) || !/^[a-f0-9]{64}$/.test(tile.metadataHash) || !/^[a-f0-9]{64}$/.test(tile.binaryHash) ||
            !Number.isSafeInteger(tile.binaryBytes) || tile.binaryBytes <= 0 || typeof tile.binaryUrl !== 'string' || !tile.binaryUrl.endsWith('.bin')) throw Error('Invalid frozen collision tile');
        ids.add(tile.id);
    }
    const expected = manifest.kind === 'single' ? `${manifest.tiles[0].metadataHash}:${manifest.tiles[0].binaryHash}` :
        sha(JSON.stringify({ manifestHash: sha(readFileSync(collisionPath)), tiles: manifest.tiles.map((t: any) => [t.id, t.metadataHash, t.binaryHash]), transform: manifest.transform }));
    if (manifest.kind === 'single' && sha(readFileSync(collisionPath)) !== manifest.tiles[0].metadataHash) throw Error('Frozen single collision metadata differs from scene');
    if (manifest.sourceHash !== expected) throw Error('Frozen collision source identity does not match its inventory/index');
    return { hash: manifest.sourceHash as string, provenance: { kind: manifest.kind, sourceHash: manifest.sourceHash, file: resolve(frozenFile), sha256: sha(bytes), indexFile: resolve(collisionPath), indexSha256: sha(readFileSync(collisionPath)), binaryValidation: 'previous-frozen-source-audit' } as CollisionProvenance };
}
export async function verifyCollisionProvenance(proof: CollisionProvenance | undefined, expected: string) {
    if (!proof) return; // Legacy single-file jobs already bind their JSON/BIN hashes.
    const file = resolveRecordedPath(proof.file);
    if (proof.sourceHash !== expected || sha(readFileSync(file)) !== proof.sha256 || proof.indexFile && sha(readFileSync(resolveRecordedPath(proof.indexFile))) !== proof.indexSha256) throw Error('Frozen collision provenance changed');
    if (proof.binaryValidation === 'current-single-file-hash' && `${proof.sha256}:${await hashFile(file.replace(/\.json$/, '.bin'))}` !== expected) throw Error('Single collision binary changed');
}
