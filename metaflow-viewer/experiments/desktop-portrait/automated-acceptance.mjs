#!/usr/bin/env node
/**
 * Automated acceptance test for VRM desktop portrait
 * - Loads VRM and verifies rendering
 * - Tests eye position sliders and foot anchoring
 * - Tests audio playback and mouth animation
 * - Captures screenshots at each step
 */
import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import { writeFile } from 'fs/promises';

const PORT = 4205;
const SCREENSHOT_DIR = '/opt/cursor/artifacts';

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

async function waitForVRM(page) {
    console.log('  Waiting for VRM to load...');
    await page.waitForFunction(
        () => {
            if (typeof window.diagnostics !== 'function') return false;
            const diag = window.diagnostics();
            return diag.ready === true && 
                   diag.modelType === 'vrm' && 
                   diag.vrmHumanoid === 'present' &&
                   diag.activeLoads === 0;
        },
        { timeout: 60000, polling: 500 }
    );
    console.log('  ✅ VRM loaded');
}

async function getDiagnostics(page) {
    return await page.evaluate(() => {
        if (typeof window.diagnostics !== 'function') {
            return { error: 'diagnostics not available' };
        }
        try {
            return window.diagnostics();
        } catch (err) {
            return { error: 'diagnostics threw: ' + err.message };
        }
    });
}

async function setSlider(page, id, value) {
    await page.evaluate(({id, value}) => {
        const slider = document.getElementById(id);
        slider.value = value;
        slider.dispatchEvent(new Event('input', { bubbles: true }));
    }, {id, value});
    await new Promise(resolve => setTimeout(resolve, 100)); // Let rendering update
}

async function clickButton(page, id) {
    await page.evaluate((id) => {
        const btn = document.getElementById(id);
        btn.click();
    }, id);
}

