import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

test('MF-148 absent WebGPU explains compatibility edition with particle video', async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, 'gpu', { value: undefined }));
    await page.goto('/editor/');
    await expect(page.locator('#startup-error')).toBeVisible();
    await expect(page.locator('#startup-error a')).toHaveAttribute('href', '/editor-legacy/');
    await expect(page.locator('#startup-error a')).toContainText('particle video');
    await page.locator('#startup-error a').click();
    await page.waitForFunction(() => window.scene?.events?.functions.has('render.video'));
});

test('MF-148 actual production worker upgrades without reloading an unsaved page or clearing other caches', async ({ browser }) => {
    test.skip(!process.env.METAFLOW_PRODUCTION_SITE, 'Provide the verified production site for the old worker fixture');
    const production = path.resolve(process.env.METAFLOW_PRODUCTION_SITE, 'editor');
    const oldWorker = await readFile(path.join(production, 'sw.js'));
    expect(oldWorker.toString()).toContain("appSemver: '1.1.0'");
    const retirement = await readFile('dist/sw.js');
    let upgrade = false;
    const server = createServer(async (request, response) => {
        try {
            const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
            if (pathname === '/editor/sw.js') {
                response.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-cache' });
                response.end(upgrade ? retirement : oldWorker);
            } else if (pathname === '/editor/' || pathname === '/editor/index.html') {
                response.writeHead(200, { 'Content-Type': 'text/html' });
                response.end('<textarea id="draft"></textarea>');
            } else {
                const file = path.resolve(production, pathname.slice('/editor/'.length));
                if (!pathname.startsWith('/editor/') || !file.startsWith(`${production}/`)) throw Error('Invalid fixture route');
                response.end(await readFile(file));
            }
        } catch { response.writeHead(404); response.end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const context = await browser.newContext({ serviceWorkers: 'allow' });
    try {
        const page = await context.newPage();
        await page.goto(`http://127.0.0.1:${server.address().port}/editor/`);
        await page.evaluate(async () => {
            await navigator.serviceWorker.register('./sw.js');
            await navigator.serviceWorker.ready;
        });
        await page.waitForFunction(async () => (await (await caches.open('metaflow-editor-v1.1.0-ss2.28.0')).keys()).length >= 24);
        await page.reload();
        await page.waitForFunction(() => !!navigator.serviceWorker.controller);
        await page.locator('#draft').fill('unsaved project remains open');
        await page.evaluate(async () => {
            window.unsavedDraftMarker = 'retained';
            const other = await caches.open('unrelated-viewer-cache');
            await other.put('/unrelated-data', new Response('retained'));
        });
        upgrade = true;
        await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
        await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistrations()).length === 0 &&
            !(await caches.keys()).some(name => name.startsWith('metaflow-editor-v')));
        expect(await page.evaluate(() => window.unsavedDraftMarker)).toBe('retained');
        await expect(page.locator('#draft')).toHaveValue('unsaved project remains open');
        expect(await page.evaluate(async () => (await (await caches.open('unrelated-viewer-cache')).match('/unrelated-data')).text())).toBe('retained');
    } finally {
        await context.close();
        await new Promise(resolve => server.close(resolve));
    }
});
