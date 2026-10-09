/** Shared disk/RSS policy for MF97's explicitly approved continuation cache. */
import { createHash } from 'node:crypto';
import {
    closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync,
    realpathSync, renameSync, statfsSync, unlinkSync, writeFileSync
} from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAssetConfig, machineLimits, overlaps } from '../../scripts/mf97/asset-config.mjs';

export const GiB = 1024 ** 3;
export const MiB = 1024 ** 2;
export const DEFAULT_CACHE_ROOT = loadAssetConfig().roots.continuation;
export type OfflineResourceOptions = {
    root?: string; reserveBytes?: number; maxAddedBytes?: number; maxRssBytes?: number;
    taskOutputBytes?: number; recoveryBytes?: number;
    /** Injectable measurements for small deterministic resource-policy fixtures. */
    measureFreeBytes?: (path: string) => number; measureRssBytes?: () => number;
};
export function offlineResourceOptions(args: string[] = process.argv.slice(2)): OfflineResourceOptions {
    const limits = machineLimits();
    const option = (name: string, fallback: string) => {
        const index = args.indexOf(name);
        if (index < 0) return fallback;
        if (!args[index + 1] || args[index + 1].startsWith('--')) throw Error(`Missing value for ${name}`);
        return args[index + 1];
    };
    return {
        root: option('--cache-root', process.env.MF97_CACHE_ROOT ?? DEFAULT_CACHE_ROOT),
        reserveBytes: Number(option('--reserve-gib', process.env.MF97_RESERVE_GIB ?? String(limits.reserveGiB))) * GiB,
        maxAddedBytes: Number(option('--max-added-gib', process.env.MF97_MAX_ADDED_GIB ?? String(limits.maxAddedGiB))) * GiB,
        maxRssBytes: Number(option('--max-rss-gib', process.env.MF97_MAX_RSS_GIB ?? String(limits.maxRssGiB))) * GiB,
        taskOutputBytes: Number(option('--task-output-mib', process.env.MF97_TASK_OUTPUT_MIB ?? '256')) * MiB
    };
}
const sha = (data: Uint8Array | string) => createHash('sha256').update(data).digest('hex');
const contains = (root: string, path: string) => {
    const part = relative(root, path);
    return part === '' || (!part.startsWith(`..${sep}`) && part !== '..' && !part.startsWith(sep));
};
function existingParent(path: string): string {
    let parent = path;
    while (!existsSync(parent)) {
        const next = dirname(parent);
        if (next === parent) throw Error('No existing filesystem parent');
        parent = next;
    }
    return parent;
}
function treeBytes(root: string): number {
    if (!existsSync(root)) return 0;
    let bytes = 0;
    for (const entry of readdirSync(root, { withFileTypes: true })) {
        if (entry.name.startsWith('.resource-budget')) continue;
        const path = resolve(root, entry.name), stat = lstatSync(path);
        // Symlinks are never followed: linked read-only source assets are not new outputs.
        bytes += entry.isDirectory() ? treeBytes(path) : stat.size;
    }
    return bytes;
}

