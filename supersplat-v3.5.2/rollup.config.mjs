import { prepareExportViewer } from '../scripts/prepare-export-viewer.mjs';
import { editorSourceDigest } from '../scripts/stage-editor.mjs';
import { createHash } from 'node:crypto';
import path from 'path';

import alias from '@rollup/plugin-alias';
import image from '@rollup/plugin-image';
import json from '@rollup/plugin-json';
import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';
import autoprefixer from 'autoprefixer';
import postcss from 'postcss';
import scss from 'rollup-plugin-scss';
import sass from 'sass';

import copyAndWatch from './copy-and-watch.mjs';
import { metaflowEditorVersion } from './src/metaflow-editor-version.ts';

const bundleId = code => createHash('sha256').update(code).digest('hex');

// prod is release build
if (process.env.BUILD_TYPE === 'prod') {
    process.env.BUILD_TYPE = 'release';
}
// debug, profile, release
const BUILD_TYPE = process.env.BUILD_TYPE || 'release';
const ENGINE_DIR = path.resolve(`node_modules/playcanvas/build/playcanvas${BUILD_TYPE === 'debug' ? '.dbg' : ''}/src/index.js`);
const PCUI_DIR = path.resolve('node_modules/@playcanvas/pcui');
const HREF = process.env.BASE_HREF || '';

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

let sourceDigestAtStart;

const application = {
    input: 'src/index.ts',
    output: {
        dir: 'dist',
        format: 'esm',
        sourcemap: true
    },
    plugins: [
        {
            name: 'metaflow-runtime-version',
            async buildStart() { await prepareExportViewer(path.resolve('..')); sourceDigestAtStart = await editorSourceDigest(path.resolve('..'), 'supersplat-v3.5.2'); },
            async generateBundle(options, bundle) {
                const sourceDigest = await editorSourceDigest(path.resolve('..'), 'supersplat-v3.5.2');
                if (sourceDigest !== sourceDigestAtStart) throw new Error('Editor source changed during build');
                const { productName, displayVersion, appSemver, development, sourcePath, historyUrl, edition,
                    upstreamName, upstreamVersion, upstreamTag, upstreamGitRef } = metaflowEditorVersion;
                this.emitFile({
                    type: 'asset',
                    fileName: 'version.json',
                    source: `${JSON.stringify({
                        productName, displayVersion, appSemver, development, sourcePath, historyUrl, edition,
                        sourceDigest, buildType: BUILD_TYPE,
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
                        return contents.toString().replace('__BASE_HREF__', HREF);
                    }
                },
                { src: 'src/manifest.json' },
                { src: 'static/sw.js' },
                { src: 'static/images', dest: 'static' },
                { src: 'static/icons', dest: 'static' },
                { src: 'static/lib', dest: 'static' },
                // the WebP decoder's wasm must match the JS glue bundled from
                // splat-transform, so take it from the installed package
                { src: 'node_modules/@playcanvas/splat-transform/lib/webp.wasm', dest: 'static/lib/webp' },
                { src: 'static/locales', dest: 'static' }
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
            include: [path.resolve('src/**/*.ts'), path.resolve('../metaflow-viewer/src/gsplat-reveal-radial.ts'), path.resolve('../metaflow-viewer/src/background*.ts'), path.resolve('../editor-shared/**/*.ts'), path.resolve('global.d.ts')]
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
        BUILD_TYPE !== 'debug' && terser()
    ],
    treeshake: 'smallest',
    cache: false
};

export default application;
