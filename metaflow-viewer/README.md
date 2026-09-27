# Metaflow Viewer 包

这是 Metaflow Viewer 的前端包。当前使用说明见
[`docs/getting-started/viewer.md`](../docs/getting-started/viewer.md)，完整文档入口见
[`docs/README.md`](../docs/README.md)，逐提交审计见
[`docs/metaflow-viewer-change-ledger.md`](../docs/metaflow-viewer-change-ledger.md)。

## 当前版本

- 当前生产：`5.20.0`，99 项资源、索引 schema `1.2`。
- MF-85 上游基线：SuperSplat Viewer `v1.35.2`，PlayCanvas `2.22.4`。
- 产品 SHA：`348f6fd`；发布、验证及已接受的 LOD 内存代价见 [生产完成记录](../docs/changes/85-viewer-upstream-v1.35.2/completion.md)。

Viewer `5.19.2` analytics recovery 已发布到 production。`metadata/version-history.json` 记录 `v1.29.1` 运行时产品 SHA `26e311c` 与 analytics/release 修复 SHA `92d11b0`；`viewer-v5.19.0` prepare 在 deployment 前失败且从未进入生产，`5.19.1` 的线上构建曾漏注入 Supabase analytics endpoint。本次修复让 production/tagged build 在 endpoint 缺失时直接失败，并由 release smoke 校验最终 HTML meta；实际升级路径是 `5.18.1 -> 5.19.1 -> 5.19.2`。

`5.19.3` 随后发布芒种与 SZTUCCF260919 的 12 项资源。MF-85 的兼容处理、验证与历史执行记录见 [升级记录](../docs/changes/85-viewer-upstream-v1.35.2/adoption.md)。

## 嵌入实例（5.20.0）

浏览器入口与样式单独导出，宿主决定容器尺寸。实例默认不写 `window.app` 等全局对象，不启用分析；`ui: false` 可交由宿主提供控件。此轮不额外发布 npm 包。

```js
import { createViewer } from 'metaflow-viewer/viewer';
import 'metaflow-viewer/viewer.css';

const viewer = await createViewer({
    container: document.querySelector('#scene'),
    contentUrl: '/data/Animals/Cats/mangzhong/2609160002/scene.sog',
    settings: '/data/Animals/Cats/mangzhong/2609160002/settings.json',
    ui: true,
    noanalytics: true
});

// captureFrame waits for readiness, serializes requests, and returns base64 RGBA.
const frame = await viewer.captureFrame({ width: 4096, height: 4096, time: 0, supersample: 1 });
// On component unmount:
viewer.destroy();
```

创建返回后模型可能仍在加载。相机、动画、标注等交互 API 要求 `viewer.state.loaded`；可监听 `viewer.events` 的 `loaded:changed` 和 `loadingStage:changed`，加载失败进入 `error` 阶段。`seek(time)` 保持当前播放／暂停状态并请求下一帧；独立页面的旧 `scrubTo(time)` 仍会暂停并等待画面，二者不互相替代。`destroy()` 可重复调用，销毁中的截图会拒绝，其他嵌入实例继续工作。

`environmentUrl`、`voxelUrl`、`voxelManifestUrl`、动画策略与分析选项的类型见 [options.ts](src/options.ts)。环境／碰撞加载不阻塞主体首帧；行走仍受当前位置碰撞就绪状态约束。嵌入实例只在自身获得焦点时接收键盘与游戏手柄输入。

Node 侧继续使用不加载图形引擎的入口：

```js
import { renderViewerHtml, css, js } from 'metaflow-viewer';
import { importSettings, validateSettings } from 'metaflow-viewer/settings';

const page = renderViewerHtml({
    bootstrap: { contentUrl: '/scene.sog', settingsUrl: '/settings.json' },
    inlineCss: true,
    inlineJs: true
});
```

原有 `html`、`css`、`js` 导出保持可用。settings 迁移不修改调用者输入；创作数值范围只在 `validateSettings(settings, { limits: true })` 时启用，历史资源不自动截断或改写。

## 本地运行

```bash
npm ci
npm run build
npx --no-install serve -s public -l 3000
```

服务运行在 `http://localhost:3000`，`-s` 为 `/acg/...` 等深层路径提供 SPA fallback。

排查 PlayCanvas 引擎断言或内部状态时，可以显式选择 development export：

```bash
ENGINE=debug npm run build
```

该命令只用于诊断；普通 `npm run build` 仍使用 PlayCanvas production/default export，部署流程也不会自动启用 Debug Engine。

稳定 route 的开发模式分两个终端：

```bash
# 终端 1
npm run watch

# 终端 2
npx --no-install serve -s public -l 3000
```

当前 `npm run develop` 使用不带 `-s` 的静态服务器，只适合根路径或直接 query 调试，不能单独证明深层 route 可访问。URL 参数和实际覆盖顺序见 [`docs/reference/viewer-url-parameters.md`](../docs/reference/viewer-url-parameters.md)，问题分层见 [调试与性能分析](../docs/guides/debug-and-profile.md)。

## 验证

```bash
node --test tests/*.mjs
npm run type:check
npm run build
```
