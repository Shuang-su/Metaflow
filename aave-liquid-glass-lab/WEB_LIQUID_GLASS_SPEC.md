# Web Liquid Glass 可复现规范

本文档把 Aave `Building Glass for the Web` 原站实现归纳为可重写的 Web Liquid Glass 规范。目标是让后续实现者能按规范重新实现效果，而不是复制 Aave 的 minified Next/Turbopack bundle。

源码级证据链见 `AAVE_GLASS_IMPLEMENTATION_NOTES.md`。本文件只保留规范结论，不重复嵌入大量 chunk 源码。

交互式研究册见 `storybook/`，正式标题为 `Web Liquid Glass：原理与实现`。它在标准 Storybook preview 中一次性初始化本地 Aave Turbopack runtime，并按页面直接挂载原始组件模块；不会启动完整文章、运行裁切脚本或使用手写近似效果。组件演示之后的中文解释、运行态指标和 chunk 片段由构建脚本从本地证据中提取。唯一可调页面是 `How It Works / Displacement Map`。Storybook 不是新的事实来源，原站镜像和 reference 证据仍是 oracle。

## 1. 证据边界

唯一事实来源：

- 本地镜像：`/design/building-glass-for-the-web/`
- 原始源码块：`reference/origin/scripts/`
- 运行态指标：`reference/origin/runtime-metrics.json`
- live DOM 摘要：`reference/origin/live-summary.json`
- 对比记录：`reference/comparison-ledger.md`

核心 chunk 映射：

- `504982d42d3368e6.js`：DOM Glass、默认 lens 参数、SVG filter、`feDisplacementMap`、filter pool。
- `3963356e871bc455.js`：video/WebGL shader、circle/bar lens、blur texture、specular、adaptive brightness。
- `36e75939a1c38671.js`、`45f52371f14d4928.js`、`25ef42f3c325a091.js`：switch、slider、toggle、map playground 的调用层和参数。

不能作为依据：

- 已移除的早期手写近似页。它和最终原站实现差距较大。
- 纯 CSS `backdrop-filter` 玻璃外观。它只能模拟透明质感，不能复现 Aave 的像素折射。
- 把 Storybook 的原始模块桥接当成生产 API。它只用于研究和行为验证；镜像是 oracle，不是生产代码。

## 2. 原理总览

Web Liquid Glass 的核心不是捕获背景，也不是给元素加透明模糊层，而是生成一张 displacement map。

普通 DOM 路径：

1. 内容按浏览器正常方式渲染。
2. 根据 lens 形状和参数生成一张小 PNG map。
3. 把 map 放进 SVG `feImage`。
4. 用 `feColorMatrix` 调整 map 的红/绿通道强度。
5. 用 `feDisplacementMap` 折射目标层的像素。
6. 再叠加 tint、edge、specular、glow 等视觉层。

canvas/video 路径：

1. 把 source canvas 或 live video 上传为 WebGL texture。
2. 把同一类 displacement map 上传为 map texture。
3. fragment shader 用 map 的 R/G 通道偏移 source sampling。
4. 用 RGB 不同偏移产生 chromatic fringe。
5. 用 blur/specular/adaptive brightness 保持控件可读。

最终方案必须同时支持 DOM/SVG 与 WebGL 两条路径。DOM 组件不应依赖 Chromium-only backdrop capture；video/canvas 不应依赖 Safari 对 live video 的 SVG filter 支持。

## 3. 术语

- `glass container`：玻璃组件外层容器。原站标记为 `data-aave-glass-container`，负责持有 lens visual、SVG filter、目标层和真实交互内容。
- `refraction target`：被折射的视觉目标层。原站选择器为 `data-refraction-target`，或由组件内部复制一层高亮/填充内容作为目标。
- `lens`：玻璃镜片区域。它有位置、尺寸、圆角、深度、折射强度、色散和高光参数。
- `filter region`：SVG filter 实际处理的区域。必须尽量贴近 lens，而不是覆盖整页。
- `displacement map`：小 PNG 或 canvas texture。R/G/B/A 通道编码折射和视觉效果。
- `visual shell`：不负责真实折射的镜片外观层，例如 rim、shadow、tint、edge highlight。
- `WebGL surface`：无法可靠交给 SVG filter 的表面，例如 canvas-drawn QR、live video。
- `filter pool`：复用的一组 SVG filter 节点。移动 lens 时更新属性，避免频繁创建 DOM。

