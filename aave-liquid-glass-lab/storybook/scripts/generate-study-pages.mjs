import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import beautify from 'js-beautify';
import { parse, serializeOuter } from 'parse5';
import { codeToHtml, createCssVariablesTheme } from 'shiki';

const storybookRoot = resolve(import.meta.dirname, '..');
const labRoot = resolve(storybookRoot, '..');
const templatePath = resolve(labRoot, 'design/building-glass-for-the-web/index.html');
const scriptsRoot = resolve(labRoot, 'reference/origin/scripts');
const generatedRoot = resolve(storybookRoot, 'src/generated');
const sourceTheme = createCssVariablesTheme({
  name: 'aave-source',
  variablePrefix: '--syntax-'
});

const cases = {
  overview: {
    title: 'Web Liquid Glass：原理与实现',
    summary: '从 Aave 的 Web Liquid Glass 实现出发，理解真实 DOM、canvas 与 video 表面如何产生跨浏览器折射。',
    implementation: '封面使用原始 AaveGlassPlayground 模块。组件内容由 SVG filter 处理，canvas 与 video 则由同一套镜片几何和 displacement map 驱动 WebGL。',
    originCase: 'hero',
    target: { type: 'glass', index: 0 },
    metrics: [
      { label: '首屏 glass container', value: '764 × 368 px' },
      { label: 'SVG filter pool', value: '5 filters / 5 feImage / 7 displacement maps' },
      { label: '核心输入', value: 'generated displacement map' }
    ],
    rules: [
      '页面内容先正常绘制，镜片只位移自己覆盖区域内的像素。',
      'DOM、canvas 与 video 共用镜片几何和 displacement map，而不是依赖 backdrop-filter。'
    ],
    browser: '现代 Chromium、Safari 与 Firefox 使用同一最终原理；Safari 的 filter refresh、源图尺寸和 video surface 需要单独约束。',
    sources: [
      {
        chunk: '504982d42d3368e6.js',
        anchor: 'AaveGlass · SVG 滤镜池',
        needle: '(0,t.jsx)("feDisplacementMap",{ref:e=>{tb.current[n].feDispEl=e}',
        startNeedle: '(0,t.jsxs)("filter",{ref:e=>{tb.current[n].filterEl=e}',
        endNeedle: ',tW&&(0,t.jsx)("rect"',
        callExpression: true,
        researchComments: [
          '每个 refraction target 使用独立 filter slot，避免共享可变滤镜节点。',
          'feImage 载入 displacement map，R/G 通道分别驱动 X/Y 位移。'
        ],
        readableReplacements: [
          ['(0,t.jsxs)', 'jsxRuntime.jsxs'],
          ['(0,t.jsx)', 'jsxRuntime.jsx'],
          ['r.default.Fragment', 'React.Fragment']
        ]
      }
    ]
  },
  hero: {
    title: 'Hero Glass',
    summary: '圆形镜片在动态背景和 Aave 图标上移动，展示 live DOM 的 SVG 折射路径。',
    implementation: 'AaveGlass 直接过滤已经渲染的内容层。镜片 geometry 生成 PNG map，红绿通道进入 feDisplacementMap，蓝通道参与高光和边缘计算。',
    originCase: 'hero',
    target: { type: 'glass', index: 0 },
    metrics: [
      { label: '镜片容器', value: '764 × 368 px' },
      { label: '滤镜结构', value: 'base + 4 target slots' },
      { label: '颜色路径', value: 'RGB displacement / chroma' }
    ],
    rules: [
      '镜片移动只更新 filter region 与 lens 坐标，不重建页面内容。',
      '形状、depth、curvature 或 splay 改变时才重新生成 map。'
    ],
    browser: 'filter region 必须贴合镜片与 bleed；过大的 SourceGraphic 会触发 Safari 的 SVG filter 上限。',
    sources: [
      {
        chunk: '504982d42d3368e6.js',
        anchor: 'AaveGlass · SVG 位移滤镜节点',
        needle: '(0,t.jsx)("feDisplacementMap",{ref:e=>{tb.current[n].feDispEl=e}',
        startNeedle: '(0,t.jsxs)("filter",{ref:e=>{tb.current[n].filterEl=e}',
        endNeedle: ',tW&&(0,t.jsx)("rect"',
        callExpression: true,
        researchComments: [
          'filter region 只覆盖镜片与 bleed，避免处理整块 SourceGraphic。',
          'map 外保持中性灰，因此镜片外的像素不会发生位移。'
        ],
        readableReplacements: [
          ['(0,t.jsxs)', 'jsxRuntime.jsxs'],
          ['(0,t.jsx)', 'jsxRuntime.jsx'],
          ['r.default.Fragment', 'React.Fragment']
        ]
      }
    ]
  },
  switch: {
    title: 'Switch',
    summary: '开关 thumb 是可按住、拖动和释放的玻璃镜片；真正被折射的是同步的 track fill copy。',
    implementation: '原始组件保留 native checkbox，使用 Motion value 驱动 lens 位置、尺寸、tint、target scale 与 rubber overshoot。按住后进入扩张状态，释放后回弹。',
    originCase: 'switch',
    target: { type: 'glass', index: 1 },
    metrics: [
      { label: '真实 track', value: '74 × 28 px' },
      { label: 'glass container', value: '116 × 70 px; margin −21 px' },
      { label: 'thumb lens', value: 'half 22 × 11 px; radius 11 px' }
    ],
    rules: [
      'checkbox 是可访问性和键盘状态的真实来源。',
      'fill copy 是 refraction target；track 本体保持正常渲染。',
      '拖动改变 progress 与 filter region，不重建 displacement map。'
    ],
    browser: '浅色主题使用 specularDark；Safari 与其他浏览器共享 map，但 filter refresh 采用原始 filter ID 更新路径。',
    sources: [
      {
        chunk: '45f52371f14d4928.js',
        anchor: 'GlassSwitch · 镜片几何与渲染参数',
        needle: 'lensW:90,lensH:60,borderRadius:30,mapSize:256',
        startNeedle: 'x={lensW:90,lensH:60',
        endNeedle: ',C={brightness:.12',
        readablePrefix: 'const defaultLens = ',
        removePrefix: 'x=',
        researchComments: [
          '控件尺寸不变时复用这张镜片 map；拖动只更新镜片位置。',
          'mapSize 决定位移贴图精度，depth 与 chromaAmount 控制折射和色散。'
        ]
      },
      {
        chunk: '36e75939a1c38671.js',
        anchor: 'GlassSwitch · 控件状态与镜片绑定',
        needle: 'useControls)("Glass Switch"',
        startNeedle: 'function E(){let{resolvedTheme:e}',
        endNeedle: 'let A=({lensMap:e})',
        researchComments: [
          'native checkbox 保留可访问语义和键盘状态，Motion 值只负责视觉。',
          '按下、拖动和释放共同驱动 lens 与同步的 track fill copy。'
        ],
        readableReplacements: [
          ['function E()', 'function GlassSwitchDemo()'],
          ['(0,t.jsx)(j.ComponentStage', 'jsxRuntime.jsx(ComponentStage'],
          ['(0,t.jsx)(M,', 'jsxRuntime.jsx(GlassSwitch,']
        ]
      }
    ]
  },
  slider: {
    title: 'Slider',
    summary: '滑块镜片沿着真实 range 轨道移动，折射同步 fill，并保留原生 range 输入语义。',
    implementation: '原始实现把 native input 与自定义轨道双向同步。镜片位置随 thumb 平移，map 固定复用；只有按住、形变或尺寸更新才会生成新 map。',
    originCase: 'slider',
    target: { type: 'glass', index: 2 },
    metrics: [
      { label: '真实 track', value: '240 × 6 px' },
      { label: 'glass container', value: '290 × 72 px; margin −25 px' },
      { label: 'thumb lens', value: '44 × 22 px' }
    ],
    rules: [
      'native input 的 value 是唯一数值来源。',
      '镜片使用较轻的 refraction scale，避免 fill 和读数失去可读性。',
      '移动轨道位置不重新生成 map。'
    ],
    browser: 'Safari 对纵向 displacement 的缩放有独立参数；原组件在 Safari 使用更高的 scaleY。',
    sources: [
      {
        chunk: '45f52371f14d4928.js',
        anchor: 'GlassRangeSlider · 镜片几何与渲染参数',
        needle: 'lensW:90,lensH:60,borderRadius:30,mapSize:256,depth:2,chromaAmount:.65',
        startNeedle: 'C={lensW:90,lensH:60',
        endNeedle: ',M={dark:{scaleX:.133',
        readablePrefix: 'const defaultLens = ',
        removePrefix: 'C=',
        researchComments: [
          'Slider 复用固定镜片几何，并降低位移强度以保持轨道可读。',
          '只有镜片形状变化才重建 map，沿轨道移动只更新 filter region。'
        ]
      },
      {
        chunk: '36e75939a1c38671.js',
        anchor: 'GlassRangeSlider · 原生 range 同步',
        needle: 'useControls)("Glass Range Slider"',
        startNeedle: 'function E(){let{resolvedTheme:e}',
        endNeedle: 'let A=({lensMap:e})',
        researchComments: [
          'native range 是数值真源，自定义轨道、fill 和镜片都从 value 派生。',
          '拖动时只同步 progress 与镜片位置，不重复生成 displacement map。'
        ],
        readableReplacements: [
          ['function E()', 'function GlassRangeSliderDemo()'],
          ['(0,t.jsx)(j.ComponentStage', 'jsxRuntime.jsx(ComponentStage'],
          ['(0,t.jsx)(M,', 'jsxRuntime.jsx(GlassRangeSlider,']
        ]
      }
    ]
  },
  toggle: {
    title: 'Segmented Toggle / Tab 药丸',
    summary: '选中态是一层被镜片折射的完整选项副本，在选项间以 spring 过渡。',
    implementation: '原始 ToggleGroup 保留可操作按钮；另一层 overlay 与真实选项同构并作为 refraction target。镜片的 x、宽度与圆角跟随当前选项。',
    originCase: 'toggle',
    target: { type: 'glass', index: 3 },
    metrics: [
      { label: 'filter wrapper', value: 'padding 80 × 40 px; negative margin' },
      { label: '目标层', value: '完整 ToggleGroup overlay' },
      { label: '移动方式', value: 'spring selection indicator' }
    ],
    rules: [
      '真实按钮接收点击、键盘与 roving focus。',
      'overlay 永远不接收指针事件。',
      '镜片折射 highlighted copy，而不是模糊整个控件。'
    ],
    browser: '宽度变化属于镜片形状变化，会触发 map 更新；纯 x 位移只更新 filter region。',
    sources: [
      {
        chunk: '45f52371f14d4928.js',
        anchor: 'ToggleGroup · Overlay 折射目标',
        needle: 'className:`${P.default.toggleGroup} ${P.default.toggleGroupOverlay}`',
        startNeedle: '(0,t.jsx)("div",{ref:y,children:(0,t.jsx)(O.AaveGlass',
        endNeedle: ';var V=e.i(39437)',
        callExpression: true,
        researchComments: [
          '真实按钮负责交互；overlay 是不接收指针事件的折射目标副本。',
          '选中项的位置与宽度同时驱动镜片的 x、尺寸和圆角。'
        ],
        readableReplacements: [
          ['(0,t.jsxs)', 'jsxRuntime.jsxs'],
          ['(0,t.jsx)', 'jsxRuntime.jsx'],
          ['O.AaveGlass', 'AaveGlass'],
          ['P.default.', 'styles.']
        ]
      },
      {
        chunk: '36e75939a1c38671.js',
        anchor: 'ToggleGroup · 控制参数与镜片尺寸',
        needle: 'useControls)("Glass Toggle Group"',
        startNeedle: 'c=(0,T.useControls)("Glass Toggle Group"',
        endNeedle: ',y=(0,r.useMemo)(()=>P.slice(0,m),[m])',
        removePrefix: 'c=',
        readablePrefix: 'const controls = ',
        researchComments: [
          '调用层只提供选项与镜片参数，AaveGlass core 不感知具体业务标签。',
          '选项数量变化会重新测量布局，纯选中态切换使用 spring 移动。'
        ],
        readableReplacements: [
          ['(0,T.useControls)', 'useControls'],
          ['c.', 'controls.']
        ]
      }
    ]
  },
  qr: {
    title: 'QR Code / Canvas',
    summary: '二维码表面没有可供 SVG filter 处理的 live DOM，因此点击动画使用 WebGL texture 路径。',
    implementation: '二维码先绘制到 canvas，再将 source texture、map texture 与 blur texture 交给 WebGL。点击只改变动画状态和镜片 uniforms，canvas 输出随之更新。',
    originCase: 'qr',
    target: { type: 'class', value: '___iSlRq__container' },
    metrics: [
      { label: '表面类型', value: 'canvas / WebGL' },
      { label: '输入纹理', value: 'source + map + optional blur' },
      { label: '触发方式', value: '点击 Aave logo' }
    ],
    rules: [
      'canvas 使用 device-pixel-ratio 尺寸，CSS 尺寸只负责展示。',
      '同一 displacement map 的通道含义与 DOM 路径相同。',
      '点击后 renderer 更新 texture 与 lens uniform。'
    ],
    browser: 'canvas 重绘和 WebGL 输出必须同时核验；不能用 SVG filter 代替 canvas 表面的折射。',
    details: [
      {
        title: 'Texture 生命周期',
        body: 'source canvas 在二维码内容变化时更新；map texture 只在镜片几何变化时重建。点击动画只推进 uniforms 和输出帧，避免重复上传不变资源。'
      },
      {
        title: 'DPR 与 resize',
        body: 'CSS 尺寸负责布局，drawing buffer 使用 devicePixelRatio。任何 resize 都必须同步 canvas width/height、viewport 与 lens 坐标，否则折射边界会偏移。'
      },
      {
        title: '点击动画',
        body: '点击 Logo 后镜片 geometry、旋转和 splash 状态按原始 Motion value 演进。验收不能只检查 canvas 存在，还要比较动画前后的 pixel signature。'
      }
    ],
    sources: [
      {
        chunk: 'fc9f28cb893506e5.js',
        anchor: 'QR WebGL Renderer · 源纹理与位移纹理',
        needle: 'uniform sampler2D u_displacement',
        language: 'glsl',
        templateLiteral: true,
        researchComments: [
          'u_source 保存 QR 内容，u_displacement 保存镜片位移数据。',
          '点击动画只更新 uniforms；不变的 source/map texture 不应逐帧重复上传。'
        ]
      }
    ]
  },
  video: {
    title: 'Video Controls',
    summary: '多个控件镜片从同一个播放中的 video texture 读取像素，并在 WebGL 中独立折射。',
    implementation: '原始 renderer 计算 circle lens 与 rounded bar lens 的紧凑 bbox，采样 source、map 和 blurred texture，再加入 RGB chroma、specular 与 adaptive brightness。',
    originCase: 'video',
    target: { type: 'class', value: '__cMuLUa__player' },
    metrics: [
      { label: 'source', value: '480 × 270 video texture' },
      { label: '镜片', value: '3 circle controls + 1 progress bar' },
      { label: '输出', value: 'single WebGL canvas renderer' }
    ],
    rules: [
      '每帧从同一 video texture 更新绘制。',
      'circle 与 bar lens 都以 bbox pixel space 计算 SDF。',
      '播放、暂停、跳转和进度条保持原生交互语义。'
    ],
    browser: 'Safari 不会把 live video 交给 SVG filter；WebGL 是视频表面的正式路径，不是降级方案。',
    details: [
      {
        title: '共享纹理与多镜片',
        body: '一个 renderer 持有 source、map 与 blur textures。播放、后退、前进三个圆形镜片和进度条 bar lens 共享 video source，但各自保留 bbox、scale 和曲率参数。'
      },
      {
        title: '帧更新与性能',
        body: '播放期间通过 requestAnimationFrame 更新 video texture；暂停时只在交互或布局变化后重绘。tight bbox 限制片元处理范围，避免全画面重复折射。'
      },
      {
        title: 'Safari、autoplay 与 CORS',
        body: 'Safari 的 live video 不进入 SVG filter pipeline，因此必须使用 WebGL。视频保持 muted/playsInline 约束；跨域视频必须提供允许纹理采样的 CORS 响应。'
      }
    ],
    sources: [
      {
        chunk: '3963356e871bc455.js',
        anchor: 'Video Shader · 边界框、圆形/条形镜片与 RGB 色散',
        needle: 'uniform vec3 u_circles',
        language: 'glsl',
        templateLiteral: true,
        researchComments: [
          '所有控件镜片共享同一 video source texture。',
          'circle 与 bar lens 先计算 tight bbox，再执行位移、模糊与 RGB 色散采样。'
        ]
      }
    ]
  },
  'how-it-works': {
    title: 'How It Works / Displacement Map',
    summary: '左侧是被折射的真实内容，右侧是驱动它的 generated displacement map；页面内调节器直接控制这一对输出。',
    implementation: 'map 由 lens geometry 的 signed-distance field、dome curve、edge falloff、splay 与 specular 参数生成。R 控制水平位移，G 控制垂直位移，B 记录高光信息。',
    originCase: 'how-it-works',
    target: { type: 'glass', index: 4 },
    metrics: [
      { label: 'default lens', value: '80 × 80 half-size; radius 80' },
      { label: 'map', value: '512 px generated PNG' },
      { label: '调节范围', value: 'width / height / radius / scale / depth / curvature / splay' }
    ],
    rules: [
      '形状变化时重新生成 map，位置变化只改变 filter region。',
      'map 外部维持中性灰，确保镜片外像素不移动。',
      '左右预览与页面内控件共享同一运行时。'
    ],
    browser: 'Safari 需要避免过大的 SVG SourceGraphic，并在 map 更新时刷新 filter 标识，防止缓存旧输出。',
    sources: [
      {
        chunk: 'b7d76adec832d628.js',
        anchor: 'AaveGlassPlayground · 交互参数范围',
        needle: 'lensW:[80,10,230,1]',
        startNeedle: 'R=(0,o.useControls)("Glass Playground"',
        endNeedle: ',A=(0,l.useMotionValue)(.5)',
        removePrefix: 'R=',
        readablePrefix: 'const controls = ',
        researchComments: [
          '面板参数直接控制 lens geometry；形状变化会重新生成 map。',
          '镜片位置使用 Motion value，纯移动不会触发 map 重建。'
        ],
        readableReplacements: [
          ['(0,o.useControls)', 'useControls'],
          ['R.', 'controls.']
        ]
      },
      {
        chunk: '25ef42f3c325a091.js',
        anchor: 'DisplacementMapPlayground · 页面内 Range 控件',
        needle: 'RangeSlider,{label:"Width",value:g,min:20,max:120',
        startNeedle: '(0,t.jsxs)("div",{className:o.default.controls',
        endNeedle: ';e.s(["DisplacementMapPlayground"',
        callExpression: true,
        researchComments: [
          'RangeSlider 只写入参数状态；折射结果与 map 预览读取同一组值。',
          'min/max 与原文实验面板一致，便于复现默认镜片形状。'
        ],
        readableReplacements: [
          ['(0,t.jsxs)', 'jsxRuntime.jsxs'],
          ['(0,t.jsx)', 'jsxRuntime.jsx'],
          ['u.RangeSlider', 'RangeSlider'],
          ['o.default.controls', 'styles.controls']
        ]
      },
      {
        chunk: '504982d42d3368e6.js',
        anchor: 'Lens Map · SVG 位移滤镜',
        needle: '(0,t.jsx)("feDisplacementMap",{ref:e=>{tb.current[n].feDispEl=e}',
        startNeedle: '(0,t.jsxs)("filter",{ref:e=>{tb.current[n].filterEl=e}',
        endNeedle: ',tW&&(0,t.jsx)("rect"',
        callExpression: true,
        researchComments: [
          'feImage 注入生成的 map，多个 feDisplacementMap 分别处理颜色通道。',
          'map 外的中性灰保持零位移，边缘信息用于高光与色散。'
        ],
        readableReplacements: [
          ['(0,t.jsxs)', 'jsxRuntime.jsxs'],
          ['(0,t.jsx)', 'jsxRuntime.jsx'],
          ['r.default.Fragment', 'React.Fragment']
        ]
      }
    ]
  }
};

