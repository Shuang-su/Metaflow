# Aave Liquid Glass 源码研究主文档

本文档记录从 Aave `Building Glass for the Web` 原站 bundle、运行态 DOM 和对比审计中反推到的 Liquid Glass 实现模型。它是源码研究主文档；`WEB_LIQUID_GLASS_SPEC.md` 是在此基础上提炼出的可复现规范。

配套 `storybook/` 的正式标题是 `Web Liquid Glass：原理与实现`。它按统一原理、组件案例和 displacement-map Playground 组织内容。标准 Storybook preview 初始化本地 Aave Turbopack runtime，并直接挂载 Hero、Switch、Slider、Toggle、QR、Video 或 How It Works 的锁定组件导出，作为视觉和交互基准；页面不 hydrate 完整文章、不做运行时裁切，也不创建嵌套 iframe。

为了让读者能够跟随实现，`storybook/src/implementation/` 还提供按本研究结论重写的可读 TypeScript/GLSL 教学核心。每个 `构建与代码` 页面并列呈现运行基准、可读实现、设计理由、失败模式和验收条件，展示源码直接来自实际运行文件。教学核心不替代原始证据，也不作为生产组件库；原站镜像、raw chunks、runtime metrics 和 comparison ledger 仍是验收 oracle。

Storybook 的编排参考保存在 `reference/takram-storybook/`，锁定到 commit `b012ad06d858fc035d88aacfd73f092f93c994e4`。该快照只用于 README/MDX、story/example 分离、fullscreen layout 和 addon panel 配置研究，不作为 Web Liquid Glass 算法依据。

## 阅读方式

每个核心模块按同一结构记录：

1. 源码位置：本地保存的原站 chunk 或运行态证据文件。
2. 关键源码片段：只摘录能证明实现模型的短片段；完整原始文件保留在 `reference/origin/scripts/`。
3. 运行态证据：来自 `runtime-metrics.json`、`live-summary.json`、`comparison-ledger.md` 和 Storybook 独立实现审计。
4. 行为解读：说明源码片段在页面中的真实行为。
5. 可复现规则：后续重写实现时必须保持的工程约束。

原站 bundle 是 minified Turbopack 输出，绝大多数源码都在单行内。下面的片段保留原标识、参数和结构，但会省略无关 minified 变量。

## 证据索引

| 证据 | 本地位置 | 证明内容 |
| --- | --- | --- |
| 原站镜像入口 | `design/building-glass-for-the-web/index.html` | 本地可运行 oracle，使用原始 SSR/Flight 页面和原始 chunks。 |
| DOM Glass chunk | `reference/origin/scripts/504982d42d3368e6.js-P2RwbD1kcG` | `AaveGlass`、默认 lens 参数、SVG filter、filter pool、`RefractionTarget`。 |
| video/WebGL chunk | `reference/origin/scripts/3963356e871bc455.js-P2RwbD1kcG` | video player shader、source/map/blur texture、circle/bar lens、adaptive brightness。 |
| 控件调用层 chunks | `36e75939a1c38671.js-P2RwbD1kcG`、`45f52371f14d4928.js-P2RwbD1kcG`、`25ef42f3c325a091.js-P2RwbD1kcG` | switch、slider、toggle、map playground、QR/canvas 的参数和 wrapper 行为。 |
| 运行态指标 | `reference/origin/runtime-metrics.json` | glass container、filter、`feImage`、`feDisplacementMap`、canvas、video 数量和 bbox。 |
| live DOM 摘要 | `reference/origin/live-summary.json` | 原站标题、段落、figure、视频、运行时 console 噪声。 |
| 对比账本 | `reference/comparison-ledger.md` | 原站/本地双窗口行为对比、hydration 修复、QR/map/mobile 验收。 |
| 镜像对比记录 | `reference/comparison-4173-mirror-check.json`、`reference/local-fixed-mobile-check.json` | 视觉、交互、mobile/offline 证据。 |
| 独立实现审计 | `storybook/INDEPENDENT_IMPLEMENTATION_AUDIT.md` | 可读实现与锁定基准之间的 map、DOM、WebGL 和交互核验。 |

## 源码索引

逻辑 chunk 与当前抓取文件的对应关系：