## 4. 参数模型

基础 lens 参数：

| 参数 | 含义 | 规范 |
| --- | --- | --- |
| `lensW` / `lensH` | lens 半宽/半高或组件传入的核心尺寸 | 实际 DOM lens 常是两倍尺寸；实现必须明确内部坐标含义 |
| `borderRadius` | rounded rect 半径 | 不得超过 `min(width,height)/2` |
| `depth` | 壳层深度 | 小组件常用像素值，例如 switch/slider 使用约 `2` |
| `scaleX` / `scaleY` | 水平/垂直折射强度 | 通过 `feColorMatrix` 或 shader uniform 控制 |
| `chromaAmount` | RGB 色散强度 | DOM 与 WebGL 都应支持 |
| `mapSize` | displacement map 分辨率 | 原站常用 `256`，复杂场景可用 `512` |
| `domeDepth` | 圆顶曲面深度 | 大于 0 时使用 spherical-cap 梯度 |
| `splayAmount` | 边缘张开/收束 | 用于减少边缘过强变形 |
| `edgeFalloff` | 边缘衰减 | 控制折射在边缘附近平滑消退 |
| `specularRotation` | 高光方向 | 角度制 |
| `glowStrength` / `glowSpread` / `glowExponent` | 泛光强度、范围、曲线 | 写入 B 通道或单独 pass |
| `edgeStrength` / `edgeWidth` / `edgeExponent` | 边缘高光 | 只应覆盖 lens 附近 |
| `brightness` / `tint` | 亮度与色调 | 视觉增强，不能替代折射 |

运行态 lens state：

| 字段 | 含义 |
| --- | --- |
| `x` / `y` | lens 中心在 container 内的归一化位置或像素位置 |
| `width` / `height` | 当前 lens 尺寸 |
| `active` | 是否按下、hover、drag、selected |
| `targetRect` | refraction target 相对 container 的 bbox |
| `filterRect` | filter 实际处理区域 |

规范要求：移动 `x/y` 不应重新生成 map；只有 shape 参数变化时才重新生成 map。

## 5. Displacement Map 规范

坐标系：

- map 坐标以 lens 或 lens group 的局部坐标为准。
- 对每个 map 像素，将 `(u,v)` 映射到局部像素坐标 `(px,py)`。
- 中心点为 `(0,0)`；右/下为正方向。

rounded rect SDF：

```text
qx = abs(px) - halfW + radius
qy = abs(py) - halfH + radius
outside = length(max(q, 0))
inside = min(max(qx, qy), 0)
signedDistance = outside + inside - radius
```

circle SDF：

```text
signedDistance = length(px, py) - radius
normal = normalize(px, py)
```

shell mask：

```text
shellMask = 0.5 * (1 + erf((signedDistance + depthPx) / (depthPx * sqrt(2))))
```

通道含义：

| 通道 | 含义 | 中性值 |
| --- | --- | --- |
| R | horizontal displacement | `128` |
| G | vertical displacement | `128` |
| B | specular / edge / glow intensity | `128` |
| A | active mask | lens 内 `255`，外部按实现可为 `0` 或中性 `255` |

基础写入：

```text
R = (0.5 - 0.5 * normalX * shellMask) * 255
G = (0.5 - 0.5 * normalY * shellMask) * 255
B = 128 + specularOrEdge
```

dome curve：

当 `domeDepth > 0`，使用 spherical-cap 梯度替代线性 normal：

```text
Rx = (halfW * halfW + depth * depth) / (2 * depth)
gradientX = x / sqrt(Rx * Rx - x * x) * scaleX
```

`scaleX/scaleY` 需要用积分归一化，使不同 lens 尺寸下曲率一致。

四象限优化：

- rounded rect/circle map 具有四折对称。
- 可只计算一个象限，再镜像写入四个象限。
- 镜像时 X 方向要反转 R 通道，Y 方向要反转 G 通道。
- 该优化只影响生成性能，不能改变最终 map 语义。

## 6. DOM/SVG 路径规范

最低结构：