const sourceFiles = {
  '504982d42d3368e6.js': '504982d42d3368e6.js-P2RwbD1kcG',
  '3963356e871bc455.js': '3963356e871bc455.js-P2RwbD1kcG',
  '45f52371f14d4928.js': '45f52371f14d4928.js-P2RwbD1kcG',
  '36e75939a1c38671.js': '36e75939a1c38671.js-P2RwbD1kcG',
  '25ef42f3c325a091.js': '25ef42f3c325a091.js-P2RwbD1kcG',
  'b7d76adec832d628.js': 'b7d76adec832d628.js-P2RwbD1kcG',
  'fc9f28cb893506e5.js': 'fc9f28cb893506e5.js-P2RwbD1kcG'
};

const moduleEvidence = [
  ['b7d76adec832d628.js', 'e.s(["AaveGlassPlayground"'],
  ['45f52371f14d4928.js', ',2267,e=>'],
  ['45f52371f14d4928.js', ',94743,e=>'],
  ['45f52371f14d4928.js', ',2606,e=>'],
  ['fc9f28cb893506e5.js', ',37151,e=>'],
  ['3963356e871bc455.js', ',33360,e=>'],
  ['25ef42f3c325a091.js', 'e.s(["DisplacementMapPlayground"']
];

const attr = (node, name) => node.attrs?.find(item => item.name === name)?.value;
const hasAttr = (node, name) => node.attrs?.some(item => item.name === name) ?? false;
const className = node => attr(node, 'class') ?? '';
const elementChildren = node => (node.childNodes ?? []).filter(child => child.tagName);

