# Metaflow Editor — SuperSplat v2.32.5 candidate

这是 MF-56 / MF-57 的新版定制源码，基于固定上游 commit `e060989b202548848eb440a5005cd41a8b26f7db`，不跟随 `main`。保留 Metaflow 品牌、100000 帧时间线、legacy ZIP、settings-only 和版本/SW 契约，并提供默认关闭的 Viewer 粒子开场视频选项。

本目录是 **未发布的开发候选**，不是纯上游快照；纯上游在 `../references/supersplat-v2.32.5/`。当前产品版本仍是 Editor `1.1`，运行时显式标注 `development`。旧活动源和发布镜像尚未切换。

- [使用粒子视频](../docs/guides/editor-particle-video.md)
- [MF-56 升级 Spec](../docs/specs/mf-56-editor-upgrade.md) / [MF-57 功能 Spec](../docs/specs/mf-57-editor-particle-video.md)
- [MF-56](https://github.com/Shuang-su/Metaflow/issues/56) / [MF-57](https://github.com/Shuang-su/Metaflow/issues/57)：两套验收与交付记录

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

Use **Node 22.23.2** from this directory's `.nvmrc` (supported engine range: `>=22.13.0 <23`). Do not change the root or Viewer Node settings.

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

Open `http://127.0.0.1:4356/editor/`. In another terminal, `npm run watch` rebuilds on edits. The local acceptance server binds only to loopback and does not serve the entire workspace. Build the Viewer separately with its own Node version only when checking Viewer interoperability.

Browser tests require a native Chrome/Edge and `ffprobe`/`ffmpeg` for file verification:

```sh
npm run test:e2e -- video-export video-lifecycle lcc2-format
npm run test:e2e -- video-background
```

Optional real-scene tests and Safari instructions are in the [guide](../docs/guides/editor-particle-video.md). Keep outputs/caches under the project-local `.codex-work/`, never in the immutable reference.

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
