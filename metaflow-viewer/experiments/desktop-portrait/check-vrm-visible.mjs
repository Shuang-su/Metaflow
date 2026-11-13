#!/usr/bin/env node
import { readFile } from 'fs/promises';
import { createCanvas, loadImage } from 'canvas';

async function main() {
    const img = await loadImage('/opt/cursor/artifacts/ACTUAL-VRM-RENDERING.png');
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    
    const imageData = ctx.getImageData(0, 0, img.width, img.height);
    const pixels = imageData.data;
    
    // Count non-background pixels (desk is brown/tan, VRM adds other colors)
    let uniqueColors = new Set();
    for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i];
        const g = pixels[i+1];
        const b = pixels[i+2];
        const hex = (r << 16) | (g << 8) | b;
        uniqueColors.add(hex);
    }
    
    console.log(`Image: ${img.width}x${img.height}`);
    console.log(`Unique colors: ${uniqueColors.size}`);
    console.log(uniqueColors.size > 100 ? '✅ Sufficient color diversity (likely has VRM)' : '❌ Too few colors (might be blank/desk only)');
}

main().catch(console.error);