function walk(node, callback) {
  callback(node);
  for (const child of node.childNodes ?? []) walk(child, callback);
}

function findAll(node, predicate) {
  const matches = [];
  walk(node, candidate => {
    if (predicate(candidate)) matches.push(candidate);
  });
  return matches;
}

function findFirst(node, predicate) {
  let match;
  walk(node, candidate => {
    if (!match && predicate(candidate)) match = candidate;
  });
  return match;
}

function directChild(article, element) {
  let current = element;
  while (current && current.parentNode !== article) current = current.parentNode;
  return current?.parentNode === article ? current : undefined;
}

function containsId(node, id) {
  return attr(node, 'id') === id || Boolean(findFirst(node, candidate => attr(candidate, 'id') === id));
}

function targetFor(article, entry) {
  if (entry.target.type === 'glass') {
    return findAll(article, node => hasAttr(node, 'data-aave-glass-container'))[entry.target.index];
  }
  return findFirst(article, node => className(node).includes(entry.target.value));
}

function rangeFor(article, target, slug) {
  const children = elementChildren(article);
  const indexForId = id => children.findIndex(child => containsId(child, id));

  if (slug === 'overview' || slug === 'hero') {
    return [0, Math.max(0, indexForId('the-challenge-with-the-web') - 1)];
  }
  if (slug === 'how-it-works') {
    return [
      Math.max(0, indexForId('how-it-works')),
      Math.max(0, indexForId('making-it-work-everywhere') - 1)
    ];
  }

  const selected = directChild(article, target);
  const index = children.indexOf(selected);
  if (index < 0) throw new Error(`Unable to map ${slug} target to an article block`);

  let start = index;
  let end = children.length - 1;
  const isDivider = child => className(child).includes('divider');

  if (slug === 'toggle') {
    const codeIndex = children.findIndex((child, childIndex) => childIndex >= index && className(child).includes('codeBlock'));
    return [start, codeIndex >= index ? codeIndex : index];
  }
  if (slug === 'qr') {
    start = Math.max(0, index - 1);
  } else {
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      if (isDivider(children[cursor])) {
        start = cursor + 1;
        break;
      }
    }
  }
  for (let cursor = index; cursor < children.length; cursor += 1) {
    if (isDivider(children[cursor])) {
      end = cursor - 1;
      break;
    }
  }
  return [start, end];
}

