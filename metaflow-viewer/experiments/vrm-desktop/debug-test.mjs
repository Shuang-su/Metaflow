/**
 * Debug test to capture detailed network and console logs
 */

import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function debugTest() {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--enable-unsafe-swiftshader',
            '--use-gl=swiftshader'
        ]
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1024, height: 768 });
    
    // Log all console messages
    page.on('console', msg => {
        console.log(`[${msg.type()}]`, msg.text());
    });
    
    // Log all network requests
    page.on('request', request => {
        console.log(`→ ${request.method()} ${request.url()}`);
    });
    
    page.on('response', response => {
        const status = response.status();
        const url = response.url();
        if (status >= 400) {
            console.log(`✗ ${status} ${url}`);
        } else {
            console.log(`✓ ${status} ${url}`);
        }
    });
    
    // Log errors
    page.on('pageerror', error => {
        console.error('[PAGE ERROR]', error.message);
        console.error(error.stack);
    });
    
    try {
        console.log('Loading http://localhost:8766/ ...\n');
        await page.goto('http://localhost:8766/', { 
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        
        console.log('\nWaiting 10 seconds for VRM loading and initialization...\n');
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        // Get diagnostics
        const diagnostics = await page.evaluate(() => {
            const app = window.app;
            if (!app) {
                return { error: 'App not initialized' };
            }
            if (!app.vrm) {
                return { error: 'VRM not loaded', hasApp: true };
            }
            
            // Simple diagnostics without THREE constructors
            return {
                diagnostics: window.diagnostics,
                hasVRM: !!app.vrm,
                vrmSceneChildren: app.vrm.scene.children.length,
                vrmPosition: [
                    app.vrm.scene.position.x,
                    app.vrm.scene.position.y,
                    app.vrm.scene.position.z
                ],
                vrmScale: [
                    app.vrm.scene.scale.x,
                    app.vrm.scene.scale.y,
                    app.vrm.scene.scale.z
                ],
                cameraPosition: [
                    app.camera.position.x,
                    app.camera.position.y,
                    app.camera.position.z
                ],
                personRootPosition: [
                    app.personRoot.position.x,
                    app.personRoot.position.y,
                    app.personRoot.position.z
                ],
                personRootChildren: app.personRoot.children.length
            };
        });
        
        console.log('\nDiagnostics:', JSON.stringify(diagnostics, null, 2));
        
        // Screenshot
        await page.screenshot({ 
            path: '/opt/cursor/artifacts/vrm-desktop-debug.png' 
        });
        console.log('\nScreenshot saved: /opt/cursor/artifacts/vrm-desktop-debug.png');
        
    } finally {
        await browser.close();
    }
}

debugTest().catch(console.error);
