/**
 * Simple browser-based visual test for desktop portrait experiment.
 * Launches the app, loads the calibration sample, and captures a screenshot.
 */

import { spawn } from 'child_process';
import { setTimeout as sleep } from 'timers/promises';

const PORT = 4177; // Use different port to avoid conflicts

async function launchServer() {
    return new Promise((resolve, reject) => {
        const server = spawn('node', ['serve.mjs'], {
            env: { ...process.env, PORT: String(PORT) },
            stdio: ['ignore', 'pipe', 'pipe']
        });
        
        let started = false;
        const timeout = setTimeout(() => {
            if (!started) {
                server.kill();
                reject(new Error('Server failed to start in 5s'));
            }
        }, 5000);
        
        server.stdout.on('data', (data) => {
            const output = data.toString();
            if (output.includes('127.0.0.1')) {
                started = true;
                clearTimeout(timeout);
                resolve(server);
            }
        });
        
        server.on('error', reject);
    });
}

async function captureScreenshot() {
    const chrome = spawn('google-chrome', [
        '--headless',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-software-rasterizer',
        '--window-size=1280,800',
        `--screenshot=/tmp/desktop-portrait-test.png`,
        '--hide-scrollbars',
        '--virtual-time-budget=3000',
        `http://127.0.0.1:${PORT}/`
    ], { stdio: 'inherit' });
    
    return new Promise((resolve, reject) => {
        chrome.on('exit', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Chrome exited with code ${code}`));
        });
        chrome.on('error', reject);
    });
}

async function main() {
    console.log('Starting server...');
    const server = await launchServer();
    
    try {
        console.log('Waiting for app to initialize...');
        await sleep(2000);
        
        console.log('Capturing screenshot...');
        await captureScreenshot();
        
        console.log('Screenshot saved to /tmp/desktop-portrait-test.png');
        console.log('✓ Browser test completed');
    } catch (error) {
        console.error('Browser test failed:', error.message);
        process.exit(1);
    } finally {
        server.kill();
    }
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
