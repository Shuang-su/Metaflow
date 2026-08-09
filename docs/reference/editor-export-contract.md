# Editor 导出契约

当前实现位于 `supersplat-v2.28.0/src/ui/export-popup.ts`、`src/file-handler.ts` 和 `src/splat-serialize.ts`。

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

`settingsJson` 只写入格式化的 `ExperienceSettings`，文件名为 `settings.json`。它不会同时写模型，因此适合更新相机、动画、标注或后处理而保持既有模型路径。

## 文件选择器与下载回退

支持 File System Access API 的浏览器使用 `showSaveFilePicker`；不支持时走浏览器下载。用户取消不算错误；写入或序列化失败会显示错误 popup。

## 平台发布选择

- 临时分享：HTML 或 Package。
- 兼容旧包：Metaflow legacy ZIP。
- 进入 `data/index.json`：模型/SOG 与 `settings.json` 分开管理。
- 只更新体验配置：settings-only，并重新验证 route。

不要把 Editor 的 HTML/ZIP 文件名结构当成 `data/index.json` schema；两者是不同交付契约。