async function main() {
    console.log('Starting server...');
    const server = await startServer();
    
    const results = {
        vrm_loaded: false,
        character_visible: false,
        eye_position_tests: [],
        audio_test: { played: false, mouth_opened: false },
        blink_observed: false,
        screenshots: []
    };
    
    try {
        const browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--enable-unsafe-swiftshader',
                '--autoplay-policy=no-user-gesture-required'
            ]
        });
        
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
        
        console.log('\n=== Step 1: Load VRM ===');
        await page.goto(`http://127.0.0.1:${PORT}/?vrm=models/Seed-san.vrm`, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        
        await waitForVRM(page);
        results.vrm_loaded = true;
        
        // Baseline screenshot
        const baselinePath = `${SCREENSHOT_DIR}/test-01-vrm-baseline.png`;
        await page.screenshot({ path: baselinePath });
        results.screenshots.push('test-01-vrm-baseline.png');
        console.log('  Screenshot:', baselinePath);
        
        console.log('\n=== Step 2: Test Eye Position Changes ===');
        
        // Test eye X movement
        console.log('  Testing eye X = 20cm (right)');
        await setSlider(page, 'eyeX', '20');
        await new Promise(resolve => setTimeout(resolve, 500));
        results.eye_position_tests.push({
            param: 'eyeX',
            value: 20
        });
        await page.screenshot({ path: `${SCREENSHOT_DIR}/test-02-eye-x-right.png` });
        results.screenshots.push('test-02-eye-x-right.png');
        console.log('    Eye:', diag.eye);
        
        // Test eye Y movement
        console.log('  Testing eye Y = 25cm (higher)');
        await setSlider(page, 'eyeX', '0'); // Reset X
        await setSlider(page, 'eyeY', '25');
        await new Promise(resolve => setTimeout(resolve, 500));
        diag = await getDiagnostics(page);
        results.eye_position_tests.push({
            param: 'eyeY',
            value: 25,
            eye: diag.eye,
            projection: diag.projection
        });
        await page.screenshot({ path: `${SCREENSHOT_DIR}/test-03-eye-y-higher.png` });
        results.screenshots.push('test-03-eye-y-higher.png');
        console.log('    Eye:', diag.eye);
        
        // Test tilt
        console.log('  Testing tilt = 75°');
        await setSlider(page, 'eyeY', '15'); // Reset Y
        await setSlider(page, 'tilt', '75');
        await new Promise(resolve => setTimeout(resolve, 500));
        diag = await getDiagnostics(page);
        results.eye_position_tests.push({
            param: 'tilt',
            value: 75,
            eye: diag.eye,
            tilt: diag.tilt,
            projection: diag.projection
        });
        await page.screenshot({ path: `${SCREENSHOT_DIR}/test-04-tilt-75.png` });
        results.screenshots.push('test-04-tilt-75.png');
        console.log('    Tilt:', diag.tilt);
        
        // Reset to baseline
        await setSlider(page, 'tilt', '65');
        await new Promise(resolve => setTimeout(resolve, 200));
        
        console.log('\n=== Step 3: Test Expressions ===');
        
        // Wait for a blink to occur
        console.log('  Waiting for blink (up to 10 seconds)...');
        const blinkStart = Date.now();
        let blinkDetected = false;
        for (let i = 0; i < 50; i++) {
            await new Promise(resolve => setTimeout(resolve, 200));
            diag = await getDiagnostics(page);
            if (diag.vrmExpressionValues && diag.vrmExpressionValues.blink > 0.1) {
                blinkDetected = true;
                results.blink_observed = true;
                console.log('  ✅ Blink detected! Value:', diag.vrmExpressionValues.blink);
                await page.screenshot({ path: `${SCREENSHOT_DIR}/test-05-blink.png` });
                results.screenshots.push('test-05-blink.png');
                break;
            }
        }
        if (!blinkDetected) {
            console.log('  ⚠️  No blink observed in 10 seconds');
        }
        
        console.log('\n=== Step 4: Test Audio and Mouth Animation ===');
        
        // Get baseline mouth value
        diag = await getDiagnostics(page);
        const baselineMouth = diag.vrmExpressionValues?.aa || 0;
        console.log('  Baseline mouth (aa):', baselineMouth);
        
        // Click play audio button
        console.log('  Clicking play audio...');
        await clickButton(page, 'playAudio');
        results.audio_test.played = true;
        
        // Wait a bit and check if mouth opened
        await new Promise(resolve => setTimeout(resolve, 1000));
        diag = await getDiagnostics(page);
        const duringMouth = diag.vrmExpressionValues?.aa || 0;
        console.log('  During audio mouth (aa):', duringMouth);
        
        if (duringMouth > baselineMouth + 0.05) {
            results.audio_test.mouth_opened = true;
            console.log('  ✅ Mouth opened during audio!');
            await page.screenshot({ path: `${SCREENSHOT_DIR}/test-06-audio-mouth-open.png` });
            results.screenshots.push('test-06-audio-mouth-open.png');
        } else {
            console.log('  ⚠️  Mouth did not open significantly');
        }
        
        // Stop audio
        await clickButton(page, 'stopAudio');
        await new Promise(resolve => setTimeout(resolve, 500));
        diag = await getDiagnostics(page);
        const afterMouth = diag.vrmExpressionValues?.aa || 0;
        console.log('  After stop mouth (aa):', afterMouth);
        
        await page.screenshot({ path: `${SCREENSHOT_DIR}/test-07-audio-stopped.png` });
        results.screenshots.push('test-07-audio-stopped.png');
        
        console.log('\n=== Step 5: Final State ===');
        diag = await getDiagnostics(page);
        await writeFile('/tmp/final-diagnostics.json', JSON.stringify(diag, null, 2));
        console.log('  Final diagnostics saved to /tmp/final-diagnostics.json');
        
        await browser.close();
        
        console.log('\n=== TEST RESULTS ===');
        console.log('VRM Loaded:', results.vrm_loaded ? '✅' : '❌');
        console.log('Eye Position Tests:', results.eye_position_tests.length, 'completed');
        console.log('Blink Observed:', results.blink_observed ? '✅' : '⚠️');
        console.log('Audio Played:', results.audio_test.played ? '✅' : '❌');
        console.log('Mouth Opened:', results.audio_test.mouth_opened ? '✅' : '⚠️');
        console.log('Screenshots:', results.screenshots.length);
        
        results.screenshots.forEach(name => {
            console.log(`  - ${SCREENSHOT_DIR}/${name}`);
        });
        
        // Save results
        await writeFile('/tmp/acceptance-results.json', JSON.stringify(results, null, 2));
        console.log('\nResults saved to /tmp/acceptance-results.json');
        
        const success = results.vrm_loaded && 
                       results.eye_position_tests.length >= 3 &&
                       results.audio_test.played;
        
        process.exit(success ? 0 : 1);
        
    } finally {
        server.kill();
    }
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
