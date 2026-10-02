import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import playwright from '../../metaflow-viewer/node_modules/playwright/index.js';
const { chromium } = playwright;
import { mapTiles } from '../src/maps/model';
import type { MapRenderJob, MapRenderTile } from '../src/maps/model';
import { validateMapManifest } from '../../metaflow-viewer/src/navigation/map-assets';
import type { GaussianMapManifest } from '../../metaflow-viewer/src/navigation/map-assets';
import { createOfflineResources, offlineResourceOptions } from '../src/offline-resources';
import { verifyGaussianJobSource } from '../src/verify-gaussian-source';
import { localAsset, mapOutput, sha, verifyCollisionProvenance } from './gaussian-map-offline';
import type { CollisionProvenance } from './gaussian-map-offline';

type Job = MapRenderJob & { sourceInventory?: unknown; collisionProvenance?: CollisionProvenance };
type Readiness = { frames: number; splats: number; ms: number };
type RenderResult = Readiness & { data: string };
type OutputManifest = GaussianMapManifest & {
    fingerprint: string; readiness: Record<string, Readiness>; sourceInventory?: unknown;
    collisionProvenance?: CollisionProvenance;
};
type RecoveryState = {
    version: 1; fingerprint: string; generatorHash: string;
    status: 'running' | 'failed' | 'complete'; error?: string;
    pending: null | { id: string; sha256: string; bytes: number; readiness: Readiness };
};
const generatorHash = () => sha([
    fileURLToPath(import.meta.url), resolve(import.meta.dirname, '../src/maps/generator.ts'),
    resolve(import.meta.dirname, '../src/maps/model.ts'), resolve(import.meta.dirname, 'gaussian-map-offline.ts'),
].map(file => sha(readFileSync(file))).join(':'));
const isWebP = (bytes: Buffer) => bytes.length >= 16 && bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';

/** Injectable rendering keeps restart/identity tests independent of Chromium. The
 * production path verifies the frozen Gaussian inventory before any output and
 * again before publishing complete coverage. */
