import path from 'path';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import alias from '@rollup/plugin-alias';
import image from '@rollup/plugin-image';
import json from '@rollup/plugin-json';
import resolve from '@rollup/plugin-node-resolve';
import strip from '@rollup/plugin-strip';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';
import autoprefixer from 'autoprefixer';
import postcss from 'postcss';
import scss from 'rollup-plugin-scss';
import sass from 'sass';

import copyAndWatch from './copy-and-watch.mjs';
import { metaflowEditorVersion } from './src/metaflow-editor-version.ts';

const bundleId = code => createHash('sha256').update(code).digest('hex').slice(0, 16);

// prod is release build
if (process.env.BUILD_TYPE === 'prod') {
    process.env.BUILD_TYPE = 'release';
}
// debug, profile, release
const BUILD_TYPE = process.env.BUILD_TYPE || 'release';
const ENGINE_DIR = path.resolve(`node_modules/playcanvas/build/playcanvas${BUILD_TYPE === 'debug' ? '.dbg' : ''}/src/index.js`);
const PCUI_DIR = path.resolve('node_modules/@playcanvas/pcui');
const STUDIO = process.env.STUDIO_BUILD === '1';
const HREF = process.env.BASE_HREF || (STUDIO ? '/studio/' : '');

const outputHeader = () => {
    const BLUE_OUT = '\x1b[34m';
    const BOLD_OUT = '\x1b[1m';
    const REGULAR_OUT = '\x1b[22m';
    const RESET_OUT = '\x1b[0m';

    const title = [
        'Building SuperSplat',
        `type ${BOLD_OUT}${BUILD_TYPE}${REGULAR_OUT}`
    ].map(l => `${BLUE_OUT}${l}`).join('\n');
    console.log(`${BLUE_OUT}${title}${RESET_OUT}\n`);
};

outputHeader();

const application = {
    input: STUDIO ? 'src/studio-index.ts' : 'src/index.ts',
    output: {
        dir: STUDIO ? (process.env.STUDIO_OUTPUT_DIR || 'dist-studio') : 'dist',
        entryFileNames: 'index.js',
        format: 'esm',
        sourcemap: process.env.STUDIO_PACKAGE !== '1'
    },
    plugins: [
        {
            name: 'metaflow-runtime-version',
            generateBundle(options, bundle) {
                const { productName, displayVersion, appSemver, development, sourcePath, historyUrl,
                    upstreamName, upstreamVersion, upstreamTag, upstreamGitRef } = metaflowEditorVersion;
                this.emitFile({
                    type: 'asset',
                    fileName: 'version.json',
                    source: `${JSON.stringify({
                        productName, displayVersion, appSemver, development, sourcePath, historyUrl,
                        buildId: bundleId(bundle['index.js'].code),
                        upstream: { name: upstreamName, version: upstreamVersion, tag: upstreamTag, gitRef: upstreamGitRef }
                    }, null, 2)}\n`
                });
            }
        },
        copyAndWatch({
            targets: [
                {
                    src: 'src/index.html',
                    transform: (contents, filename) => {
                        const html = contents.toString().replace('__BASE_HREF__', HREF);
                        return STUDIO ? html.replace('Metaflow Editor</title>', 'Metaflow Studio</title>').replace('<link rel="shortcut icon" href="#">', '<link rel="icon" type="image/svg+xml" href="./static/studio/metaflow_logo.svg">').replace('<link rel="manifest" href="./manifest.json">', '').replace(/<!-- Service worker -->[\s\S]*?<\/script>/, '') : html;
                    }
                },
                { src: 'src/manifest.json' },
                ...(STUDIO ? [{ src: 'src/studio/local-files-sw.js' }, { src: 'static/studio', dest: 'static' }] : []),
                { src: 'static/images', dest: 'static' },
                { src: 'static/icons', dest: 'static' },
                { src: 'static/lib', dest: 'static' },
                { src: 'static/locales', dest: 'static' },
                { src: 'static/env/VertebraeHDRI_v1_512.png', dest: 'static/env' }
            ]
        }),
        alias({
            entries: {
                'playcanvas': ENGINE_DIR,
                '@playcanvas/pcui': PCUI_DIR
            }
        }),
        typescript({
            tsconfig: './tsconfig.json',
            filterRoot: path.resolve('..'),
            include: [path.resolve('src/**/*.ts'), path.resolve('../metaflow-viewer/src/**/*.ts'), path.resolve('global.d.ts')]
        }),
        resolve({ extensions: ['.mjs', '.js', '.json', '.node', '.ts'] }),
        image({ dom: false }),
        json(),
        scss({
            sourceMap: true,
            runtime: sass,
            processor: (css) => {
                return postcss([autoprefixer])
                .process(css, { from: undefined })
                .then(result => result.css);
            },
            fileName: 'index.css',
            includePaths: [`${PCUI_DIR}/dist`],
            watch: 'src/ui/scss'
        }),
        BUILD_TYPE === 'release' &&
        strip({
            include: ['**/*.ts'],
            functions: ['Debug.exec']
        }),
        BUILD_TYPE !== 'debug' && terser()
    ],
    treeshake: 'smallest',
    cache: false
};

const serviceWorker = {
    input: 'src/sw.ts',
    output: {
        dir: 'dist',
        format: 'esm',
        sourcemap: process.env.STUDIO_PACKAGE !== '1'
    },
    plugins: [
        resolve(),
        json(),
        typescript(),
        // BUILD_TYPE !== 'debug' && terser()
        {
            name: 'metaflow-cache-identity',
            buildStart() {
                this.addWatchFile(path.resolve('dist/index.js'));
            },
            renderChunk(code) {
                const buildId = bundleId(readFileSync('dist/index.js'));
                return { code: code.replaceAll('__METAFLOW_EDITOR_BUILD_ID__', buildId), map: null };
            }
        }
    ],
    treeshake: 'smallest',
    cache: false
};

export default STUDIO ? [application] : [application, serviceWorker];