function extractOriginalHtml(article, entry, slug) {
  const target = targetFor(article, entry);
  if (!target) throw new Error(`Origin target not found for ${slug}`);
  const selected = directChild(article, target);
  const children = elementChildren(article);
  const [start, end] = rangeFor(article, target, slug);

  return children
    .slice(start, end + 1)
    .filter(node => {
      if (node === selected) return false;
      if (className(node).includes('divider')) return false;
      if (node.tagName === 'h1' || node.tagName === 'h2') return false;
      return true;
    })
    .map(node => serializeOuter(node))
    .join('');
}

function matchingParenthesis(sourceText, openIndex, anchor) {
  let depth = 0;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let cursor = openIndex; cursor < sourceText.length; cursor += 1) {
    const char = sourceText[cursor];
    const next = sourceText[cursor + 1];

    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        cursor += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = '';
      }
      continue;
    }
    if (char === '/' && next === '/') {
      lineComment = true;
      cursor += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      blockComment = true;
      cursor += 1;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '(') depth += 1;
    if (char === ')') {
      depth -= 1;
      if (depth === 0) return cursor;
    }
  }

  throw new Error(`Call boundary not found: ${anchor}`);
}

function sourceExcerpt(sourceText, source) {
  const index = sourceText.indexOf(source.needle);
  if (index < 0) throw new Error(`Source marker not found: ${source.needle}`);

  if (source.templateLiteral) {
    const start = sourceText.lastIndexOf('`', index);
    const end = sourceText.indexOf('`', index);
    if (start < 0 || end < 0) {
      throw new Error(`Template literal boundary not found: ${source.anchor}`);
    }
    return sourceText.slice(start + 1, end).trim();
  }

  const start = source.startNeedle
    ? sourceText.lastIndexOf(source.startNeedle, index)
    : index;
  if (start < 0) throw new Error(`Source start boundary not found: ${source.anchor}`);

  if (source.callExpression) {
    const groupedCall = sourceText.indexOf(')(', start);
    if (groupedCall < 0 || groupedCall > index) {
      throw new Error(`Call start not found: ${source.anchor}`);
    }
    const end = matchingParenthesis(sourceText, groupedCall + 1, source.anchor);
    return sourceText.slice(start, end + 1).trim();
  }

  const end = source.endNeedle
    ? sourceText.indexOf(source.endNeedle, Math.max(index, start + source.startNeedle.length))
    : Math.min(sourceText.length, index + 2200);
  if (end < 0) throw new Error(`Source end boundary not found: ${source.anchor}`);

  return sourceText.slice(start, end).trim();
}

