import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const [origin, output, ...cases] = process.argv.slice(2);
if (!origin || !output || !cases.length)
    throw Error('benchmark-opening ORIGIN OUTPUT scene:strategy:desktop|phone:fast|limited[:warm] ...');
const routes = {
    apec: '/shenzhen/APECMediaCenter',
    nanhai: '/shenzhen/nanhai-e-cool-building-3',
    acg: '/acg/2568/2026',
    orbit: '/shenzhen/shenzhen-university-yuehai-campus'
};
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--use-angle=metal', '--no-proxy-server', '--disable-background-timer-throttling']
});
try {
    for (const item of cases) {
        const [scene, strategy, size, link, warm] = item.split(':');
        const context = await browser.newContext(
            size === 'phone'
                ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
                : { viewport: { width: 1280, height: 825 } }
        );
        const page = await context.newPage();
        const cdp = await context.newCDPSession(page);
        await cdp.send('Network.enable');
        if (link === 'limited')
            await cdp.send('Network.emulateNetworkConditions', {
                offline: false,
                latency: 45,
                downloadThroughput: 4e6,
                uploadThroughput: 1e6
            });
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.addInitScript(() => {
            performance.setResourceTimingBufferSize(8000);
            window.openingTrace = [];
            window.firstFrame = () => {
                const v = window.metaflowViewer;
                const c = v?.app.root.findComponents('camera')[0]?.entity;
                window.openingSubmitted = {
                    ms: performance.now(),
                    eye: c?.getPosition().toArray(),
                    forward: c?.forward.toArray(),
                    fov: c?.camera.fov,
                    time: v?.state.animationTime,
                    mode: v?.state.cameraMode,
                    points: v?.app.stats.frame.gsplats
                };
            };
            let previous = '';
            let t;
            const sample = () => {
                const v = window.metaflowViewer;
                const root = document.querySelector('.sse-viewer');
                const text = document.querySelector('.sse-loadingText')?.textContent;
                const metric = document.querySelector('.sse-openingTransfer')?.textContent;
                if (!root || !text) return;
                const phase = root.dataset.initialViewStage;
                const status = document.querySelector('.sse-loadingStatus')?.textContent;
                const signature = [text, metric, phase, status].join('|');
                if (signature !== previous || v?.state.loaded) {
                    window.openingTrace.push({
                        ms: Math.round(performance.now()),
                        text,
                        metric,
                        phase,
                        status,
                        strategy: root.dataset.openingStrategy
                    });
                    previous = signature;
                }
                if (v?.state.loaded) clearInterval(t);
            };
            t = setInterval(sample, 100);
        });
        const url = new URL(routes[scene], origin);
        url.searchParams.set('noanalytics', '');
        url.searchParams.set('webgl', '');
        if (strategy !== 'auto') url.searchParams.set('openingStrategy', strategy);
        const label = item.replaceAll(':', '-');
        try {
            for (let i = 0; i < (warm ? 2 : 1); i++) {
                if (i) await page.goto('about:blank');
                await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 90000 });
                await page.waitForFunction(() => window.metaflowViewer?.state.loaded, null, { timeout: 240000 });
                const result = await page.evaluate(() => {
                    const v = window.metaflowViewer,
                        c = v.app.root.findComponents('camera')[0].entity;
                    const entries = performance
                        .getEntriesByType('resource')
                        .filter((e) => /\/streamed\/|\.sog(\?|$)/.test(e.name));
                    return {
                        forecast: document.querySelector('.sse-viewer')?.dataset.openingForecast,
                        submitted: window.openingSubmitted,
                        ms: performance.now(),
                        trace: window.openingTrace,
                        body: entries.reduce((n, e) => n + e.encodedBodySize, 0),
                        wire: entries.reduce((n, e) => n + e.transferSize, 0),
                        first: entries
                            .filter((e) => e.name.endsWith('meta.json') && !e.name.endsWith('lod-meta.json'))
                            .slice(0, 12)
                            .map((e) => new URL(e.name).pathname.split('/').slice(-2).join('/')),
                        camera: {
                            eye: c.getPosition().toArray(),
                            forward: c.forward.toArray(),
                            fov: c.camera.fov,
                            time: v.state.animationTime,
                            duration: v.state.animationDuration,
                            points: v.app.stats.frame.gsplats
                        },
                        loaded: v.state.loaded
                    };
                });
                const suffix = i === 1 ? 'warm' : 'cold';
                await page.screenshot({
                    path: path.join(output, label + '-' + suffix + '.jpg'),
                    type: 'jpeg',
                    quality: 80,
                    timeout: 10000
                });
                await fs.writeFile(
                    path.join(output, label + '-' + suffix + '.json'),
                    JSON.stringify({ ...result, errors })
                );
                console.log(
                    label,
                    suffix,
                    Math.round(result.ms),
                    result.body,
                    result.wire,
                    result.camera.points,
                    result.trace.at(-1)
                );
            }
        } catch (e) {
            await fs.writeFile(
                path.join(output, label + '-error.json'),
                JSON.stringify({
                    error: String(e),
                    errors,
                    trace: await page.evaluate(() => window.openingTrace).catch(() => null)
                })
            );
            console.error(label, String(e));
            process.exitCode = 1;
        } finally {
            await context.close();
        }
    }
} finally {
    await browser.close();
}
