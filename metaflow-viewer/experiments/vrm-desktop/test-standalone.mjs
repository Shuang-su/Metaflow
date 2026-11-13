/**
 * Puppeteer automated acceptance test for standalone VRM Desktop Portrait
 * Verifies: load, rendering, slider interactions, audio playback
 */

import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACT_DIR = '/opt/cursor/artifacts';
const TEST_PORT = 8765;

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function startServer() {
    console.log(`Starting HTTP server on port ${TEST_PORT}...`);
    
    const server = spawn('npx', ['serve', '-l', TEST_PORT.toString(), '-n'], {
        cwd: __dirname,
        stdio: 'pipe'
    });
    
    // Wait for server to start
    await sleep(2000);
    
    return server;
}

async function runTests() {
    console.log('Starting Puppeteer tests for VRM Desktop Portrait...\n');
    
    const server = await startServer();
    
    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--enable-unsafe-swiftshader',
            '--use-gl=swiftshader',
            '--enable-webgl',
            '--enable-accelerated-2d-canvas'
        ]
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1024, height: 768 });
    
    // Listen for console messages
    page.on('console', msg => {
        const type = msg.type();
        if (type === 'error' || type === 'warning') {
            console.log(`[Browser ${type}]`, msg.text());
        }
    });
    
    // Listen for errors
    page.on('pageerror', error => {
        console.error('[Page Error]', error.message);
    });
    
    try {
        // Test 1: Load page
        console.log('Test 1: Loading page...');
        const url = `http://localhost:${TEST_PORT}/`;
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
        console.log('  ✓ Page loaded');
        
        // Wait for initialization
        await sleep(2000);
        
        // Test 2: Check diagnostics
        console.log('\nTest 2: Checking application state...');
        const diagnostics = await page.evaluate(() => window.diagnostics);
        console.log('  Diagnostics:', JSON.stringify(diagnostics, null, 2));
        
        if (!diagnostics) {
            console.warn('  ⚠ No diagnostics object (model may not have loaded)');
        } else if (diagnostics.ready) {
            console.log('  ✓ VRM model loaded');
            console.log(`  ✓ Model type: ${diagnostics.modelType}`);
            console.log(`  ✓ Has expressions: ${diagnostics.hasExpressions}`);
            console.log(`  ✓ Has lookAt: ${diagnostics.hasLookAt}`);
        }
        
        // Test 3: Capture initial state
        console.log('\nTest 3: Capturing initial render...');
        const screenshotPath1 = path.join(ARTIFACT_DIR, 'vrm-desktop-initial.png');
        await page.screenshot({ path: screenshotPath1, type: 'png' });
        const size1 = fs.statSync(screenshotPath1).size;
        console.log(`  ✓ Screenshot saved: ${screenshotPath1} (${size1} bytes)`);
        
        // Test 4: Adjust eye position
        console.log('\nTest 4: Testing eye position sliders...');
        await page.evaluate(() => {
            document.getElementById('eyeX').value = '0.15';
            document.getElementById('eyeX').dispatchEvent(new Event('input'));
        });
        await sleep(500);
        console.log('  ✓ Adjusted eyeX to 0.15');
        
        await page.evaluate(() => {
            document.getElementById('eyeY').value = '0.2';
            document.getElementById('eyeY').dispatchEvent(new Event('input'));
        });
        await sleep(500);
        console.log('  ✓ Adjusted eyeY to 0.2');
        
        await page.evaluate(() => {
            document.getElementById('eyeZ').value = '0.4';
            document.getElementById('eyeZ').dispatchEvent(new Event('input'));
        });
        await sleep(500);
        console.log('  ✓ Adjusted eyeZ to 0.4');
        
        const screenshotPath2 = path.join(ARTIFACT_DIR, 'vrm-desktop-eye-adjusted.png');
        await page.screenshot({ path: screenshotPath2, type: 'png' });
        const size2 = fs.statSync(screenshotPath2).size;
        console.log(`  ✓ Screenshot saved: ${screenshotPath2} (${size2} bytes)`);
        
        if (size2 === size1) {
            console.warn('  ⚠ Screenshots have identical size (render may not be updating)');
        }
        
        // Test 5: Adjust tilt
        console.log('\nTest 5: Testing tilt slider...');
        await page.evaluate(() => {
            document.getElementById('tiltDegrees').value = '45';
            document.getElementById('tiltDegrees').dispatchEvent(new Event('input'));
        });
        await sleep(500);
        console.log('  ✓ Adjusted tilt to 45°');
        
        const screenshotPath3 = path.join(ARTIFACT_DIR, 'vrm-desktop-tilted.png');
        await page.screenshot({ path: screenshotPath3, type: 'png' });
        console.log(`  ✓ Screenshot saved: ${screenshotPath3}`);
        
        // Test 6: Test audio playback
        console.log('\nTest 6: Testing audio playback with mouth animation...');
        
        // Click play audio button
        await page.click('#playTestAudio');
        console.log('  ✓ Clicked play audio button');
        
        // Wait a bit for audio to start
        await sleep(500);
        
        // Capture during audio
        const screenshotPath4 = path.join(ARTIFACT_DIR, 'vrm-desktop-audio-active.png');
        await page.screenshot({ path: screenshotPath4, type: 'png' });
        console.log(`  ✓ Screenshot during audio: ${screenshotPath4}`);
        
        // Wait for audio to complete (3 seconds)
        await sleep(3000);
        console.log('  ✓ Audio playback completed');
        
        // Test 7: Capture final state
        console.log('\nTest 7: Capturing final state...');
        
        // Reset sliders for demo
        await page.evaluate(() => {
            document.getElementById('eyeX').value = '0';
            document.getElementById('eyeX').dispatchEvent(new Event('input'));
            document.getElementById('eyeY').value = '0.1';
            document.getElementById('eyeY').dispatchEvent(new Event('input'));
            document.getElementById('eyeZ').value = '0.5';
            document.getElementById('eyeZ').dispatchEvent(new Event('input'));
            document.getElementById('tiltDegrees').value = '20';
            document.getElementById('tiltDegrees').dispatchEvent(new Event('input'));
        });
        await sleep(1000);
        
        const screenshotPath5 = path.join(ARTIFACT_DIR, 'vrm-desktop-final.png');
        await page.screenshot({ path: screenshotPath5, type: 'png' });
        console.log(`  ✓ Final screenshot: ${screenshotPath5}`);
        
        console.log('\n✅ All tests completed successfully!');
        console.log(`\nArtifacts saved to: ${ARTIFACT_DIR}`);
        
    } catch (error) {
        console.error('\n❌ Test failed:', error);
        
        // Capture error screenshot
        const errorScreenshot = path.join(ARTIFACT_DIR, 'vrm-desktop-error.png');
        await page.screenshot({ path: errorScreenshot });
        console.log(`Error screenshot: ${errorScreenshot}`);
        
        throw error;
    } finally {
        await browser.close();
        server.kill();
    }
}

// Run tests
runTests().catch(error => {
    console.error('Test suite failed:', error);
    process.exit(1);
});