function normalizeReadableSource(code, source) {
  let readable = code;
  if (source.removePrefix) {
    if (!readable.startsWith(source.removePrefix)) {
      throw new Error(`Readable prefix target not found: ${source.anchor}`);
    }
    readable = `${source.readablePrefix ?? ''}${readable.slice(source.removePrefix.length)}`;
  }
  for (const [needle, replacement] of source.readableReplacements ?? []) {
    readable = readable.split(needle).join(replacement);
  }
  readable = readable
    .split('returnjsxRuntime.')
    .join('return jsxRuntime.')
    .replace(/(?<![!\w])!0(?!\w)/g, 'true')
    .replace(/(?<![!\w])!1(?!\w)/g, 'false');
  return readable;
}

function formatSourceExcerpt(code, language) {
  if (language === 'glsl') {
    const lines = code.trim().split('\n');
    const continuationIndents = lines
      .slice(1)
      .filter(line => line.trim())
      .map(line => line.match(/^ */)?.[0].length ?? 0);
    const indent = continuationIndents.length ? Math.min(...continuationIndents) : 0;
    return lines
      .map((line, index) => (index > 0 && indent > 0 ? line.slice(Math.min(indent, line.length)) : line))
      .join('\n');
  }

  return beautify.js(code, {
    brace_style: 'collapse',
    end_with_newline: false,
    indent_char: ' ',
    indent_size: 2,
    max_preserve_newlines: 2,
    preserve_newlines: false,
    wrap_line_length: 92
  });
}