export function createOfflineResources(options: OfflineResourceOptions = {}) {
    const requestedRoot = resolve(options.root ?? process.env.MF97_CACHE_ROOT ?? DEFAULT_CACHE_ROOT);
    const requestedAncestor = existingParent(requestedRoot);
    // Canonicalize the root too: aliases must not hide source/output overlap.
    const root = resolve(realpathSync(requestedAncestor), relative(requestedAncestor, requestedRoot));
    const config = loadAssetConfig();
    if ([config.roots.gaussian, config.roots.repositoryData, ...config.mounts.map(m => m.path)].filter((p): p is string => !!p).some(input => overlaps(input, root))) throw Error('Output overlaps a read-only scene root');
    const limits = machineLimits();
    const reserveBytes = options.reserveBytes ?? limits.reserveGiB * GiB, maxAddedBytes = options.maxAddedBytes ?? limits.maxAddedGiB * GiB;
    const maxRssBytes = options.maxRssBytes ?? limits.maxRssGiB * GiB, taskOutputBytes = options.taskOutputBytes ?? 256 * MiB;
    const recoveryBytes = options.recoveryBytes ?? 4 * MiB;
    for (const [name, value] of Object.entries({ reserveBytes, maxAddedBytes, maxRssBytes, taskOutputBytes, recoveryBytes })) {
        if (!Number.isFinite(value) || value < 0) throw Error(`Invalid ${name}`);
    }
    // CLI policy may be tightened, but cannot silently exceed the user's approved limits.
    if (!options.measureFreeBytes && (reserveBytes < limits.reserveGiB * GiB || maxAddedBytes > limits.maxAddedGiB * GiB || maxRssBytes > limits.maxRssGiB * GiB)) {
        throw Error(`MF97 approved limits: reserve >= ${limits.reserveGiB} GiB, added <= ${limits.maxAddedGiB} GiB, RSS <= ${limits.maxRssGiB} GiB`);
    }
    const free = options.measureFreeBytes ?? ((path: string) => { const disk = statfsSync(path); return disk.bavail * disk.bsize; });
    const rss = options.measureRssBytes ?? (() => process.memoryUsage().rss);
    const ancestor = existingParent(root), rootPhysical = resolve(realpathSync(ancestor), relative(ancestor, root));
    const ledgerFile = resolve(root, '.resource-budget.json'), lockFile = resolve(root, '.resource-budget.lock');
    let taskWrittenBytes = 0;
    function resolveOutput(path: string): string {
        const absolute = resolve(root, path);
        if (!contains(root, absolute)) throw Error('Output escaped the continuation cache');
        const parent = existingParent(absolute);
        const physical = resolve(realpathSync(parent), relative(parent, absolute));
        if (!contains(rootPhysical, physical)) throw Error('Output symlink escaped the continuation cache');
        if (absolute === root || relative(root, absolute).split(sep).some(p => p.startsWith('.resource-budget'))) {
            throw Error('Output collides with the resource root or ledger');
        }
        return absolute;
    }
    function writeLedger(ledger: unknown) {
        const temporary = ledgerFile + '.next';
        if (lstatSync(temporary, { throwIfNoEntry: false })?.isSymbolicLink()) throw Error('Temporary ledger is a symlink; preserve it for inspection');
        if (existsSync(temporary)) renameSync(temporary, resolve(root, `.resource-budget.interrupted-${process.pid}-${Date.now()}.json`));
        const handle = openSync(temporary, 'wx');
        try { writeFileSync(handle, JSON.stringify(ledger)); } finally { closeSync(handle); }
        renameSync(temporary, ledgerFile);
    }
    function readLedger() {
        const observedBytes = treeBytes(root);
        const saved = existsSync(ledgerFile) ? JSON.parse(readFileSync(ledgerFile, 'utf8')) : null;
        if (saved && (saved.version !== 1 || saved.root !== root || !Number.isFinite(saved.chargedBytes))) throw Error('Invalid resource ledger');
        // Charge externally created files as well. Deletion never returns a previous charge.
        const chargedBytes = saved ? saved.chargedBytes + Math.max(0, observedBytes - saved.observedBytes) : observedBytes;
        return { version: 1, root, chargedBytes, observedBytes };
    }
    function snapshot() {
        const ledger = readLedger(), freeBytes = free(existingParent(root)), rssBytes = rss();
        return { ...ledger, freeBytes, rssBytes, reserveBytes, maxAddedBytes, maxRssBytes, taskOutputBytes,
            taskWrittenBytes, recoveryBytes, availableBytes: Math.max(0, Math.min(freeBytes - reserveBytes - recoveryBytes, maxAddedBytes - ledger.chargedBytes - recoveryBytes)) };
    }
    function assertCapacity(bytes = 0, label = 'offline task', recovery = false) {
        if (!Number.isSafeInteger(bytes) || bytes < 0) throw Error('Invalid byte estimate');
        const state = snapshot(), cushion = recovery ? 0 : recoveryBytes;
        if (state.freeBytes - bytes < reserveBytes + cushion) throw Error(`${label}: ${reserveBytes / GiB} GiB disk reserve would be violated`);
        if (state.chargedBytes + bytes + cushion > maxAddedBytes) throw Error(`${label}: cumulative added-byte cap exceeded`);
        if (!recovery && taskWrittenBytes + bytes > taskOutputBytes) throw Error(`${label}: per-task output limit exceeded`);
        if (!recovery && state.rssBytes > maxRssBytes) throw Error(`${label}: RSS limit exceeded`);
        if (recovery && bytes > recoveryBytes) throw Error('Recovery record exceeds reserved allowance');
        return state;
    }
    function writeFileAtomic(path: string, input: Uint8Array | string, options: { recovery?: boolean; replace?: boolean } = {}) {
        const file = resolveOutput(path), data = typeof input === 'string' ? Buffer.from(input) : Buffer.from(input), digest = sha(data);
        if (existsSync(file)) {
            const previous = readFileSync(file);
            if (sha(previous) === digest) return digest;
            if (options.replace === false) throw Error(`Refusing to replace different output: ${file}`);
        }
        assertCapacity(data.length, file, options.recovery);
        mkdirSync(root, { recursive: true });
        let descriptor: number;
        try { descriptor = openSync(lockFile, 'wx'); }
        catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
            const bytes = readFileSync(lockFile), owner = JSON.parse(bytes.toString());
            if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0) throw Error('Unknown resource lock owner; preserve the lock for inspection');
            let dead = false;
            try { process.kill(owner.pid, 0); }
            catch (status) { dead = (status as NodeJS.ErrnoException).code === 'ESRCH'; }
            if (!dead) throw Error('Another MF97 output writer holds the resource lock; inspect its owner before retrying');
            if (sha(readFileSync(lockFile)) !== sha(bytes)) throw Error('Resource lock owner changed during recovery');
            // Retain the dead owner's record. Never remove an active or unknown writer lock.
            renameSync(lockFile, resolve(root, `.resource-budget.stale-lock-${owner.pid}-${Date.now()}.json`));
            descriptor = openSync(lockFile, 'wx');
        }
        try {
            writeFileSync(descriptor, JSON.stringify({ pid: process.pid, file }));
            // Recheck immutable output identity under the lock: another writer may
            // have completed between the first existence check and lock acquisition.
            resolveOutput(file);
            if (existsSync(file)) {
                if (sha(readFileSync(file)) === digest) return digest;
                if (options.replace === false) throw Error(`Refusing to replace different output: ${file}`);
            }
            // Recheck under the lock, before any output is allocated.
            assertCapacity(data.length, file, options.recovery);
            const ledger = readLedger();
            ledger.chargedBytes += data.length;
            writeLedger(ledger);
            mkdirSync(dirname(file), { recursive: true });
            const temporary = file + '.next';
            if (lstatSync(temporary, { throwIfNoEntry: false })?.isSymbolicLink()) throw Error('Temporary output is a symlink; preserve it for inspection');
            if (existsSync(temporary) && sha(readFileSync(temporary)) !== digest) {
                // A killed writer may have left only part of the expected buffer. Preserve it
                // under its content hash while preparing the complete, independently verified file.
                const interruptedHash = sha(readFileSync(temporary));
                const preserved = `${file}.interrupted-${interruptedHash}`;
                if (existsSync(preserved)) throw Error(`Interrupted output already preserved; inspect ${temporary}`);
                renameSync(temporary, preserved);
            }
            if (!existsSync(temporary)) {
                const handle = openSync(temporary, 'wx');
                try { writeFileSync(handle, data); } finally { closeSync(handle); }
            }
            if (sha(readFileSync(temporary)) !== digest) throw Error('Atomic output readback mismatch');
            renameSync(temporary, file);
            ledger.observedBytes = treeBytes(root);
            writeLedger(ledger);
            taskWrittenBytes += data.length;
            return digest;
        } finally { closeSync(descriptor); unlinkSync(lockFile); }
    }
    function writeJsonAtomic(path: string, value: unknown, options?: { recovery?: boolean; replace?: boolean }) {
        return writeFileAtomic(path, JSON.stringify(value), options);
    }
    return { root, resolveOutput, assertCapacity, snapshot, writeFileAtomic, writeJsonAtomic };
}

// Python audits use this writer too, so all languages share the same resource ledger.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2);
    const resources = createOfflineResources(offlineResourceOptions(args));
    if (args.includes('--write-json')) {
        const output = args[args.indexOf('--write-json') + 1];
        if (!output) throw Error('--write-json requires a path');
        const input = readFileSync(0, 'utf8');
        const hash = resources.writeJsonAtomic(output, JSON.parse(input), { replace: false });
        console.log(JSON.stringify({ output: resolve(resources.root, output), hash, resources: resources.snapshot() }));
    } else if (args.includes('--check')) {
        const index = args.indexOf('--estimated-bytes'), bytes = index < 0 ? 0 : Number(args[index + 1]);
        const outputIndex = args.indexOf('--check-output');
        if (outputIndex >= 0) resources.resolveOutput(args[outputIndex + 1]);
        console.log(JSON.stringify(resources.assertCapacity(bytes, 'offline preflight')));
    } else throw Error('Use --check or --write-json');
}
