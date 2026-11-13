/**
 * Validation test for VRM Desktop Portrait
 * Verifies: off-axis projection, full character framing, desk contact, expressions
 */

import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';
import { screenPointNdc } from './projection.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function validateApp() {
    console.log('=== VRM Desktop Portrait Validation ===\n');
    
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
    await page.setViewport({ width: 1280, height: 800 });
    
    // Capture console
    const consoleLogs = [];
    page.on('console', msg => {
        const text = msg.text();
        consoleLogs.push(text);
        if (msg.type() === 'error') {
            console.error('[Browser Error]', text);
        }
    });
    
    page.on('pageerror', error => {
        console.error('[Page Error]', error.message);
    });
    
    try {
        console.log('1. Loading application...');
        await page.goto('http://localhost:8766/', { 
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        
        console.log('2. Waiting for VRM load (10s)...');
        await sleep(10000);
        
        // Get application state
        console.log('\n3. Checking application state...');
        const state = await page.evaluate(() => {
            const app = window.app;
            if (!app) return { error: 'No app' };
            if (!app.vrm) return { error: 'No VRM', hasApp: true };
            
            // Force matrix updates
            app.scene.updateMatrixWorld(true);
            
            // Get local bounding box
            const box = new THREE.Box3().setFromObject(app.vrm.scene);
            
            // Get world bounding box by traversing from person root
            const worldBox = new THREE.Box3();
            app.vrm.scene.traverse((node) => {
                if (node.isMesh || node.isSkinnedMesh) {
                    if (node.geometry) {
                        node.updateWorldMatrix(true, false);
                        const geomBox = new THREE.Box3().setFromBufferAttribute(
                            node.geometry.attributes.position
                        );
                        geomBox.applyMatrix4(node.matrixWorld);
                        worldBox.union(geomBox);
                    }
                }
            });
            
            return {
                hasVRM: true,
                params: app.params,
                cameraPosition: [app.camera.position.x, app.camera.position.y, app.camera.position.z],
                personRootPosition: [app.personRoot.position.x, app.personRoot.position.y, app.personRoot.position.z],
                vrmLocalBox: {
                    min: [box.min.x, box.min.y, box.min.z],
                    max: [box.max.x, box.max.y, box.max.z]
                },
                vrmWorldBox: {
                    min: [worldBox.min.x, worldBox.min.y, worldBox.min.z],
                    max: [worldBox.max.x, worldBox.max.y, worldBox.max.z]
                },
                hasExpressionManager: !!app.vrm.expressionManager,
                availableExpressions: app.vrm.expressionManager ?
                    Object.keys(app.vrm.expressionManager.expressionMap) : [],
                diagnostics: window.diagnostics
            };
        });
        
        if (state.error) {
            console.error('ERROR:', state.error);
            throw new Error(state.error);
        }
        
        console.log('✓ VRM loaded');
        console.log('  Camera position:', state.cameraPosition);
        console.log('  Eye position:', state.params.eye);
        console.log('  Screen:', state.params.width, 'x', state.params.height, 'm');
        console.log('  Person root Y:', state.personRootPosition[1]);
        console.log('  VRM world bounds:');
        console.log('    Min:', state.vrmWorldBox.min);
        console.log('    Max:', state.vrmWorldBox.max);
        
        // Validate expressions
        console.log('\n4. Validating expressions...');
        console.log('  Expression manager:', state.hasExpressionManager ? 'YES' : 'NO');
        console.log('  Available expressions:', state.availableExpressions.join(', ') || 'none');
        
        const hasBlink = state.availableExpressions.includes('blink');
        const hasAa = state.availableExpressions.includes('aa');
        
        if (hasBlink) {
            console.log('  ✓ blink expression available');
        } else {
            console.warn('  ⚠ blink expression NOT available');
        }
        
        if (hasAa) {
            console.log('  ✓ aa expression available');
        } else {
            console.warn('  ⚠ aa expression NOT available');
        }
        
        // Validate bounding box in NDC
        console.log('\n5. Validating character framing (NDC projection)...');
        
        const worldMin = state.vrmWorldBox.min;
        const worldMax = state.vrmWorldBox.max;
        const params = state.params;
        
        // Project corner points
        const corners = [
            { x: worldMin[0], y: worldMin[1], z: worldMin[2], name: 'bottom-back-left' },
            { x: worldMax[0], y: worldMin[1], z: worldMin[2], name: 'bottom-back-right' },
            { x: worldMin[0], y: worldMax[1], z: worldMin[2], name: 'top-back-left' },
            { x: worldMax[0], y: worldMax[1], z: worldMin[2], name: 'top-back-right' },
            { x: worldMin[0], y: worldMin[1], z: worldMax[2], name: 'bottom-front-left' },
            { x: worldMax[0], y: worldMin[1], z: worldMax[2], name: 'bottom-front-right' },
            { x: worldMin[0], y: worldMax[1], z: worldMax[2], name: 'top-front-left' },
            { x: worldMax[0], y: worldMax[1], z: worldMax[2], name: 'top-front-right' },
        ];
        
        let allInView = true;
        let minNdcX = Infinity, maxNdcX = -Infinity;
        let minNdcY = Infinity, maxNdcY = -Infinity;
        
        for (const corner of corners) {
            try {
                const ndc = screenPointNdc(corner, params);
                minNdcX = Math.min(minNdcX, ndc.x);
                maxNdcX = Math.max(maxNdcX, ndc.x);
                minNdcY = Math.min(minNdcY, ndc.y);
                maxNdcY = Math.max(maxNdcY, ndc.y);
                
                // NDC range is [-1, 1], but allow some margin
                if (Math.abs(ndc.x) > 1.2 || Math.abs(ndc.y) > 1.2) {
                    console.warn(`  ⚠ ${corner.name} outside view: NDC (${ndc.x.toFixed(2)}, ${ndc.y.toFixed(2)})`);
                    allInView = false;
                }
            } catch (error) {
                console.error(`  ✗ ${corner.name} projection failed:`, error.message);
                allInView = false;
            }
        }
        
        console.log('  NDC X range:', minNdcX.toFixed(2), 'to', maxNdcX.toFixed(2));
        console.log('  NDC Y range:', minNdcY.toFixed(2), 'to', maxNdcY.toFixed(2));
        
        if (allInView) {
            console.log('  ✓ All bounding box corners in view');
        } else {
            console.warn('  ⚠ Some parts outside view');
        }
        
        // Check feet contact with desk
        console.log('\n6. Validating desk contact...');
        const deskY = -params.height / 2;
        const feetY = worldMin[1];
        const feetDeskGap = feetY - deskY;
        
        console.log('  Desk surface Y:', deskY.toFixed(4), 'm');
        console.log('  Feet Y:', feetY.toFixed(4), 'm');
        console.log('  Gap:', feetDeskGap.toFixed(4), 'm');
        
        if (Math.abs(feetDeskGap) < 0.01) {
            console.log('  ✓ Feet anchored to desk');
        } else if (feetDeskGap > 0.01) {
            console.warn('  ⚠ Character floating above desk by', feetDeskGap.toFixed(4), 'm');
        } else {
            console.warn('  ⚠ Character feet below desk by', Math.abs(feetDeskGap).toFixed(4), 'm');
        }
        
        // Take screenshots
        console.log('\n7. Capturing screenshots...');
        await page.screenshot({ 
            path: '/opt/cursor/artifacts/vrm-validated-initial.png' 
        });
        console.log('  ✓ Initial screenshot');
        
        // Test eye position change
        await page.evaluate(() => {
            document.getElementById('eyeX').value = '0.1';
            document.getElementById('eyeX').dispatchEvent(new Event('input'));
        });
        await sleep(500);
        await page.screenshot({ 
            path: '/opt/cursor/artifacts/vrm-validated-eye-moved.png' 
        });
        console.log('  ✓ Eye moved screenshot');
        
        // Test tilt change
        await page.evaluate(() => {
            document.getElementById('tiltDegrees').value = '30';
            document.getElementById('tiltDegrees').dispatchEvent(new Event('input'));
        });
        await sleep(500);
        await page.screenshot({ 
            path: '/opt/cursor/artifacts/vrm-validated-tilted.png' 
        });
        console.log('  ✓ Tilted screenshot');
        
        // Summary
        console.log('\n=== VALIDATION SUMMARY ===');
        console.log('VRM Load:', state.hasVRM ? '✓' : '✗');
        console.log('Expression Manager:', state.hasExpressionManager ? '✓' : '✗');
        console.log('Blink Expression:', hasBlink ? '✓' : '✗');
        console.log('AA Expression:', hasAa ? '✓' : '✗');
        console.log('Character Framing:', allInView ? '✓' : '⚠');
        console.log('Desk Contact:', Math.abs(feetDeskGap) < 0.01 ? '✓' : '⚠');
        
        const allPassed = state.hasVRM && state.hasExpressionManager && 
                          hasBlink && hasAa && allInView && 
                          Math.abs(feetDeskGap) < 0.01;
        
        if (allPassed) {
            console.log('\n✅ ALL VALIDATIONS PASSED');
        } else {
            console.log('\n⚠ SOME VALIDATIONS FAILED - see details above');
        }
        
    } catch (error) {
        console.error('\n❌ VALIDATION FAILED:', error);
        await page.screenshot({ 
            path: '/opt/cursor/artifacts/vrm-validated-error.png' 
        });
        throw error;
    } finally {
        await browser.close();
    }
}

// Run validation
validateApp().catch(error => {
    console.error('Validation failed:', error);
    process.exit(1);
});