```html
<div data-aave-glass-container>
  <div class="real-content">...</div>
  <div data-refraction-target>...</div>
  <svg aria-hidden="true">
    <filter>
      <feImage result="rawMap" />
      <feColorMatrix in="rawMap" result="scaledMap" />
      <feDisplacementMap
        in="SourceGraphic"
        in2="scaledMap"
        xChannelSelector="R"
        yChannelSelector="G" />
    </filter>
  </svg>
  <div class="lens-visual"></div>
</div>
```

规则：

- 真实交互内容必须保持真实 DOM，不应变成截图。
- `refraction target` 可以是真实内容，也可以是复制出的高亮/填充层。
- filter 应作用于 target，不应无差别过滤整个页面。
- lens visual 负责 rim、shadow、tint，不负责核心折射。
- filter id 或 map href 在 Safari 中应可刷新，避免 filter 缓存冻结。
- filter pool 应复用节点；组件卸载时清理 `filter`、`will-change`、observer 和 object URL。

SVG filter 要点：

- `feImage` 持有 data URL 或 object URL map。
- `feColorMatrix` 把 R/G 通道按 `scaleX/scaleY` 拉向或远离中性值。
- `feDisplacementMap scale` 在 objectBoundingBox filter 下通常是小数。
- specular / tint / edge pass 可以用额外 primitive 叠加，但不得扩大 filter region 到整页。

## 7. 组件行为规范

button / nav / CTA：

- lens 可以覆盖整个 button，也可以只覆盖 hover/active 区。
- hover 移动只更新 lens position；shape 不变时不重建 map。
- text/icon 必须仍由真实 DOM 呈现，保持可点击和可访问性。

switch：

- thumb 是 lens。
- track 本身保持真实控件语义，native input 或等效 ARIA 必须可用。
- 原站模型：真实 track 约 `74x28`，glass container 约 `116x70`，margin 约 `-21px`。
- refraction target 可使用 track fill 的复制层，常见尺寸为视觉层两倍后再 `scale(0.5)`。
- checked、drag、hold、release 都只移动 lens/filter region；不应每帧重建 map。

slider：

- thumb 是 lens，track fill 是主要 refraction target。
- 原站模型：track 约 `240x22`，glass container 约 `290x72`，margin 约 `-25px`。
- native `input[type=range]` 可隐藏但必须保留可访问性和同步值。
- 拖动时 lens 位置和 fill 宽度同步；map 只在 thumb 尺寸、圆角或 refraction 参数变化时重建。

segmented toggle：

- selected indicator 是 glass lens。
- lens 只在当前选中项范围内移动，不外溢到整行。
- label 保持真实 DOM，选中态通过 glass target/highlight 层增强。
- 运动应使用 spring/easing，避免直接跳变。

hover lens / product card：

- hover lens 只处理局部目标。
- 多 lens 时使用 multi-lens filter pool 或单张 multi-region map。
- 每个 lens 必须有独立 bbox，避免 hover 大面积触发 filter 成本。

QR / canvas：

- QR 本体在 canvas 中绘制，没有 live DOM 给 SVG filter 折射。
- 点击或按压时，使用同一类 displacement map 驱动 WebGL shader。
- 验收必须能观察 canvas 像素签名变化。

video controls：

- live video 是 source texture。
- 每个控制按钮可对应 circle lens；进度条可对应 bar lens。
- 控件文字/图标要借助 tint、rim、adaptive brightness 保持可读。
- Safari 不可靠支持 live video 的 SVG filter，必须使用 WebGL 路径。

map playground：

- 参数面板改变 shape 参数时，应重新生成 map。
- 只移动 lens 位置时，不应重新生成 map。
- 预览必须同时展示 refracted result 和 displacement map。

## 8. WebGL 路径规范

适用场景：

- canvas-drawn QR。
- live video，尤其 Safari。
- 未来任何不适合进入 SVG filter pipeline 的 GPU/composited surface。

输入 texture：

- `sourceTexture`：canvas 或 video 当前帧。
- `mapTexture`：displacement map。
- `blurTexture`：可选，用于低频背景/可读性增强。

uniform：

- source bbox：限制采样区域。
- lens list：circle lens 数组和 bar lens。
- `u_chromaAmount`：RGB 采样偏移。
- `u_specStrength`：高光强度。
- `u_adaptStrength`：自适应亮度强度。
- `u_specLumaLow` / `u_specLumaHigh`：高光亮度范围。

