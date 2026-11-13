#!/usr/bin/env node
/**
 * Properly wait for rendering and capture screenshots
 */
import { spawn } from 'child_process';
import { writeFile } from 'fs/promises';

const PORT = 4183;

function startServer() {
    const server = spawn('node', ['serve.mjs'], {
        env: { ...process.env, PORT: String(PORT) },
        stdio: 'pipe'
    });
    return new Promise((resolve) => {
        server.stdout.on('data', (data) => {
            if (data.toString().includes('127.0.0.1')) {
                resolve(server);
            }
        });
        setTimeout(() => resolve(server), 3000);
    });
}

async function captureWithWait(url, output, description) {
    console.log(`\n=== ${description} ===`);
    
    // Use Node.js script injection to wait for ready state
    const script = `
        const checkReady = () => {
            if (typeof window.diagnostics === 'function') {
                const diag = window.diagnostics();
                console.log('DIAG:', JSON.stringify(diag));
                return diag.ready === true;
            }
            return false;
        };
        
        let attempts = 0;
        const maxAttempts = 50;
        
        const waitForReady = () => {
            if (checkReady()) {
                console.log('READY: true');
            } else {
                attempts++;
                if (attempts < maxAttempts) {
                    setTimeout(waitForReady, 200);
                } else {
                    console.log('TIMEOUT: waiting for ready');
                }
            }
        };
        
        window.addEventListener('load', () => {
            console.log('LOADED: window loaded');
            waitForReady();
        });
    `;
    
    const chrome = spawn('google-chrome', [
        '--headless',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-software-rasterizer',
        '--window-size=1280,800',
        `--screenshot=${output}`,
        '--hide-scrollbars',
        `--evaluate=${script}`,
        '--timeout=15000',
        url
    ], { stdio: 'pipe' });
    
    let stdout = '';
    let stderr = '';
    chrome.stdout.on('data', d => { stdout += d.toString(); });
    chrome.stderr.on('data', d => { stderr += d.toString(); });
    
    await new Promise((resolve) => {
        chrome.on('exit', () => {
            // Extract console output
            const readyMatch = stdout.match(/READY: (\w+)/);
            const diagMatch = stdout.match(/DIAG: ({.*})/);
            
            console.log('Ready:', readyMatch ? readyMatch[1] : 'unknown');
            if (diagMatch) {
                try {
                    const diag = JSON.parse(diagMatch[1]);
                    console.log('Diagnostics:', JSON.stringify(diag, null, 2));
                } catch {}
            }
            
            // Check for errors
            const errors = stderr.split('\n').filter(line => 
                line.includes('Console') || line.includes('Error:') && !line.includes('dbus')
            );
            if (errors.length > 0) {
                console.log('Errors found:', errors.slice(0, 5));
            }
            
            resolve();
        });
    });
    
    // Wait a bit for screenshot to be written
    await new Promise(resolve => setTimeout(resolve, 1000));
}

async function main() {
    console.log('Starting server...');
    const server = await startServer();
    
    try {
        // Wait for server to be fully ready
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        await captureWithWait(
            `http://127.0.0.1:${PORT}/`,
            '/tmp/verified-gaussian.png',
            'Gaussian Baseline'
        );
        
        await captureWithWait(
            `http://127.0.0.1:${PORT}/?vrm=Seed-san.vrm`,
            '/tmp/verified-vrm.png',
            'VRM Loading'
        );
        
        console.log('\n=== Screenshots saved ===');
        console.log('/tmp/verified-gaussian.png');
        console.log('/tmp/verified-vrm.png');
        
    } finally {
        server.kill();
    }
}

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