export async function generateGaussianMap(options: {
    job: Job; assetRoot: string; resources: ReturnType<typeof createOfflineResources>;
    output?: string; urlPrefix?: string; render: (tile: MapRenderTile) => Promise<RenderResult>;
    onCheckpoint?: (name: 'prepared' | 'binary' | 'manifest', id: string) => void;
}) {
    const { job, resources } = options;
    if (!/^[a-zA-Z0-9_-]+$/.test(job.scene) || !job.gaussianHash || !job.collisionHash || job.transform.length !== 16 ||
        job.layers.some(l => !/^[a-zA-Z0-9_-]+$/.test(l.id))) throw Error('Incomplete map source identity or unsafe layer ID');
    const tiles = mapTiles(job), fingerprint = sha(JSON.stringify(job));
    const output = mapOutput(resources, options.output ?? `maps/${job.scene}`);
    const urlPrefix = options.urlPrefix ?? `/mf97-continuation-maps/${job.scene}/`;
    const file = resolve(output, 'manifest.json'), stateFile = resolve(output, 'generation-state.json');
    const verify = async () => {
        await verifyGaussianJobSource(job, options.assetRoot);
        await verifyCollisionProvenance(job.collisionProvenance, job.collisionHash);
    };
    await verify();
    let manifest: OutputManifest = {
        version: 1, generator: 'mf97-gaussian-world-slice-v1-playcanvas-2.22.4', scene: job.scene, fingerprint,
        source: { gaussianHash: job.gaussianHash, collisionHash: job.collisionHash, transform: job.transform },
        sourceInventory: job.sourceInventory, collisionProvenance: job.collisionProvenance,
        layers: job.layers.map(layer => ({ ...layer, tiles: tiles.filter(t => t.layerId === layer.id).map(t => ({
            id: t.id, bounds: t.bounds, width: t.width, height: t.height, url: `${urlPrefix}${t.id}.webp`, sha256: '', status: 'missing' as const,
        })) })),
        coverage: { expected: tiles.length, ready: 0, status: 'incomplete' }, readiness: {},
    };
    validateMapManifest(manifest);
    let state: RecoveryState = { version: 1, fingerprint, generatorHash: generatorHash(), status: 'running', pending: null };
    if (existsSync(stateFile)) {
        state = JSON.parse(readFileSync(stateFile, 'utf8'));
        if (state.version !== 1 || state.fingerprint !== fingerprint || !['running', 'failed', 'complete'].includes(state.status)) throw Error('Map recovery job differs');
        if (state.status !== 'complete' && state.generatorHash !== generatorHash()) throw Error('Incomplete map generator changed; preserve this run and use a new directory');
    }
    if (existsSync(file)) {
        const saved = JSON.parse(readFileSync(file, 'utf8')) as OutputManifest;
        validateMapManifest(saved, { collisionHash: job.collisionHash, gaussianHash: job.gaussianHash, transform: job.transform });
        const geometry = (m: OutputManifest) => JSON.stringify(m.layers.map(l => ({ ...l, tiles: l.tiles.map(({ status, sha256, ...rest }) => rest) })));
        if (!existsSync(stateFile) || saved.fingerprint !== fingerprint || geometry(saved) !== geometry(manifest)) throw Error('Existing map job/geometry differs; use a distinct continuation directory');
        manifest = saved;
    }
    const records = manifest.layers.flatMap(l => l.tiles);
    for (const tile of records) if (tile.status === 'ready') {
        const path = resolve(output, `${tile.id}.webp`);
        if (!existsSync(path) || sha(readFileSync(path)) !== tile.sha256) throw Error(`Damaged map tile: ${tile.id}`);
    }
    if (state.status === 'complete' && manifest.coverage.status === 'complete') {
        if (state.pending) throw Error('Complete map has a pending tile');
        return { file, coverage: manifest.coverage, alreadyComplete: true, resources: resources.snapshot() };
    }
    const saveManifest = (recovery = false) => {
        manifest.coverage.ready = records.filter(t => t.status === 'ready').length;
        manifest.coverage.status = state.status === 'complete' && manifest.coverage.ready === tiles.length ? 'complete' : 'incomplete';
        validateMapManifest(manifest);
        resources.writeJsonAtomic(file, manifest, { recovery });
    };
    const saveState = (recovery = false) => resources.writeJsonAtomic(stateFile, state, { recovery });
    state.status = 'running'; delete state.error;
    saveState(); saveManifest();
    try {
        for (const tile of tiles) {
            resources.assertCapacity(0, 'Gaussian tile generation');
            const record = records.find(t => t.id === tile.id)!;
            const path = resolve(output, `${tile.id}.webp`);
            if (record.status === 'ready') {
                if (state.pending?.id === tile.id) {
                    if (state.pending.sha256 !== record.sha256) throw Error('Pending/ready tile identity differs');
                    state.pending = null; saveState();
                }
                continue;
            }
            let pending = state.pending?.id === tile.id ? state.pending : null;
            let bytes: Buffer | undefined;
            for (const candidate of [path, path + '.next']) if (pending && existsSync(candidate)) {
                const saved = readFileSync(candidate);
                if (sha(saved) === pending.sha256 && saved.length === pending.bytes && isWebP(saved)) { bytes = saved; break; }
            }
            if (existsSync(path) && !bytes) throw Error(`Untracked/damaged completed tile: ${tile.id}`);
            if (!bytes) {
                const result = await options.render(tile);
                bytes = Buffer.from(result.data, 'base64');
                if (!isWebP(bytes) || ![result.frames, result.splats, result.ms].every(Number.isFinite) || result.frames < 1 || result.splats < 1 || result.ms < 0) throw Error('Invalid rendered WebP/readiness');
                pending = { id: tile.id, sha256: sha(bytes), bytes: bytes.length, readiness: { frames: result.frames, splats: result.splats, ms: result.ms } };
                state.pending = pending; saveState(); options.onCheckpoint?.('prepared', tile.id);
            }
            if (!pending) throw Error('Missing prepared tile record');
            resources.writeFileAtomic(path, bytes, { replace: false });
            options.onCheckpoint?.('binary', tile.id);
            record.sha256 = pending.sha256; record.status = 'ready'; manifest.readiness[tile.id] = pending.readiness;
            saveManifest(); options.onCheckpoint?.('manifest', tile.id);
            state.pending = null; saveState();
        }
        await verify();
        state.status = 'complete'; saveState(); saveManifest();
        return { file, coverage: manifest.coverage, bytes: records.reduce((n, t) => n + statSync(resolve(output, `${t.id}.webp`)).size, 0), resources: resources.snapshot() };
    } catch (error) {
        state.status = 'failed'; state.error = String(error);
        // The reserved recovery allowance is independent of the task's normal output budget.
        try { saveState(true); saveManifest(true); }
        catch (recoveryError) { throw new AggregateError([error, recoveryError], 'Map generation and recovery record failed; preserve existing outputs'); }
        throw error;
    }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2), value = (key: string) => args.includes(key) ? args[args.indexOf(key) + 1] : undefined;
    const jobFile = value('--job');
    if (!jobFile) throw Error('Usage: tsx scripts/generate-gaussian-map.ts --job JOB.json [--origin URL] [--output DIR] [common resource options]');
    const job = JSON.parse(readFileSync(jobFile, 'utf8')) as Job;
    const resources = createOfflineResources(offlineResourceOptions(args));
    const origin = value('--origin') ?? 'http://127.0.0.1:5185';
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined, page: any;
    const errors: string[] = [];
    try {
        const result = await generateGaussianMap({ job, resources, assetRoot: dirname(localAsset(job.assetUrl)), output: value('--output'), urlPrefix: value('--url-prefix'),
            render: async tile => {
                if (!browser) {
                    browser = await chromium.launch({ headless: !args.includes('--headed'), executablePath: value('--browser') ?? chromium.executablePath(), args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
                    page = await browser.newPage({ viewport: { width: 768, height: 768 } });
                    page.on('pageerror', (e: Error) => errors.push(e.message));
                    page.on('console', (m: any) => { if (m.type() === 'error') errors.push(m.text()); });
                    page.on('response', (r: any) => { if (r.status() >= 400 && !r.url().endsWith('favicon.ico')) errors.push(`HTTP ${r.status()}: ${r.url()}`); });
                    await page.goto(`${origin}/map-generator.html`, { waitUntil: 'networkidle' });
                    await page.waitForFunction(() => !!(window as any).mf97MapGenerator);
                    await page.evaluate(async (j: MapRenderJob) => (window as any).mf97MapGenerator.create(j), job);
                }
                if (errors.length) throw Error(errors.join('\n'));
                console.log(JSON.stringify({ scene: job.scene, tile: tile.id, state: 'waiting-for-lod-workbuffer-sort' }));
                const result = await page.evaluate(async (t: MapRenderTile) => (window as any).mf97MapGenerator.render(t), tile);
                if (errors.length) throw Error(errors.join('\n'));
                return result;
            } });
        console.log(JSON.stringify(result));
    } finally {
        if (page) await page.evaluate(() => (window as any).mf97MapGenerator?.destroy()).catch(() => {});
        await browser?.close();
    }
}