function addResearchComments(code, source, language) {
  if (!source.researchComments?.length) return code;

  const comments = source.researchComments
    .map(comment => `// 研究注释：${comment}`)
    .join('\n');

  if (language === 'glsl' && code.startsWith('#version')) {
    const lineBreak = code.indexOf('\n');
    if (lineBreak >= 0) {
      return `${code.slice(0, lineBreak)}\n${comments}\n\n${code.slice(lineBreak + 1)}`;
    }
  }

  return `${comments}\n\n${code}`;
}

const template = await readFile(templatePath, 'utf8');
const document = parse(template);
const article = findFirst(document, node => node.tagName === 'article');
if (!article) throw new Error('Origin article was not found');

const stylesheetUrls = [...new Set(
  findAll(document, node => node.tagName === 'link' && attr(node, 'rel') === 'stylesheet')
    .map(node => attr(node, 'href'))
    .filter(url => url?.startsWith('/design/_next/static/chunks/'))
)];

const allScriptUrls = [...new Set(
  findAll(document, node => node.tagName === 'script')
    .map(node => attr(node, 'src'))
    .filter(url => url?.startsWith('/design/_next/static/chunks/'))
)];

const runtimeUrl = allScriptUrls.find(url => url.includes('turbopack-') && url.includes('.local.js'));
if (!runtimeUrl) throw new Error('Local Turbopack runtime was not found');
const scriptUrls = allScriptUrls.filter(url => url !== runtimeUrl);

