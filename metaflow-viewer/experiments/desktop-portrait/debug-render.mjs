/**
 * Debug actual rendering with proper error capture
 */
import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import { setTimeout as sleep } from 'timers/promises';

const PORT = 4181;

async function startServer() {
    return new Promise((resolve) => {
        const server = spawn('node', ['serve.mjs'], {
            env: { ...process.env, PORT: String(PORT) },
            stdio: 'ignore'
        });
        setTimeout(() => resolve(server), 2000);
    });
}

async function captureWithErrors(url, outputPath, waitCondition) {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    
    const errors = [];
    const consoleMessages = [];
    
    page.on('console', msg => {
        consoleMessages.push(`${msg.type()}: ${msg.text()}`);
    });
    
    page.on('pageerror', error => {
        errors.push(`PageError: ${error.message}`);
    });
    
    page.on('response', response => {
        if (!response.ok()) {
            errors.push(`HTTP ${response.status()}: ${response.url()}`);
        }
    });
    
    try {
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
        
        // Wait for condition or timeout
        if (waitCondition) {
            try {
                await page.waitForFunction(waitCondition, { timeout: 10000 });
            } catch (e) {
                errors.push(`Condition timeout: ${e.message}`);
            }
        } else {
            await sleep(5000);
        }
        
        // Get final state
        const diagnostics = await page.evaluate(() => {
            if (typeof window.diagnostics === 'function') {
                try {
                    const diag = window.diagnostics();
                    return {
                        ready: diag.ready,
                        activeLoads: diag.activeLoads,
                        assetName: diag.assetName,
                        modelType: diag.modelType,
                        gaussianCount: diag.gaussianCount,
                        eyeZ: diag.eye?.z
                    };
                } catch (e) {
                    return { error: e.message };
                }
            }
            return { error: 'diagnostics not available' };
        });
        
        await page.screenshot({ path: outputPath });
        
        return { errors, consoleMessages, diagnostics };
    } finally {
        await browser.close();
    }
}

async function main() {
    console.log('Installing puppeteer...');
    const install = spawn('npm', ['install', 'puppeteer'], { 
        cwd: process.cwd(),
        stdio: 'inherit'
    });
    await new Promise(resolve => install.on('close', resolve));
    
    console.log('\nStarting server...');
    const server = await startServer();
    
    try {
        console.log('\n=== Test 1: Gaussian Baseline ===');
        const result1 = await captureWithErrors(
            `http://127.0.0.1:${PORT}/`,
            '/tmp/debug-gaussian.png',
            '() => window.diagnostics && window.diagnostics().ready === true'
        );
        
        console.log('Diagnostics:', JSON.stringify(result1.diagnostics, null, 2));
        console.log('Errors:', result1.errors.length);
        console.log('Console messages:', result1.consoleMessages.filter(m => m.includes('error') || m.includes('Error')).slice(0, 10));
        
        console.log('\n=== Test 2: VRM Loading ===');
        const result2 = await captureWithErrors(
            `http://127.0.0.1:${PORT}/?vrm=Seed-san.vrm`,
            '/tmp/debug-vrm.png',
            '() => window.diagnostics && window.diagnostics().ready === true'
        );
        
        console.log('Diagnostics:', JSON.stringify(result2.diagnostics, null, 2));
        console.log('Errors:', result2.errors.length);
        result2.errors.forEach(e => console.log('  -', e));
        console.log('Console:', result2.consoleMessages.filter(m => 
            m.includes('error') || m.includes('Error') || m.includes('VRM') || m.includes('载入')
        ).slice(0, 15).forEach(m => console.log('  ', m)));
        
    } finally {
        server.kill();
    }
}

main().catch(console.error);
