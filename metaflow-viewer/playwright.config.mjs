import { defineConfig } from '@playwright/test';

const mode = process.env.E2E_MODE === 'dev' ? 'dev' : 'build';
const port = mode === 'dev' ? 4173 : 4174;
const extended = process.env.E2E_EXTENDED === '1';
const extendedBrowser = process.env.E2E_BROWSER || 'chromium';
const extendedRenderer = process.env.E2E_RENDERER || 'webgl';

export default defineConfig({
    testDir: './e2e',
    outputDir: `test-results/${mode}`,
    snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/{arg}-{projectName}-{platform}{ext}',
    fullyParallel: false,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 1 : 0,
    workers: 1,
    reporter: process.env.CI ? [['line'], ['html', { outputFolder: `playwright-report/${mode}`, open: 'never' }]] : 'line',
    expect: {
        timeout: 15_000,
        toHaveScreenshot: {
            animations: 'disabled',
            caret: 'hide',
            maxDiffPixelRatio: 0.01
        }
    },
    use: {
        baseURL: `http://127.0.0.1:${port}`,
        browserName: 'chromium',
        colorScheme: 'dark',
        deviceScaleFactor: 1,
        hasTouch: false,
        locale: 'en-US',
        timezoneId: 'Asia/Shanghai',
        reducedMotion: 'reduce',
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure',
        video: 'retain-on-failure'
    },
    projects: extended ? [
        {
            name: `${extendedBrowser}-${extendedRenderer}-desktop`,
            use: {
                browserName: extendedBrowser,
                viewport: { width: 1440, height: 900 },
                launchOptions: extendedBrowser === 'chromium' && extendedRenderer === 'webgpu'
                    ? { args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan'] }
                    : undefined
            }
        }
    ] : [
        {
            name: 'chromium-webgl-desktop',
            use: { viewport: { width: 1440, height: 900 } }
        },
        {
            name: 'chromium-webgl-mobile',
            use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
        }
    ],
    webServer: {
        command: mode === 'dev' ? 'npm run serve:e2e:dev' : 'npm run serve:e2e:build',
        url: `http://127.0.0.1:${port}/index.html`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: 'pipe',
        stderr: 'pipe'
    }
});
