/** Serial process isolation; resume planned checkpoints, never retry failures. */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadAssetConfig } from './asset-config.mjs';
const project = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2), index = args.indexOf('--job');
if (index < 0 || !args[index + 1]) throw Error('Requires --job');
const job = JSON.parse(readFileSync(args[index + 1], 'utf8'));
if (!/^[a-z0-9][a-z0-9._-]*$/.test(job.id)) throw Error('Invalid job id');
const rootIndex = args.indexOf('--cache-root');
if (rootIndex >= 0 && (!args[rootIndex + 1] || args[rootIndex + 1].startsWith('--')))
  throw Error('Missing --cache-root');
const root = rootIndex >= 0 ? args[rootIndex + 1] : process.env.MF97_CACHE_ROOT ?? loadAssetConfig().roots.continuation;
const manifest = resolve(root, 'dayun/navigation', job.id, 'manifest.json');
let previousRun, previousCount = -1;
while (true) {
  const child = spawnSync(process.execPath, [resolve(project, 'scripts/mf97/run-job.mjs'),
    resolve(project, 'mf97-viewer-trial/node_modules/tsx/dist/cli.mjs'),
    resolve(project, 'mf97-viewer-trial/scripts/dayun-generate.ts'), ...args], { cwd: project, stdio: 'inherit' });
  if (child.error || child.status !== 0) throw Error(`Generation failed; automatic retry disabled: ${child.error ?? child.signal ?? child.status}`);
  const state = JSON.parse(readFileSync(manifest, 'utf8'));
  if (['analysis-complete', 'complete'].includes(state.status) && state.lastRun?.outcome === 'complete') break;
  if (state.status !== 'building' || state.lastRun?.outcome !== 'checkpointed' ||
      state.lastRun.generated < 1 || state.lastRun.runId === previousRun || state.tiles.length <= previousCount)
    throw Error('Generator stopped without a progressing planned checkpoint');
  previousRun = state.lastRun.runId; previousCount = state.tiles.length;
}
console.log(JSON.stringify({ outcome: 'complete', manifest }));
