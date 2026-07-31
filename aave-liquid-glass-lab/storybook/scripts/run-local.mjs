import { mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const storybookRoot = resolve(import.meta.dirname, '..');
const cacheRoot = resolve(storybookRoot, '.cache');
const tempRoot = resolve(cacheRoot, 'tmp');
const npmCacheRoot = resolve(cacheRoot, 'npm');
const playwrightCacheRoot = resolve(cacheRoot, 'ms-playwright');

for (const directory of [cacheRoot, tempRoot, npmCacheRoot, playwrightCacheRoot]) {
  mkdirSync(directory, { recursive: true });
}

const [requestedCommand, ...args] = process.argv.slice(2);
if (!requestedCommand) {
  throw new Error('run-local.mjs requires a command');
}

const localBinary = resolve(storybookRoot, 'node_modules/.bin', requestedCommand);
const command =
  requestedCommand === 'node'
    ? process.execPath
    : requestedCommand === 'storybook' || requestedCommand === 'tsc'
      ? localBinary
      : requestedCommand;

const result = spawnSync(command, args, {
  cwd: storybookRoot,
  env: {
    ...process.env,
    TMPDIR: tempRoot,
    TMP: tempRoot,
    TEMP: tempRoot,
    npm_config_cache: npmCacheRoot,
    PLAYWRIGHT_BROWSERS_PATH: playwrightCacheRoot
  },
  stdio: 'inherit'
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);

