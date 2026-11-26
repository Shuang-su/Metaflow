# Editor 导出契约

当前实现位于 `supersplat-v3.5.2/src/ui/export-popup.ts`、`src/file-handler.ts` 和 `src/splat-serialize.ts`；兼容版同名实现位于 `supersplat-v2.32.5/`。1.3.1 已于 2026-10-22 通过 CLI 发布。

## 通用模型导出

Editor 支持 PLY、compressed PLY、SPLAT 和 SOG。SOG 导出使用 splat-transform，默认 iterations 为 `10`；compressed PLY 与 SOG 会移除无效点并使用最低 opacity 边界。

## Viewer 导出类型

| UI 类型 | 内部 type | 输出 | 用途 |
|---|---|---|---|
| HTML | `html` | 单一 `output.html` | 自包含分享或快速验收 |
| Package | `zip` | 上游 unbundled Viewer ZIP | 多文件 Viewer 包 |
| Metaflow legacy ZIP | `legacyZip` | `output.zip` | 兼容 Metaflow 旧 Viewer 包 |
| settings.json | `settingsJson` | `settings.json` | 只导出体验配置，配合平台模型与 index |

### Legacy ZIP 内容

固定包含：

```text
index.html
index.css
index.js
settings.json
scene.compressed.ply
```

其中模型由当前场景生成 compressed PLY。这个包用于兼容和独立验证，不表达平台 route、environment、voxel 或 index 元数据。

### Settings-only

`settingsJson` 只写入格式化的 `ExperienceSettings`，文件名为 `settings.json`。它不会同时写模型，因此适合更新相机、动画、背景或后处理而保持既有模型路径。

当前 `export-popup.ts` 和 `publish-settings-dialog.ts` 都构造 `annotations: []`；Editor 没有把已有 Viewer annotations 导入、创作并原样导出的往返能力。重新导出可能清空手工标注，具体维护边界见 [Viewer settings schema](viewer-settings-schema.md#标注及当前-editor-限制)。

## 文件选择器与下载回退

支持 File System Access API 的浏览器使用 `showSaveFilePicker`；不支持时走浏览器下载。用户取消不算错误；写入或序列化失败会显示错误 popup。

## 平台发布选择

- 临时分享：HTML 或 Package。
- 兼容旧包：Metaflow legacy ZIP。
- 进入 `data/index.json`：模型/SOG 与 `settings.json` 分开管理。
- 只更新体验配置：settings-only，并重新验证 route。

不要把 Editor 的 HTML/ZIP 文件名结构当成 `data/index.json` schema；两者是不同交付契约。

进入稳定 route 的主体模型还必须符合 [资源索引 schema](resource-index.md#可索引模型边界)：当前是 SOG 或 streaming JSON，独立 compressed PLY 只适合 direct URL/legacy package。

## 1.3.0 渐变背景

两版 Editor 的背景入口支持纯色、线性与径向渐变。渐变随工程保存；`view.background` 可选，旧 `view.bgColor` 保留。导出的 settings 仍为 version 2；`background.color` 是色标透明度的合成底色及兼容值。

渐变场景的 HTML、SOG Package 与 legacy ZIP 使用共享背景实现的 Metaflow Viewer。HTML 是单文件；Package 包含 `scene.sog`；legacy ZIP 继续恰好包含 `index.html`、`index.css`、`index.js`、`settings.json`、`scene.compressed.ply`。导出页面关闭平台路由与分析服务，无线上运行时依赖。纯色场景沿用原有上游导出路径。

图片、普通及粒子视频在最终输出画幅合成背景；360° 在全景投影之后合成。选择透明背景时跳过整个背景层。模型、相机、粒子时钟、编码预检和取消/失败恢复契约不变。
