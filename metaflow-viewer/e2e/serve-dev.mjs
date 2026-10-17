// Start the test server only after the watcher's complete initial build. A file existing
// (or returning HTTP 200) is not readiness: Rollup may be replacing that HTML at the time.
import { spawn } from 'node:child_process';
import { watch } from 'rollup';
import { loadConfigFile } from 'rollup/loadConfigFile';

process.env.ROLLUP_WATCH = 'true';
const { options, warnings } = await loadConfigFile(new URL('../rollup.config.mjs', import.meta.url).pathname);
warnings.flush();
const watcher = watch(options);
let server;
let closing = false;
const close = async (code = 0) => {
    if (closing) return;
    closing = true;
    server?.kill('SIGTERM');
    await watcher.close();
    process.exit(code);
};
watcher.on('event', (event) => {
    if (event.code === 'BUNDLE_END') void event.result.close();
    if (event.code === 'ERROR') {
        console.error(event.error);
        void close(1);
    }
    if (event.code === 'END' && !server) {
        server = spawn(process.execPath, ['node_modules/serve/build/main.js', '-s', 'public', '-l', '4173'], { stdio: 'inherit' });
        server.on('error', (error) => { console.error(error); void close(1); });
        server.on('exit', code => { if (!closing) void close(code || 0); });
    }
});
process.on('SIGINT', () => void close());
process.on('SIGTERM', () => void close());