| 逻辑 chunk | 抓取文件 | 主要模块 |
| --- | --- | --- |
| `504982d42d3368e6.js` | `504982d42d3368e6.js-P2RwbD1kcG` | DOM/SVG 玻璃核心。 |
| `3963356e871bc455.js` | `3963356e871bc455.js-P2RwbD1kcG` | video/WebGL renderer。 |
| `36e75939a1c38671.js` | `36e75939a1c38671.js-P2RwbD1kcG` | switch、slider、toggle 的页面引用之一。 |
| `45f52371f14d4928.js` | `45f52371f14d4928.js-P2RwbD1kcG` | switch、slider、toggle 的页面引用之一。 |
| `25ef42f3c325a091.js` | `25ef42f3c325a091.js-P2RwbD1kcG` | QR/canvas、map playground、how-it-works 示例。 |

`-P2RwbD1kcG` 是抓取时保留下来的 chunk 查询后缀编码，不代表另一个实现版本。文档中讨论 chunk 时使用无后缀逻辑名，定位文件时使用完整抓取名。

## 1. DOM/SVG Glass 核心

### 源码位置

- `reference/origin/scripts/504982d42d3368e6.js-P2RwbD1kcG`
- 导出模块：`AaveGlass`、`DEFAULT_LENS_PARAMS`、`AAVE_GLASS_SELECTOR`

### 关键源码片段

选择器和默认参数：

```js
h = {
  container: "[data-aave-glass-container]",
  target: "[data-refraction-target]"
};
E = {
  lensW: 90,
  lensH: 60,
  depth: 0,
  chromaAmount: 0,
  scaleX: 0,
  scaleY: 0,
  mapSize: 256,
  borderRadius: 0,
  domeDepth: 0,
  splayAmount: 0
};
```

最小 filter 结构：

```jsx
<feImage data-lens="" href={mapUrl} result="rawMap" />
<feColorMatrix in="map" values={mapMatrix} result="scaledMap" />
<feDisplacementMap
  in={source}
  in2={scaledMap}
  scale={scale}
  xChannelSelector="R"
  yChannelSelector="G"
/>
```

Refraction target：

```jsx
<div
  data-refraction-target=""
  style={targetStyle}
>
  {children}
</div>
```

Filter id 刷新：

