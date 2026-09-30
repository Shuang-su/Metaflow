import { defineConfig } from '@playwright/test';
export default defineConfig({
    testDir: './tests/studio-package', outputDir: '../.codex-work/tmp/studio-package-tests', workers: 1,
    timeout: 120000, expect: { timeout: 15000 }, reporter: 'line',
    use: { baseURL: 'http://127.0.0.1:4369', channel: 'chrome', headless: false,
        viewport: { width: 1440, height: 900 }, locale: 'zh-CN', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
    webServer: { command: 'node scripts/serve-studio-package.mjs', url: 'http://127.0.0.1:4369/studio/', reuseExistingServer: false }
});
