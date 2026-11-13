import { readFile } from 'fs/promises';
import { createCanvas, loadImage } from 'canvas';

async function analyzeScreenshot(path) {
    const img = await loadImage(path);
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    
    const imageData = ctx.getImageData(0, 0, img.width, img.height);
    const pixels = imageData.data;
    
    // Sample center, top, and bottom regions
    const regions = {
        top: { y: 100, h: 100 },
        center: { y: 350, h: 100 },
        bottom: { y: 600, h: 100 }
    };
    
    console.log(`\nAnalyzing: ${path}`);
    console.log(`Size: ${img.width}x${img.height}\n`);
    
    for (const [name, {y, h}] of Object.entries(regions)) {
        let totalR = 0, totalG = 0, totalB = 0, count = 0;
        let dark = 0, bright = 0;
        
        for (let row = y; row < y + h && row < img.height; row++) {
            for (let col = 0; col < img.width; col++) {
                const idx = (row * img.width + col) * 4;
                const r = pixels[idx];
                const g = pixels[idx + 1];
                const b = pixels[idx + 2];
                totalR += r; totalG += g; totalB += b;
                count++;
                const brightness = (r + g + b) / 3;
                if (brightness < 50) dark++;
                if (brightness > 200) bright++;
            }
        }
        
        const avgR = Math.round(totalR / count);
        const avgG = Math.round(totalG / count);
        const avgB = Math.round(totalB / count);
        const avgBrightness = Math.round((avgR + avgG + avgB) / 3);
        
        console.log(`${name.toUpperCase()} (y=${y}-${y+h}):`);
        console.log(`  Average RGB: (${avgR}, ${avgG}, ${avgB})`);
        console.log(`  Brightness: ${avgBrightness}/255`);
        console.log(`  Very dark pixels (<50): ${(dark/count*100).toFixed(1)}%`);
        console.log(`  Very bright pixels (>200): ${(bright/count*100).toFixed(1)}%`);
    }
}

const files = [
    '/opt/cursor/artifacts/test-01-baseline.png',
    '/opt/cursor/artifacts/ACTUAL-VRM-RENDERING.png'
];

for (const file of files) {
    try {
        await analyzeScreenshot(file);
    } catch (err) {
        console.log(`\nCould not analyze ${file}:`, err.message);
    }
}
