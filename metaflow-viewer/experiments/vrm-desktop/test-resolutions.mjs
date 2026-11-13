/**
 * Test VRM Desktop Portrait at multiple resolutions
 * Captures screenshots after animation settles
 */

import puppeteer from 'puppeteer';

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function captureAtResolution(width, height, name) {
    console.log(`\n=== Testing ${name} (${width}x${height}) ===`);
    
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
    await page.setViewport({ width, height });
    
    try {
        await page.goto('http://localhost:8766/', { 
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        
        console.log('Waiting for VRM load and animation settle (12s)...');
        await sleep(12000);
        
        // Get state
        const state = await page.evaluate(() => {
            const app = window.app;
            if (!app?.vrm) return { error: 'No VRM' };
            
            return {
                canvasSize: {
                    width: app.canvas.clientWidth,
                    height: app.canvas.clientHeight
                },
                params: app.params,
                eyeSliders: {
                    x: document.getElementById('eyeX').value,
                    y: document.getElementById('eyeY').value,
                    z: document.getElementById('eyeZ').value
                }
            };
        });
        
        if (state.error) {
            console.error('ERROR:', state.error);
        } else {
            console.log('Canvas size:', state.canvasSize);
            console.log('Params:', state.params);
            console.log('Eye sliders:', state.eyeSliders);
        }
        
        const filename = `/opt/cursor/artifacts/vrm-${name}.png`;
        await page.screenshot({ path: filename });
        console.log(`Screenshot saved: ${filename}`);
        
    } finally {
        await browser.close();
    }
}

async function main() {
    console.log('Starting multi-resolution screenshot capture...');
    
    // Desktop resolutions
    await captureAtResolution(1280, 800, 'desktop-1280x800');
    await captureAtResolution(1024, 768, 'desktop-1024x768');
    
    // Tablet/mobile portrait
    await captureAtResolution(768, 1024, 'tablet-768x1024');
    
    console.log('\n✅ All screenshots captured');
}

main().catch(console.error);
