# Web Liquid Glass 独立实现审计

审计日期：2026-07-31

## 结论

`src/implementation/` 是独立、可读、可修改的 TypeScript/GLSL 实现。它没有导入 Aave Turbopack runtime、锁定模块、`OriginModuleHost` 或 `reference/origin`。Storybook 的构建页同时渲染锁定基准与独立实现，是为了逐项核验；两者运行在不同的 React 子树中。

当前可以确认的是：DOM/SVG 的 map 生成、filter pool、控件几何和明暗主题参数已在代表性状态下与锁定基准一致；QR 与 Video 使用独立 WebGL renderer，并且交互会改变独立 canvas 的像素。当前还不能把整个项目表述为“所有浏览器、所有动画帧、所有像素均 1:1”，未完成项列在本文末尾。

## 独立性检查

检查范围：

```text
storybook/src/implementation/
```

禁止依赖：

```text
OriginModuleHost
origin/runtime
TURBOPACK
reference/origin
/origin/
```

静态搜索结果为零。独立实现的主要入口如下：

| 路径 | 职责 |
| --- | --- |
| `lens-map.ts` | DOM/SVG rounded-rect 与 circle displacement map |
| `surface-map.ts` | WebGL surface 使用的 bbox map |
| `svg-glass.ts` | 五槽 SVG filter pool、filter bbox、Safari refresh |
| `webgl-refraction.ts` | source/map/blur textures 与渲染循环 |
| `webgl-shaders.ts` | RGB offset、specular、adaptive brightness |
| `qr-painter.ts` | QR pointer trail、click splash 与衰减 |
| `qr-refraction.ts` | QR WebGL 输出与 finder-eye lens |
| `examples/` | Hero、Switch、Slider、Toggle、QR、Video、Playground |

## DOM/SVG 等价性

以下检查均在同一 Storybook preview 中同时挂载锁定基准和独立实现，然后读取各自的运行态 DOM 与 `feImage` data URL。

| 案例 | 几何与节点 | Map 核验 | 交互核验 |
| --- | --- | --- | --- |
| Hero | 独立实现使用 80px map 与 160px visual lens；hover 只放大 visual shell | 初始 map data URL 与基准相同 | map 稳定策略已按源码修正；pointer hover 的逐帧截图仍待补 |
| Switch Light | 两侧 glass host 均为 `116 × 70`；每侧 5 filters / 7 displacement nodes | data URL 完全相同 | native checkbox `false -> true` |
| Switch Dark | 使用 dark material override 后，两侧 map 均相对 Light 改变 | dark data URL 完全相同 | Storybook 全局主题同步 |
| Slider Light | 两侧 glass host 均为 `290 × 72`；每侧 5 filters / 7 displacement nodes | data URL 完全相同 | native range 与 glass position 同步 |
| Segmented Toggle | selected pill、lens geometry 和状态路径按相同参数运行 | 已完成代表状态的字节对比 | 点击后 selected pill 与 lens 同步移动 |
| How It Works | 初始参数下两侧 map 长度均为 `123162` | 初始 data URL 完全相同 | Width `70 -> 90` 后独立 map 改变，基准 map 保持不变 |

`svg-glass.ts` 还修正了一个影响参数实验的真实问题：没有显式提供 `mapGeometry` 时，shape 更新现在会同步重建 map；显式提供固定 `mapGeometry` 时，只移动或放大 visual shell 不会重建 PNG。

## QR / Canvas

独立 QR 路径不调用锁定 renderer：

1. `qr-scene.ts` 生成 QR source texture。
2. `qr-painter.ts` 维护 color painter 和 scale painter。
3. `qr-refraction.ts` 上传 source/map/painter textures。
4. fragment shader 合成 finder-eye lens、pointer trail 和 click splash。

运行态检查：

| 项 | 结果 |
| --- | --- |
| 独立 DOM canvas | 2 个 |
| source canvas | `28 × 28`，CSS `324 × 324` |
| WebGL output | `750 × 750`，CSS `324 × 324` |
| 点击前像素签名 | `7a3f9429e8512e61` |
| 点击后像素签名 | `121c478ca434157e` |

像素签名变化证明点击动画来自独立 canvas renderer，而不是 CSS 覆盖层或原始模块。

## Video / WebGL

独立 Video 路径使用自己的 video element、texture lifecycle 和 renderer：

| 项 | 结果 |
| --- | --- |
| source video | `readyState = 4`，`1280 × 720` |
| output canvas | `1750 × 985`，CSS `700 × 393.75` |
| 初始状态 | 播放中，按钮为 `Pause` |
| 点击后 | `paused: false -> true`，按钮为 `Play` |
| canvas | 播放/暂停操作前后截图签名变化 |

renderer 包含 source、map 和 blur texture，circle/button lenses、bar/progress lens、RGB offset、specular 与 adaptive brightness 都在本地 GLSL 中实现。

## 构建与内容检查

执行：

```bash
npm run generate-study-pages
npm run typecheck
npm run build-storybook
```

结果：

- 生成 8 个研究条目和 15 个实际源码片段。
- TypeScript 检查通过。
- Storybook 静态构建通过。
- preview 内无嵌套 iframe。
- 根 README 有 6 个高亮代码块、5622 个带样式 token、7 类 token style。
- Markdown 表格渲染为真实 table，不再显示原始 pipe 文本。
- npm、Storybook、TypeScript 与 Playwright cache/temp 均固定在 `storybook/.cache/`。

## 尚未完成的 1:1 验收

以下事项未在本轮完成，因此不能声称全量 1:1：

1. Safari 上逐个复测独立实现，而不只是验证原始镜像。
2. `390 × 844` 下逐页复测独立实现的布局与交互。
3. Hero hover/hold/release 的逐帧运动曲线与截图差分。
4. QR 与 Video 的全画面像素差分；目前证明了独立渲染和状态变化，尚未证明每个像素与锁定基准相同。
5. 长时间视频播放、resize、DPR 改变和 context-loss 恢复。

因此，当前实现已经具备后续修改所需的独立源码和共享核心，但“原样实现”仍应被理解为已完成核心算法与代表状态等价，跨浏览器和全动画像素级验收仍需继续。