```js
filterEl.id = `${idPrefix}-pool-${slot}-v${version}`;
target.el.style.filter = `url(#${filterEl.id})`;
```

### 运行态证据

`runtime-metrics.json` 记录原站同一 viewport 下：

- `glass.length === 5`
- 每个 DOM glass container 内约有 `filterCount: 5`
- 总计 `feImage: 25`
- 总计 `feDisplacementMap: 35`
- hero glass container bbox：`764x368`
- switch glass container bbox：`116x70`，`margin:-21px`
- slider glass container bbox：`290x72`，`margin:-25px`
- toggle glass container visual rect：约 `584.73x206`

`comparison-ledger.md` 记录本地镜像修复后与原站一致：

- `window.next === true`
- `__next_f.length === 0`
- React event layer 存在
- switch、slider、toggle、video 行为与原站同 timing 对比一致

### 行为解读

`AaveGlass` 不是单个覆盖层，也不是 CSS `backdrop-filter`。它维护两类内容：

- 真实交互 DOM：正常接收点击、拖拽、键盘、可访问性状态。
- refraction target：被 SVG filter 折射的视觉层，可以是真实内容，也可以是组件复制出来的 track fill / selected pill。

`data-aave-glass-container` 是 lens 坐标系和 filter 管理边界。`data-refraction-target` 是真正被分配 `style.filter = url(#...)` 的对象。filter id 每次更新版本号，是为了让 Safari 重新读取新 map 和新 filter region。

### 可复现规则

- 真实控件必须保留原生 DOM 或等效 ARIA，不允许把交互区截图化。
- SVG filter 作用在 refraction target 上，不应直接过滤整页。
- filter region 要贴近 lens 或 target bbox；大范围 filter 是性能和 Safari 风险源。
- lens 移动时更新 `x/y/width/height/filter id`；shape 参数变化时才重新生成 map。
- Safari 路径必须能刷新 filter id 或 `feImage.href`，否则 map 更新可能冻结。

## 2. Displacement Map 生成

### 源码位置

- `504982d42d3368e6.js-P2RwbD1kcG`
- 主要函数形态：异步 canvas blob 生成器、同步 quadrant cache 生成器、多 lens map 生成器
- 公共数学 helper：`erf`、`computeDomeConstants`、`domeGradient`

### 关键源码片段

rounded rect SDF 与 shell mask 的核心结构：

```js
q = abs(local) - half + radius;
dist = length(max(q, 0)) + min(max(q.x, q.y), 0) - radius;
mask = 0.5 * (1 + erf((dist + depth) / (depth * SQRT2)));
```

通道写入：

```js
R = (0.5 - 0.5 * normalX * mask) * 255;
G = (0.5 - 0.5 * normalY * mask) * 255;
B = 128 + specularOrEdge;
A = 255;
```

dome curve：

```js
constants = computeDomeConstants(domeDepth, halfW, halfH);
gradient = domeGradient(distance, constants.Rx, constants.scaleX);
```

四象限生成器的特征：

```js
for (y = 0; y < half; y++) {
  for (x = 0; x < half; x++) {
    writeTopLeft();
    writeTopRightWithFlippedR();
    writeBottomLeftWithFlippedG();
    writeBottomRightWithFlippedRG();
  }
}
```

### 运行态证据

`comparison-ledger.md` 的 map playground 审计记录：

- 拖动 Width 后 `feImage[20]` 的 `x/width` 发生变化。
- 生成的 displacement image data length 从 `123162` 变为 `105382`。
- 截图显示 lens 变宽，Width 控制值更新。

`README.md` 的最终审计记录：

- QR/canvas 点击后 canvas signature 改变。
- map playground Width drag 会更新 lens `feImage` region 和 generated displacement image data。

### 行为解读

map 是 Liquid Glass 的核心数据结构。R/G 两个通道不是颜色，而是折射向量；B 通道承载 specular、glow、edge 强度；A 通道表示 active lens 区域或 lens mask。

原站有两种生成路径：

- 单 lens DOM path：形状参数稳定时生成一次，移动 lens 时复用。
- 多 lens / WebGL path：用 region 列表生成一张包含 circle 和 rounded-rect bar 的 map。

`domeDepth` 让圆形 lens 使用球冠梯度；`splayAmount` 用于抑制边缘过强的收束或张开。

### 可复现规则

- map 中性值必须是 `R=128/G=128`，否则 lens 外区域也会偏移。
- `scaleX/scaleY` 不应烘焙死在 map 内；DOM 路径可通过 `feColorMatrix` 调强度，WebGL 路径可通过 uniform 调强度。
- mapSize 是质量/性能 tradeoff，原站常见 `256`，map playground/QR 更高时使用 `512`。
- 移动、hover、drag 只移动 filter region；resize、squish、shape 改变才重建 map。

## 3. SVG Filter Pool 与 Target 分配

### 源码位置

- `504982d42d3368e6.js-P2RwbD1kcG`
- filter slot 工厂：legacy pool 与 multi-lens pool
- target 管理：`AaveGlass.General.Provider`、`RefractionTarget`、`RefractionGroup`

### 关键源码片段

pool slot 形态：

```js
slot = {
  filterEl: null,
  lensEls: [],
  dispEls: [],
  mapMatrixEl: null,
  feImageEl: null,
  version: 0,
  assignedTo: null
};
```

multi-lens pool 形态：

```js
subSlots = Array.from({ length: 4 }, createSubSlot);
pool = Array.from({ length: 8 }, createMultiLensFilter);
```

target register：

```js
provider.upsertTarget(element, {
  left,
  top,
  width,
  height,
  nested
});
```

target padding / bleed：

```js
target.style.padding = `${bleed}px`;
target.style.margin = `${-bleed}px`;
target.style.boxSizing = "content-box";
```

### 运行态证据

`runtime-metrics.json` 中每个 `data-aave-glass-container` 都包含自己的 SVG filter defs；`filtered` 列表显示被赋值 `url("#...")` 的不是整页，而是 lens 对应的局部 target 或复制视觉层。

在最终本地审计中：

- `filters:25`
- `feImage:25`
- `feDisplacementMap:35`
- slider/code section 可见
- in-app browser reload 后 counts 保持一致

### 行为解读

filter pool 的目的不是省 DOM 节点数量，而是避免在交互过程中反复创建/销毁 SVG filter。实际运行时的高频路径是：

1. 找出 lens bbox 与哪些 refraction target 相交。
2. 从 pool 中给 target 分配 filter slot。
3. 更新 slot 中 `feImage` 的 x/y/width/height。
4. 更新 `feDisplacementMap.scale`。
5. 更新 filter id 版本并把 `style.filter` 指向新 id。

这解释了为什么早期近似实现里“lens 漂在组件外”会错：原站不是把一块大 overlay 盖在组件上，而是把 target、filter region、visual shell 同步在同一个 container 坐标系内。

### 可复现规则

- 每个 glass container 管理自己的 filter defs，避免跨组件 id 冲突。
- pool slot 失配时必须清理 `style.filter` 和 `will-change`。
- 对 nested target 使用 padding/margin bleed，避免 lens 边缘截断。
- target 分配最多处理相交面积足够大的局部区域；原站会按面积排序并截断数量。

## 4. Switch 调用层

### 源码位置

- `36e75939a1c38671.js-P2RwbD1kcG`
- `45f52371f14d4928.js-P2RwbD1kcG`

### 关键源码片段

调用层入口：

```js
useControls("Glass Switch", {
  switch: { forceActive, width, height, rubberOvershoot, rubberDampening },
  refraction: { scaleX, scaleY, chromaAmount, brightness, depth, domeDepth, splayAmount },
  specularGlow,
  specularEdge,
  rendering
});
```

默认尺寸和 lens：

```js
trackW = 74;
trackH = 28;
rubberOvershoot = 0.15;
switchLens = {
  lensW: 90,
  lensH: 60,
  borderRadius: 30,
  mapSize: 256,
  depth: 2,
  chromaAmount: 1,
  scaleX: 0.25,
  scaleY: 0.25,
  domeDepth: 6,
  splayAmount: 0.4
};
```

真实 input 与 glass wrapper 同时存在：

```jsx
<input type="checkbox" role="switch" checked={checked} />
<AaveGlass
  lens={switchLens}
  style={{ width: glassW, height: glassH, margin: -bleed }}
  refractionTarget={trackFillCopy}
>
  <div className="track">
    <motion.div className="thumbHitArea" />
  </div>
</AaveGlass>
```

### 运行态证据

`runtime-metrics.json`：

- switch glass container：`116x70`
- container margin：`-21px`
- track 本体约 `74x28`

`comparison-ledger.md`：

- 同 timing 对比后 local/origin 的 switch 都变为 `checked:true`
- React fiber/props 修复后原始 pointer/tap 行为恢复

### 行为解读

switch 的 thumb 是 lens。track fill 被复制为 refraction target，玻璃折射的是这个 fill 层，而不是把整个 switch 截图后变形。

pointer 行为有三种状态：

- tap：短按直接切换，lens 扩张后回弹。
- hold：按住超过阈值后进入 expanded glass。
- drag：thumb 可 overshoot，释放后根据中点决定 checked 状态。

### 可复现规则

- native checkbox 或等效 ARIA 必须保留。
- lens position 由 thumb motion value 驱动。
- checked/drag/hold/release 不应重建 map，除非 forceExpanded 改变 shape。
- track fill copy 要放在 `refractionTarget` 内，和真实 track 保持几何同步。

## 5. Slider 调用层

### 源码位置

- `36e75939a1c38671.js-P2RwbD1kcG`
- `45f52371f14d4928.js-P2RwbD1kcG`

### 关键源码片段

控件参数：

```js
useControls("Glass Range Slider", {
  slider: {
    trackWidth: [trackW, 120, 400, 1],
    trackHeight: [trackH, 2, 20, 1],
    refractionTrackHeight: [round(0.75 * thumbH), 2, 40, 1],
    thumbWidth: [44, 20, 120, 1],
    thumbHeight: [thumbH, 16, 60, 1]
  },
  refraction: {
    scaleX: [0.133, 0, 0.25, 0.001],
    scaleY: [0.135, 0, 0.25, 0.001],
    chromaAmount: [0.65, 0, 1, 0.01]
  }
});
```

真实 range input 与自定义 track：

```jsx
<input
  type="range"
  min={min}
  max={max}
  step={step}
  value={value}
  onChange={event => setValue(Number(event.target.value))}
/>
<div className="root" onPointerDown={startDrag}>
  <div className="trackFill" />
</div>
```

Glass wrapper：

```jsx
<AaveGlass
  lens={sliderLens}
  tintBlur={4}
  filterResolution={2}
  refractionTarget={trackFillCopy}
/>
```

### 运行态证据

`runtime-metrics.json`：

- slider glass container：`290x72`
- margin：`-25px`
- 原文说明中 native `input[type='range']` 与自定义组件 back-sync

`comparison-ledger.md`：

- 原站和本地同 timing drag 后 slider value 都从 `50` 到 `98`
- slider/code section 在 in-app browser reload 后可见

### 行为解读

slider 和 switch 使用同一 glass 模型，但折射强度更温和。原因是 slider 下面的 fill 是数值反馈，必须保持可读；switch 的 fill 主要承担 moving highlight。

拖拽路径中，native range 保留为真实可访问控件；视觉 track 和 thumb 用 pointer events 同步 value。lens 只沿 track 移动，map 不随 value 每帧重建。

### 可复现规则

- native range input 不应删除；隐藏也要保留 keyboard/value/ARIA。
- fill width、thumb/lens x、input value 三者必须同步。
- refraction target 只复制 track fill，不要折射整条 row 或整段文本。
- slider refraction 默认应弱于 switch，避免值不可读。

## 6. Segmented Toggle 调用层

### 源码位置

- `36e75939a1c38671.js-P2RwbD1kcG`
- `45f52371f14d4928.js-P2RwbD1kcG`

### 关键源码片段

调用层入口：

```js
useControls("Glass Toggle Group", {
  toggleGroup: { itemCount },
  refraction: { depth, curvature, splay, scaleX, scaleY, chromaAmount, brightness },
  midTransition: { contentZoom, edgeThicknessBoost },
  squish,
  specularGlow,
  specularEdge
});
```

toggle lens 参数：

```js
toggleLens = {
  lensW: 50,
  lensH: 20,
  borderRadius: 16,
  mapSize: 256,
  depth: controls.refraction.depth,
  scaleX: controls.refraction.scaleX,
  scaleY: controls.refraction.scaleY,
  chromaAmount: controls.refraction.chromaAmount,
  domeDepth: controls.refraction.curvature,
  splayAmount: controls.refraction.splay
};
```

selection indicator：

```jsx
<AaveGlass
  lens={toggleLens}
  x={selectionX}
  y={selectionY}
  lensW={deformedWidth}
  lensH={deformedHeight}
  autoBorderRadius
  refractionTarget={selectedPillCopy}
>
  <ToggleGroup value={selected} onValueChange={setSelected} />
</AaveGlass>
```

### 运行态证据

`runtime-metrics.json`：

- toggle glass container visual rect 约 `584.73x206`
- container 使用 `padding:80px 40px` 和 `margin:-80px -40px`

`comparison-ledger.md`：

- 点击 `Assets` 后 local/origin lens 坐标一致：`x:412,y:368,w:92,h:67`

### 行为解读

toggle 的 glass 是 selection indicator，不是 hover decoration。它折射的是 overlay 中复制出来的 selected option pill，而不是直接折射按钮组下方全部内容。

motion 模型包含 travel spring 和 velocity deformation：横向移动时 lens 会 squeeze/stretch，释放后 spring settle。

### 可复现规则

- selected indicator 必须限制在当前 item 的几何区域内。
- overlay copy 和真实 ToggleGroup 要保持 item 顺序、尺寸、颜色一致。
- reduced motion 下应直接设置 selection bbox，跳过速度形变。
- lens shape 可随移动速度变形，但最终稳定态必须回到 selected item bbox。

## 7. QR / Canvas 与 Map Playground

### 源码位置

- `25ef42f3c325a091.js-P2RwbD1kcG`

### 关键源码片段

map playground 控制参数：

```jsx
<RangeSlider label="Width" value={width} min={20} max={120} />
<RangeSlider label="Height" value={height} min={20} max={80} />
<RangeSlider label="BorderRadius" value={radius} min={0} max={64} />
<RangeSlider label="Scale" value={scale} min={0} max={0.2} />
<RangeSlider label="Depth" value={depth} min={5} max={60} />
<RangeSlider label="Curvature" value={curvature} min={0} max={80} />
<RangeSlider label="Splay" value={splay} min={0} max={1} />
```

map playground 默认 lens：

```js
{
  lensW: 60,
  lensH: 60,
  borderRadius: 30,
  scaleX: 0.08,
  scaleY: 0.08,
  mapSize: 512,
  depth: 8,
  chromaAmount: 0.3,
  domeDepth: 60,
  splayAmount: 1
}
```

WebGL/canvas shader 与 DOM chroma 规则保持一致：

```glsl
vec2 uvR = uv + disp * (1.0 + u_chroma * 0.2);
vec2 uvG = uv + disp * (1.0 + u_chroma * 0.1);
vec2 uvB = uv + disp;
fragColor = vec4(sr.r, sg.g, sb.b, a);
```

### 运行态证据

`comparison-ledger.md`：

- QR click 后 canvas `0` signature 从 `3e2c3223` 变为 `1b306bbe`
- QR click 后 canvas `1` signature 从 `af329103` 变为 `5459cc7e`
- map playground Width drag 更新 `feImage` 区域和 generated displacement image data

### 行为解读

QR/canvas 没有 live DOM 给 SVG filter 折射，因此把 canvas 自身像素作为 source texture，再使用同一类 displacement map 进行 WebGL 采样。map playground 则是面向读者暴露参数的解释器：它直接展示 lens 参数如何改变 map 和折射结果。

### 可复现规则

- canvas surface 必须保留可验证像素输出；测试应比较 canvas signature 或像素 hash。
- map playground 的参数名和范围应和源码控制项一致。
- 同一参数在 DOM 和 canvas/WebGL 路径中应具有相同语义：R/G 偏移、chroma、depth、dome、splay。

## 8. Video / WebGL Renderer

### 源码位置

- `3963356e871bc455.js-P2RwbD1kcG`

### 关键源码片段

fragment shader uniforms：

```glsl
uniform sampler2D u_video;
uniform sampler2D u_map;
uniform sampler2D u_blurred;
uniform float u_chromaAmount;
uniform float u_specStrength;
uniform float u_adaptStrength;
uniform vec3 u_circles[3];
uniform vec4 u_bar;
```

circle/bar lens 判断：

```glsl
for (int i = 0; i < 3; i++) {
  if (u_circles[i].z < 0.1) continue;
  float rho = length(pxPos - u_circles[i].xy);
}
if (u_bar.z > 0.1 && u_bar.w > 0.1) {
  vec2 q = abs(pxPos - u_bar.xy) - u_bar.zw * 0.5 + vec2(u_barRadius);
}
```

map sampling 与 chroma：

```glsl
vec4 d = texture2D(u_map, scaledPx / u_bboxSize);
vec2 off = (d.rg - 0.5) * baseScale;
float sR = 1.0 + u_chromaAmount * 0.2;
float sG = 1.0 + u_chromaAmount * 0.1;
```

renderer API：

```js
{
  updateMap(imageData) {
    texImage2D(TEXTURE_2D, 0, RGBA, RGBA, UNSIGNED_BYTE, imageData);
  },
  render(video, params) { draw(video, video.videoWidth, video.videoHeight, params); },
  renderBitmap(bitmap, params) { draw(bitmap, bitmap.width, bitmap.height, params); }
}
```

context recovery：

```js
canvas.addEventListener("webglcontextlost", preventAndStop);
canvas.addEventListener("webglcontextrestored", rebuildRenderer);
```

### 运行态证据

`runtime-metrics.json`：

- `canvas: 4`
- `video: 2`

`comparison-ledger.md`：

- video button 同 timing 点击后 local/origin 都从 `Pause` 变为 `Play`
- final audit 中 `canvas:4`、`video:2` 在 desktop/mobile 都保持稳定
- 原文指出 Safari 不会把 live video pixels 交给 SVG filter pipeline，因此 video 走 WebGL

### 行为解读

video player 不是给每个按钮单独套 DOM filter。它用一个 WebGL renderer 读取同一播放视频，按 circle lens 和 bar lens 的 bbox 统一绘制控制区折射。

renderer 有三张关键 texture：

- `u_video`：当前视频帧。
- `u_map`：lens displacement map。
- `u_blurred`：半分辨率 blur pass 输出，用于 lens 内磨砂/可读性。

shader 对 R/G/B 使用不同采样强度形成 chromatic fringe，并根据 luminance 做 specular 加/乘和 adaptive brightness。

### 可复现规则

- live video 不依赖 SVG filter；必须有 WebGL 路径。
- renderer 只处理 lens bbox，bbox 外直接 pass-through video。
- blur texture 可以半分辨率；源视频 texture 和 map texture 要独立更新。
- WebGL context lost/restored 必须能销毁并重建 renderer。

## 9. 本地镜像运行时修复

### 源码位置

- `design/_next/static/chunks/turbopack-5725b656aea77f16.local.js`
- 原始运行时副本：`reference/origin/scripts/turbopack-5725b656aea77f16.js-P2RwbD1kcG`

### 关键源码片段

原始 public chunk：

```js
let t = "https://aave.design/design/_next/";
```

本地镜像 patch：

```js
let t = "/design/_next/";
```

### 运行态证据

`comparison-ledger.md` 记录：

- patch 前：`window.next === false`，`__next_f.length === 28`，React props 缺失。
- patch 后：`window.next === true`，`__next_f.length === 0`，slider/toggle/video handlers 恢复。
- 额外 query cache-bust 会破坏 Turbopack chunk suffix，导致 `feImage:0`、`feDisplacementMap:0`。

### 行为解读

本地镜像必须运行原始 SSR/Flight 页面，而不是 post-hydration DOM snapshot。Turbopack runtime 会从 `document.currentScript.src` 推导 chunk key；本地化时只能改 base path，不能随意追加 query。

### 可复现规则

- 入口 HTML 使用 `reference/origin/server-raw.html` 派生版本。
- runtime 文件名可改名避开缓存，但保留原始 `?dpl=...` query。
- 不用额外 adapter 修视觉症状；先保证 Next hydration 和原始 event layer 成立。

## 10. 验收证据

最终本地镜像的关键验收值：

| 项 | 期望 |
| --- | --- |
| Next hydration | `window.next === true` |
| Flight queue | `__next_f.length === 0` |
| Glass containers | `5` |
| SVG filters | `25` |
| `feImage` | `25` |
| `feDisplacementMap` | `35` |
| Canvas | `4` |
| Video | `2` |
| Desktop interaction | switch、slider、toggle、video 与原站同 timing 一致 |
| Canvas interaction | QR click 后 canvas signature 改变 |
| Map playground | Width drag 改变 `feImage` bbox 和 displacement image data |
| Mobile | `390x844` 无横向溢出，counts 稳定 |
| Offline | article audit external requests 为 `0` |

主要证据文件：

```text
reference/comparison-ledger.md
reference/comparison-4173-mirror-check.json
reference/local-fixed-hero-motion-check.json
reference/local-fixed-mobile-check.json
reference/mobile-compare-768.json
reference/mobile-scroll-compare.json
reference/origin/runtime-metrics.json
storybook/INDEPENDENT_IMPLEMENTATION_AUDIT.md
```

## 11. 研究边界

本研究包不是生产 adapter，也不建议直接复用 Aave 的 minified bundle。正确的使用方式是：

- 用本地镜像作为行为 oracle。
- 用 `AAVE_GLASS_IMPLEMENTATION_NOTES.md` 查源码证据链。
- 用 `WEB_LIQUID_GLASS_SPEC.md` 查可重写规范。
- 用 `comparison-ledger.md` 查已验证行为和已知噪声。

不能作为实现依据：

- 已移除的早期手写近似页。
- 纯 CSS 透明模糊玻璃。
- 未经运行态验证的视觉猜测。
- 直接复制原站 Next/Turbopack bundle 到生产项目。

## 12. 从源码推导出的实现骨架

一个可重写实现至少需要以下模块：

```text
generateDisplacementMap(shape, material, mapSize) -> ImageData | URL
SvgGlassContainer(container, target, lensState, map)
SvgFilterPool(assignments, map, scale, safariRefreshVersion)
WebGlRefractionRenderer(sourceTexture, mapTexture, lensUniforms)
ControlBindings(nativeControl, lensMotion, targetCopy)
RuntimeVerifier(counts, canvasSignature, interactionState)
```

其中：

- `generateDisplacementMap` 来自 DOM 和 WebGL 共同的 map 语义。
- `SvgGlassContainer` 对应 `AaveGlass`。
- `SvgFilterPool` 对应原站 pool slot 和 id versioning。
- `WebGlRefractionRenderer` 对应 video/QR/canvas path。
- `ControlBindings` 对应 switch、slider、toggle 的 native control + visual copy + lens motion。
- `RuntimeVerifier` 对应本文档使用的 counts、bbox、pixel signature 和 interaction audit。
