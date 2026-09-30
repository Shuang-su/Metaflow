import { defineConfig } from '@playwright/test';
import path from 'node:path';

const artifacts = process.env.METAFLOW_TEST_OUTPUT ?? path.resolve('../.codex-work/tmp/editor-tests');
export default defineConfig({
    testDir: './tests/e2e',
    outputDir: artifacts,
    fullyParallel: false,
    workers: 1,
    timeout: 120_000,
    expect: { timeout: 20_000 },
    reporter: 'line',
    use: {
        actionTimeout: 15_000,
        baseURL: 'http://127.0.0.1:4356',
        channel: process.env.METAFLOW_TEST_EXECUTABLE ? undefined : (process.env.METAFLOW_TEST_CHANNEL ?? 'chrome'),
        launchOptions: process.env.METAFLOW_TEST_EXECUTABLE ? { executablePath: process.env.METAFLOW_TEST_EXECUTABLE } : undefined,
        headless: false,
        viewport: { width: 1440, height: 900 },
        locale: 'en-US',
        deviceScaleFactor: 1,
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure',
        serviceWorkers: 'block'
    },
    webServer: {
        command: 'node scripts/test-server.mjs',
        url: 'http://127.0.0.1:4356/editor/',
        reuseExistingServer: !process.env.CI,
        timeout: 30_000
    }
});
