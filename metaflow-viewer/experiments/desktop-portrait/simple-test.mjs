#!/usr/bin/env node
/**
 * Simplified automated test - just screenshots and basic verification
 */
import puppeteer from 'puppeteer';
import { spawn } from 'child_process';

const PORT = 4206;
const SS_DIR = '/opt/cursor/artifacts';

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
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required']
        });
        
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
        
        console.log('Loading VRM...');
        await page.goto(`http://127.0.0.1:${PORT}/?vrm=models/Seed-san.vrm`, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        
        // Wait for VRM to load
        await page.waitForFunction(
            () => {
                if (typeof window.diagnostics !== 'function') return false;
                const diag = window.diagnostics();
                return diag && diag.ready === true && diag.modelType === 'vrm';
            },
            { timeout: 60000, polling: 500 }
        );
        console.log('✅ VRM loaded\n');
        
        // Baseline
        console.log('Screenshot 1: Baseline');
        await new Promise(r => setTimeout(r, 1000));
        await page.screenshot({ path: `${SS_DIR}/test-01-baseline.png` });
        
        // Change eye X
        console.log('Screenshot 2: Eye X = 20cm');
        await page.evaluate(() => {
            const slider = document.getElementById('eyeX');
            slider.value = 20;
            slider.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await new Promise(r => setTimeout(r, 500));
        await page.screenshot({ path: `${SS_DIR}/test-02-eye-x-20.png` });
        
        // Change eye Y
        console.log('Screenshot 3: Eye Y = 25cm');
        await page.evaluate(() => {
            document.getElementById('eyeX').value = 0;
            document.getElementById('eyeX').dispatchEvent(new Event('input', { bubbles: true }));
            const slider = document.getElementById('eyeY');
            slider.value = 25;
            slider.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await new Promise(r => setTimeout(r, 500));
        await page.screenshot({ path: `${SS_DIR}/test-03-eye-y-25.png` });
        
        // Change tilt
        console.log('Screenshot 4: Tilt = 75°');
        await page.evaluate(() => {
            document.getElementById('eyeY').value = 15;
            document.getElementById('eyeY').dispatchEvent(new Event('input', { bubbles: true }));
            const slider = document.getElementById('tilt');
            slider.value = 75;
            slider.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await new Promise(r => setTimeout(r, 500));
        await page.screenshot({ path: `${SS_DIR}/test-04-tilt-75.png` });
        
        // Reset and test audio
        console.log('Screenshot 5: Playing audio');
        await page.evaluate(() => {
            document.getElementById('tilt').value = 65;
            document.getElementById('tilt').dispatchEvent(new Event('input', { bubbles: true }));
            document.getElementById('playTestAudio').click();
        });
        await new Promise(r => setTimeout(r, 1500));
        await page.screenshot({ path: `${SS_DIR}/test-05-audio-playing.png` });
        
        // Stop audio
        console.log('Screenshot 6: Audio stopped\n');
        await page.evaluate(() => document.getElementById('stopAudio').click());
        await new Promise(r => setTimeout(r, 500));
        await page.screenshot({ path: `${SS_DIR}/test-06-audio-stopped.png` });
        
        await browser.close();
        
        console.log('✅ Test complete!');
        console.log('Screenshots saved to', SS_DIR);
        console.log('  test-01-baseline.png');
        console.log('  test-02-eye-x-20.png');
        console.log('  test-03-eye-y-25.png');
        console.log('  test-04-tilt-75.png');
        console.log('  test-05-audio-playing.png');
        console.log('  test-06-audio-stopped.png');
        
    } finally {
        server.kill();
    }
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