const sourceCache = {};
for (const [displayName, fileName] of Object.entries(sourceFiles)) {
  sourceCache[displayName] = await readFile(resolve(scriptsRoot, fileName), 'utf8');
}

for (const [chunk, marker] of moduleEvidence) {
  if (!sourceCache[chunk]?.includes(marker)) {
    throw new Error(`Required origin module marker is missing: ${chunk} · ${marker}`);
  }
}

const generatedCases = {};
for (const [slug, entry] of Object.entries(cases)) {
  const sources = await Promise.all(
    entry.sources.map(async source => {
      const language = source.language ?? 'js';
      const code = sourceExcerpt(sourceCache[source.chunk], source);
      const readableCode = formatSourceExcerpt(normalizeReadableSource(code, source), language);
      const formattedCode = addResearchComments(readableCode, source, language);
      return {
        ...source,
        language,
        code,
        formattedCode,
        highlightedHtml: await codeToHtml(formattedCode, {
          lang: language,
          theme: sourceTheme
        })
      };
    })
  );

  generatedCases[slug] = {
    ...entry,
    originalHtml: extractOriginalHtml(article, entry, slug),
    originArticleClassName: className(article),
    sources
  };
  delete generatedCases[slug].target;
}

const manifest = {
  runtimeUrl,
  scriptUrls,
  stylesheetUrls,
  blockedRuntimeModuleId: 95395,
  bridgeModuleId: 9900991,
  modules: {
    jsxRuntime: 72841,
    reactDomClient: 91083,
    themeProvider: 42092,
    demoContainer: 16908,
    hero: 15375,
    switch: 2267,
    slider: 94743,
    toggle: 2606,
    qr: 37151,
    video: 33360,
    howItWorks: 93248
  }
};

await mkdir(generatedRoot, { recursive: true });
await writeFile(resolve(generatedRoot, 'study-content.json'), `${JSON.stringify(generatedCases, null, 2)}\n`);
await writeFile(resolve(generatedRoot, 'origin-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Generated ${Object.keys(generatedCases).length} study entries and the origin module manifest.`);
