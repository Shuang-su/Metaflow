import { defineConfig } from '@playwright/test';
export default defineConfig({
    testDir: './tests/studio', outputDir: process.env.STUDIO_TEST_OUTPUT ?? '../.codex-work/tmp/studio-tests', workers: 1,
    timeout: 120000, expect: { timeout: 15000 }, reporter: 'line',
    use: { actionTimeout: 15000, baseURL: 'http://127.0.0.1:4368', channel: 'chrome', headless: false,
        viewport: { width: 1440, height: 900 }, locale: 'zh-CN', deviceScaleFactor: 1,
        screenshot: 'only-on-failure', trace: 'retain-on-failure' },
    webServer: { command: 'node scripts/serve-studio.mjs', url: 'http://127.0.0.1:4368/studio/', reuseExistingServer: true }
});
