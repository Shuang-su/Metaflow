/**
 * Build script for standalone VRM Desktop Portrait viewer
 * Creates a deployable static site artifact
 */

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

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

    const vrmAnimModules = path.resolve(__dirname, '../../node_modules/@pixiv/three-vrm-animation');
    if (!fs.existsSync(vrmAnimModules)) {
        throw new Error('@pixiv/three-vrm-animation not found. Run: npm install @pixiv/three-vrm-animation@3.1.4');
    }
    const vrmAnimSrc = path.join(vrmAnimModules, 'lib/three-vrm-animation.module.js');
    const vrmAnimDest = path.join(vendorDir, 'three-vrm-animation.module.js');
    fs.copyFileSync(vrmAnimSrc, vrmAnimDest);
    console.log('  ✓ three-vrm-animation.module.js');
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

/animations/*.vrma
  Content-Type: model/gltf-binary

/animations/*.json
  Content-Type: application/json; charset=utf-8
`;
    
    fs.writeFileSync(path.join(__dirname, '_headers'), headers);
    console.log('  ✓ Created _headers');
}

function createArtifactZip() {
    console.log('Creating deployment artifact...');

    if (!fs.existsSync(ARTIFACT_DIR)) {
        fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
    }

    const staging = path.join('/tmp', 'vrm-desktop-zip-stage');
    fs.rmSync(staging, { recursive: true, force: true });
    fs.mkdirSync(staging, { recursive: true });

    const files = [
        'index.html',
        'app.mjs',
        'projection.mjs',
        'vrm-animator.mjs',
        'vrm-animation-player.mjs',
        'test-audio.mjs',
        'settings.mjs',
        'vrm-pose.mjs',
        'environment.mjs',
        'display-calibration.mjs',
        'fullscreen-calibration.mjs',
        'README.md',
        'ATTRIBUTIONS.md',
        '_headers'
    ];
    for (const f of files) {
        fs.copyFileSync(path.join(__dirname, f), path.join(staging, f));
    }
    const cpDir = (name) => {
        fs.cpSync(path.join(__dirname, name), path.join(staging, name), { recursive: true });
    };
    cpDir('vendor');
    cpDir('models');
    cpDir('animations');

    const outPath = path.join(ARTIFACT_DIR, ARTIFACT_NAME);
    fs.rmSync(outPath, { force: true });
    const z = spawnSync('zip', ['-qr', outPath, '.'], { cwd: staging, stdio: 'inherit' });
    if (z.status !== 0) throw new Error(`zip failed: ${z.status}`);
    const sizeMB = (fs.statSync(outPath).size / 1024 / 1024).toFixed(2);
    console.log(`  ✓ ${ARTIFACT_NAME} (${sizeMB} MB)`);
}

async function main() {
    console.log('Building VRM Desktop Portrait standalone app...\n');
    
    try {
        await copyVendorLibraries();
        verifyModels();
        createNetlifyHeaders();
        createArtifactZip();
        
        console.log('\n✅ Build complete!');
        console.log(`\nDeployment artifact: ${path.join(ARTIFACT_DIR, ARTIFACT_NAME)}`);
        
    } catch (error) {
        console.error('\n❌ Build failed:', error.message);
        process.exit(1);
    }
}

main();
