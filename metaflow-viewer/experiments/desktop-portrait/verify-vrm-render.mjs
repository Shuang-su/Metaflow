#!/usr/bin/env node
/**
 * Verify VRM actually loads and renders
 * Wait for explicit completion state, capture diagnostics
 */
import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import { writeFile } from 'fs/promises';

const PORT = 4202;

function startServer() {
    return new Promise((resolve) => {
        const server = spawn('node', ['serve.mjs'], {
            env: { ...process.env, PORT: String(PORT) },
            stdio: 'pipe'
        });
        server.stdout.on('data', () => resolve(server));
        setTimeout(() => resolve(server), 2000);
    });
}

async function main() {
    console.log('Starting server...');
    const server = await startServer();
    
    try {
        console.log(`Server running on http://127.0.0.1:${PORT}`);
        
        const browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--enable-unsafe-swiftshader'
            ]
        });
        
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
        
        const errors = [];
        const logs = [];
        
        page.on('console', msg => {
            logs.push(`${msg.type()}: ${msg.text()}`);
            console.log(`  [console.${msg.type()}]`, msg.text());
        });
        
        page.on('pageerror', error => {
            errors.push(`PageError: ${error.message}`);
            console.error('  [pageerror]', error.message);
        });
        
        console.log('\n=== Loading VRM page ===');
        await page.goto(`http://127.0.0.1:${PORT}/?vrm=models/Seed-san.vrm`, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        
        console.log('\n=== Waiting for model to load (checking diagnostics) ===');
        
        // Wait for VRM to actually load by checking diagnostics
        try {
            await page.waitForFunction(
                () => {
                    if (typeof window.diagnostics !== 'function') return false;
                    const diag = window.diagnostics();
                    console.log('Diag check:', JSON.stringify({
                        ready: diag.ready,
                        modelType: diag.modelType,
                        activeLoads: diag.activeLoads,
                        vrmHumanoid: diag.vrmHumanoid
                    }));
                    // Wait for ready=true, modelType='vrm', and vrmHumanoid present
                    return diag.ready === true && 
                           diag.modelType === 'vrm' && 
                           diag.vrmHumanoid === 'present' &&
                           diag.activeLoads === 0;
                },
                { timeout: 60000, polling: 500 }
            );
            console.log('✅ VRM loaded successfully!');
        } catch (err) {
            console.error('❌ Timeout waiting for VRM load:', err.message);
            
            // Get current state
            const state = await page.evaluate(() => {
                if (typeof window.diagnostics === 'function') {
                    return window.diagnostics();
                }
                return { error: 'diagnostics not available' };
            });
            console.log('Current state:', JSON.stringify(state, null, 2));
            
            // Get status message
            const status = await page.evaluate(() => {
                const el = document.getElementById('message');
                return el ? el.textContent : 'no status element';
            });
            console.log('Status message:', status);
        }
        
        // Get final diagnostics
        const finalDiag = await page.evaluate(() => {
            if (typeof window.diagnostics !== 'function') return null;
            return window.diagnostics();
        });
        
        console.log('\n=== Final Diagnostics ===');
        console.log(JSON.stringify(finalDiag, null, 2));
        
        // Take screenshot
        await page.screenshot({ path: '/tmp/vrm-actual-render.png' });
        console.log('\n✅ Screenshot saved to /tmp/vrm-actual-render.png');
        
        // Save diagnostics
        await writeFile('/tmp/vrm-diagnostics.json', JSON.stringify(finalDiag, null, 2));
        
        await browser.close();
        
        // Summary
        console.log('\n=== Summary ===');
        console.log(`Errors: ${errors.length}`);
        if (errors.length > 0) {
            errors.forEach(e => console.log('  -', e));
        }
        console.log(`Model Type: ${finalDiag?.modelType}`);
        console.log(`VRM Humanoid: ${finalDiag?.vrmHumanoid}`);
        console.log(`Ready: ${finalDiag?.ready}`);
        console.log(`Active Loads: ${finalDiag?.activeLoads}`);
        
        if (finalDiag?.modelType === 'vrm' && finalDiag?.vrmHumanoid === 'present') {
            console.log('\n✅ SUCCESS: VRM model loaded and ready');
            process.exit(0);
        } else {
            console.log('\n❌ FAILED: VRM not properly loaded');
            process.exit(1);
        }
        
    } finally {
        server.kill();
    }
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