shader 规则：

- 读取 map R/G，转换为以 `0.5` 为中性的 offset。
- 对 RGB 使用略不同 offset，形成 chromatic fringe。
- lens 外保持原 source 或透明输出。
- 对 video 控件，应只处理控制区域，不重绘整帧视频。
- 测试模式应允许读取 canvas pixels；生产可关闭昂贵调试选项。

## 9. 性能规范

必须遵守：

- 移动 lens 不重建 map。
- shape 改变、参数改变、mapSize 改变时才重建 map。
- filter bbox 必须贴近 lens 或 lens group。
- 避免把整页、整张大图、整段长 DOM 作为 SVG filter input。
- 大量控件同时存在时复用 filter pool。
- 使用 `ResizeObserver` 只更新 bbox，不在 resize 每帧重建所有 map。
- object URL / texture / observer 必须释放。

建议：

- map 使用 `256` 作为默认分辨率；大 lens 或高 DPI 可升到 `512`。
- rounded rect/circle 使用四象限生成。
- pointermove 中只写 CSS transform、SVG `x/y/width/height` 或 uniform。
- 对低性能设备降低 glow/specular pass，而不是关闭核心 displacement。

## 10. 浏览器规范

Chromium：

- DOM SVG `feDisplacementMap` 可用。
- WebGL canvas/video 可用。
- 如果 specular pass 只裁 lens，可能出现 sub-pixel edge shimmer；需要截图验证。

Safari / iOS Safari：

- DOM SVG `feDisplacementMap` 可用，是最终跨浏览器路径。
- live video 不应依赖 SVG filter，必须走 WebGL。
- SVG filter 可能按 filter id 缓存；map 更新时刷新 filter id 或 href。
- filter input 尺寸上限更敏感，必须保持 tight bbox。

Firefox：

- DOM SVG displacement path 应可用。
- video/canvas 走 WebGL。
- 不应依赖 Chromium-only backdrop capture 或 HTML-in-Canvas flag。

禁用路径：

- 依赖 `backdrop-filter` 捕获任意 HTML 背景。
- 依赖实验性 HTML-in-Canvas API。
- 依赖 Safari 对 live video 执行 SVG filter。

## 11. 验收规范

DOM/SVG 验收：

- 页面存在预期数量的 `data-aave-glass-container`。
- 每个 glass container 下有非空 SVG `filter`。
- `feImage` href 非空，且 map 是 data URL 或 object URL。
- `feDisplacementMap` 存在，R/G channel 设置正确。
- lens 移动时 `feImage x/y/width/height` 或 filter region 变化。
- 真实按钮、input、link 仍可点击、可聚焦。

WebGL 验收：

- canvas 非空。
- 交互前后 canvas pixel signature 变化。
- video play/pause/progress 不回退。
- source video/canvas 缺失时有明确降级，不出现空白控件。

视觉验收：

- desktop 和 mobile 截图对比原站。
- lens 不外溢 wrapper。
- switch/slider/toggle 的 lens 限制在对应组件内。
- text/icon 不被高光遮蔽到不可读。
- hover/drag/release 运动连续，无明显 layout shift。

离线验收：

- 断网或阻断外部请求后，HTML/CSS/JS/图片/视频占位仍能加载。
- 没有远程 chunk、字体、图片依赖。
- 已知原 bundle 噪声可以记录，但不能影响 hydration、filter、canvas/video 或交互。

本地 oracle 当前基线：

- `glass: 5`
- `filters: 25`
- `feImage: 25`
- `feDisplacementMap: 35`
- `canvas: 4`
- `video: 2`
- QR 点击后 canvas signature 变化。
- map playground 拖动 Width 后 `feImage` region 和 displacement map data 变化。
- mobile `390x844` 无横向溢出。

## 12. 实现原则

- 先写 framework-agnostic core，再写 DOM/WebGL adapter。
- 把“折射”与“视觉外壳”分开；视觉外壳不能掩盖折射失败。
- 把“事实证据”和“抽象规范”分开；实现可以重写，oracle 不可随意改。
- 不复制原站 minified bundle。
- 不恢复旧手写 demo。
- 每个新增组件都必须有交互证据、截图证据和非空 filter/map/canvas 证据。
