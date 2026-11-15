/**
 * Build script for standalone VRM Desktop Portrait viewer
 * Creates a deployable static site artifact
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import archiver from 'archiver';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACT_DIR = '/opt/cursor/artifacts';
const ARTIFACT_NAME = 'metaflow-desktop-preview.zip';

async function copyVendorLibraries() {
    console.log('Copying vendor libraries...');
    
    // Find three.js in node_modules (metaflow-viewer/node_modules)
    const nodeModulesThree = path.resolve(__dirname, '../../node_modules/three');
    const vendorDir = path.join(__dirname, 'vendor');
    
    if (!fs.existsSync(nodeModulesThree)) {
        throw new Error('three.js not found in node_modules. Run: npm install three@0.170.0');
    }
    
    // Copy three.module.js
    const threeSrc = path.join(nodeModulesThree, 'build/three.module.js');
    const threeDest = path.join(vendorDir, 'three.module.js');
    fs.copyFileSync(threeSrc, threeDest);
    console.log('  ✓ three.module.js');
    
    // Copy GLTFLoader
    const gltfSrc = path.join(nodeModulesThree, 'examples/jsm/loaders/GLTFLoader.js');
    const gltfDest = path.join(vendorDir, 'addons/loaders/GLTFLoader.js');
    fs.copyFileSync(gltfSrc, gltfDest);
    console.log('  ✓ GLTFLoader.js');
    
    // Copy BufferGeometryUtils (required by three-vrm)
    const bufferUtilsSrc = path.join(nodeModulesThree, 'examples/jsm/utils/BufferGeometryUtils.js');
    const bufferUtilsDest = path.join(vendorDir, 'addons/utils/BufferGeometryUtils.js');
    fs.mkdirSync(path.dirname(bufferUtilsDest), { recursive: true });
    fs.copyFileSync(bufferUtilsSrc, bufferUtilsDest);
    console.log('  ✓ BufferGeometryUtils.js');
    
    // Copy @pixiv/three-vrm
    const vrmModules = path.resolve(__dirname, '../../node_modules/@pixiv/three-vrm');
    if (!fs.existsSync(vrmModules)) {
        throw new Error('@pixiv/three-vrm not found. Run: npm install @pixiv/three-vrm@3.1.4');
    }
    
    const vrmSrc = path.join(vrmModules, 'lib/three-vrm.module.js');
    const vrmDest = path.join(vendorDir, 'three-vrm.module.js');
    fs.copyFileSync(vrmSrc, vrmDest);
    console.log('  ✓ three-vrm.module.js');
}

function verifyModels() {
    console.log('Verifying bundled models...');
    const modelsDir = path.join(__dirname, 'models');
    const wenjing = path.join(modelsDir, 'wenjing.vrm');
    const sample = path.join(modelsDir, 'minimal-avatar.vrm');

    if (!fs.existsSync(wenjing)) {
        throw new Error('models/wenjing.vrm missing (CC BY-NC-SA 4.0 Wenjing VRM0)');
    }
    const wenjingSize = fs.statSync(wenjing).size;
    console.log(`  ✓ wenjing.vrm (${(wenjingSize / 1024 / 1024).toFixed(2)} MB)`);

    if (!fs.existsSync(sample)) {
        throw new Error('models/minimal-avatar.vrm missing (pixiv VRM1 sample)');
    }
    console.log(`  ✓ minimal-avatar.vrm (${(fs.statSync(sample).size / 1024 / 1024).toFixed(2)} MB)`);

    if (!fs.existsSync(path.join(__dirname, 'ATTRIBUTIONS.md'))) {
        throw new Error('ATTRIBUTIONS.md missing — do not regenerate incorrectly');
    }
    console.log('  ✓ ATTRIBUTIONS.md preserved');
}

function createNetlifyHeaders() {
    const headers = `/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: SAMEORIGIN
  Referrer-Policy: strict-origin-when-cross-origin

/vendor/*.js
  Content-Type: text/javascript; charset=utf-8

/vendor/addons/**/*.js
  Content-Type: text/javascript; charset=utf-8

/*.mjs
  Content-Type: text/javascript; charset=utf-8

/models/*.vrm
  Content-Type: model/gltf-binary
`;
    
    fs.writeFileSync(path.join(__dirname, '_headers'), headers);
    console.log('  ✓ Created _headers');
}

async function createArtifactZip() {
    console.log('Creating deployment artifact...');
    
    if (!fs.existsSync(ARTIFACT_DIR)) {
        fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
    }
    
    const output = fs.createWriteStream(path.join(ARTIFACT_DIR, ARTIFACT_NAME));
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    return new Promise((resolve, reject) => {
        output.on('close', () => {
            const sizeMB = (archive.pointer() / 1024 / 1024).toFixed(2);
            console.log(`  ✓ ${ARTIFACT_NAME} (${sizeMB} MB)`);
            resolve();
        });
        
        archive.on('error', reject);
        archive.pipe(output);
        
        // Add all files
        archive.file(path.join(__dirname, 'index.html'), { name: 'index.html' });
        archive.file(path.join(__dirname, 'app.mjs'), { name: 'app.mjs' });
        archive.file(path.join(__dirname, 'projection.mjs'), { name: 'projection.mjs' });
        archive.file(path.join(__dirname, 'vrm-animator.mjs'), { name: 'vrm-animator.mjs' });
        archive.file(path.join(__dirname, 'test-audio.mjs'), { name: 'test-audio.mjs' });
        archive.file(path.join(__dirname, 'README.md'), { name: 'README.md' });
        archive.file(path.join(__dirname, 'ATTRIBUTIONS.md'), { name: 'ATTRIBUTIONS.md' });
        archive.file(path.join(__dirname, '_headers'), { name: '_headers' });
        
        // Add vendor directory
        archive.directory(path.join(__dirname, 'vendor'), 'vendor');
        
        // Add models directory
        archive.directory(path.join(__dirname, 'models'), 'models');
        
        archive.finalize();
    });
}

async function main() {
    console.log('Building VRM Desktop Portrait standalone app...\n');
    
    try {
        await copyVendorLibraries();
        verifyModels();
        createNetlifyHeaders();
        await createArtifactZip();
        
        console.log('\n✅ Build complete!');
        console.log(`\nDeployment artifact: ${path.join(ARTIFACT_DIR, ARTIFACT_NAME)}`);
        
    } catch (error) {
        console.error('\n❌ Build failed:', error.message);
        process.exit(1);
    }
}

main();
