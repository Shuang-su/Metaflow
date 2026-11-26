# Metaflow Editor 1.2.0 — WebGL2 兼容版

本目录基于 SuperSplat `2.32.5` / `e060989b202548848eb440a5005cd41a8b26f7db`，是 MF-148 的 `/editor-legacy/` 构建源码，保留从 MF-56 / MF-57 迁入的粒子视频、100000 帧、品牌、legacy ZIP 和独立 settings.json。纯上游参考位于 `../references/supersplat-v2.32.5/`。

1.2.0 已通过 Netlify CLI 发布，GitHub 协调仍待恢复；默认 WebGPU 版位于 `../supersplat-v3.5.2/`。两版不再安装离线 SW。见 [当前 Spec](../docs/changes/148-editor-upstream-v3.5.2/spec.md)、[验证状态](../docs/changes/148-editor-upstream-v3.5.2/verification.md)、[粒子视频指南](../docs/guides/editor-particle-video.md)。

以下上游链接与贡献者信息仅表示原项目来源，不表示 Metaflow 候选已发布到上游站点。

[![Github Release](https://img.shields.io/github/v/release/playcanvas/supersplat)](https://github.com/playcanvas/supersplat/releases)
[![License](https://img.shields.io/github/license/playcanvas/supersplat)](https://github.com/playcanvas/supersplat/blob/main/LICENSE)
[![Discord](https://img.shields.io/badge/Discord-5865F2?style=flat&logo=discord&logoColor=white&color=black)](https://discord.gg/RSaMRzg)
[![Reddit](https://img.shields.io/badge/Reddit-FF4500?style=flat&logo=reddit&logoColor=white&color=black)](https://www.reddit.com/r/PlayCanvas)
[![X](https://img.shields.io/badge/X-000000?style=flat&logo=x&logoColor=white&color=black)](https://x.com/intent/follow?screen_name=playcanvas)

| [SuperSplat Editor](https://superspl.at/editor) | [User Guide](https://developer.playcanvas.com/user-manual/gaussian-splatting/editing/supersplat/) | [Blog](https://blog.playcanvas.com) | [Forum](https://forum.playcanvas.com) |

The SuperSplat Editor is a free and open source tool for inspecting, editing, optimizing and publishing 3D Gaussian Splats. It is built on web technologies and runs in the browser, so there's nothing to download or install.

A live version of this tool is available at: https://superspl.at/editor

![image](https://github.com/user-attachments/assets/b6cbb5cc-d3cc-4385-8c71-ab2807fd4fba)

To learn more about using SuperSplat, please refer to the [User Guide](https://developer.playcanvas.com/user-manual/gaussian-splatting/editing/supersplat/).

## Local Development

Use the Metaflow workspace, not a standalone upstream clone: the particle adapter imports the authoritative `../metaflow-viewer/src/gsplat-reveal-radial.ts`. Rollup resolves both through this Editor's PlayCanvas `2.21.4`; a separate Viewer dependency installation is not required to build the Editor.

Use **Node 22.20.0** from this directory's `.nvmrc` (supported engine range: `>=22.13.0 <23`). Do not change the root or Viewer Node settings.

```sh
cd supersplat-v2.32.5
nvm use
npm ci
npm run lint
npm run lint:locales
npm run build
npm test
node scripts/test-server.mjs
```

Open `http://127.0.0.1:4389/editor-legacy/`. In another terminal, `npm run watch` rebuilds on edits. The local acceptance server binds only to loopback and does not serve the entire workspace. Build the Viewer separately with its own Node version only when checking Viewer interoperability.

Browser tests require native Chrome and `ffprobe`/`ffmpeg` for file verification:

```sh
npm run test:e2e -- video-export video-lifecycle lcc2-format
npm run test:e2e -- video-background
```

Optional real-scene tests use METAFLOW_SAMPLE_DIR / METAFLOW_TEST_FILES; native Safari evidence and tested scope are recorded in MF-148 verification. Keep outputs/caches under the project-local `.codex-work/`, never in the immutable reference.

The Service Worker caches by bundle identity. Save work, close old Editor tabs, and reopen to activate a waiting bundle. Do not clear unrelated browser data or forcibly reload an unsaved project. The About/console/runtime surfaces identify the candidate and upstream version.

Toolchain deviation: ESLint `9.39.4` is pinned because the upstream `@playcanvas/eslint-config@2.1.0` import rule calls an API removed by ESLint 10. This dev tool emits an end-of-support warning; migrate the config before adopting ESLint 10. Compatible transitive security fixes are locked; Sass legacy API and Mediabunny circular/helper warnings remain visible during build.

## Localizing the SuperSplat Editor

The currently supported languages are available here:

https://github.com/playcanvas/supersplat/tree/main/static/locales

### Adding a New Language

1. Add a new `<locale>.json` file in the `static/locales` directory.

2. Add the locale to the list here:

   https://github.com/playcanvas/supersplat/blob/main/src/ui/localization.ts

### Testing Translations

To test your translations:

1. Run the development server:

   ```sh
   npm run develop
   ```

2. Open your browser and navigate to:

   ```
   http://localhost:3000/?lng=<locale>
   ```

   Replace `<locale>` with your language code (e.g., `fr`, `de`, `es`).

## Contributors

SuperSplat is made possible by our amazing open source community:

<a href="https://github.com/playcanvas/supersplat/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=playcanvas/supersplat" />
</a>
