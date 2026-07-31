import type { StudyCaseId } from '../origin/types';

export interface GuideChapter {
  title: string;
  summary: string;
  question: string;
  principle: string[];
  buildSteps: Array<{ title: string; body: string }>;
  reasons: Array<{ title: string; body: string }>;
  pitfalls: string[];
  validation: string[];
  guideSources: string[];
  primarySource: string;
}

export const guideChapters: Record<StudyCaseId, GuideChapter> = {
  overview: {
    title: 'Web Liquid Glass：原理与实现',
    summary: '从镜片几何、位移贴图到 DOM/SVG 与 WebGL，建立一套可实现、可测量、可复用的 Web 折射系统。',
    question: '如何让同一种玻璃材料同时作用于 DOM、Canvas 与 Video，而不依赖单一浏览器的背景抓取能力？',
    principle: [
      '先正常绘制内容，再用 generated displacement map 描述镜片覆盖区域内每个像素的采样偏移。',
      'DOM 使用 SVG filter 消费这张 map；Canvas 与 Video 把 source、map 和 blur 送进 WebGL shader。',
      '镜片移动只更新坐标或 filter region；几何变化才重新生成 map。'
    ],
    buildSteps: [
      { title: '定义镜片', body: '用半宽、半高、圆角、depth、dome 与 splay 描述几何和材料。' },
      { title: '生成 Map', body: 'SDF 决定边界，R/G 通道写入水平和垂直位移，B 通道保留高光信息。' },
      { title: '连接表面', body: 'DOM 建立 SVG filter；Canvas/Video 建立 texture 与 shader 管线。' },
      { title: '绑定交互', body: '输入状态保持原生语义，镜片只订阅派生的坐标、尺寸和视觉状态。' }
    ],
    reasons: [
      { title: '为什么不用 backdrop-filter', body: '它能模糊背景，但不能稳定表达自定义曲面位移，而且不同浏览器支持路径不一致。' },
      { title: '为什么 Map 是核心契约', body: '它把镜片几何从具体渲染表面中解耦，同一份数据可被 SVG 和 WebGL 消费。' }
    ],
    pitfalls: ['把玻璃做成背景截图', '镜片每移动一像素就重建 map', '让视觉 overlay 接管输入状态'],
    validation: ['map 外部为中性灰', '交互后状态和像素签名变化', 'Safari 与 Chromium 使用同一几何输入'],
    guideSources: ['lens-map', 'svg-controller'],
    primarySource: 'lens-map'
  },
  hero: {
    title: 'Hero Glass',
    summary: '用一个持续移动的圆形镜片说明最小 DOM/SVG 折射链路。',
    question: '如何让镜片在动态内容上移动，同时保持背景、图标和色散都实时更新？',
    principle: [
      '背景与图标是正常 DOM，不预先截图。',
      'filter region 跟随镜片坐标，map 在圆形几何不变时复用。',
      '视觉 shell 只负责边框、tint 和阴影，真正的像素弯折发生在 refraction target。'
    ],
    buildSteps: [
      { title: '准备 Target', body: '把需要被折射的背景和图标放进同一个 data-refraction-target。' },
      { title: '创建圆形 Map', body: '令 lensW = lensH，borderRadius 等于半径，并启用 dome 与 edge falloff。' },
      { title: '移动 Region', body: '动画只写 position；控制器更新 filter、feImage 和 shell 的 x/y。' }
    ],
    reasons: [
      { title: '为什么 target 与 shell 分层', body: 'shell 不应该再次过滤自己的高光，否则边缘会重复折射并产生重影。' },
      { title: '为什么保持正圆', body: '镜片的 CSS 尺寸、map 尺寸和 filter region 必须共享同一宽高比。' }
    ],
    pitfalls: ['用 transform 非等比缩放镜片', '把 filter 挂到整个页面', '动画时反复创建 SVG 节点'],
    validation: ['lens 始终为正圆', '移动中 map signature 不变', '背景网格在镜片内连续弯折'],
    guideSources: ['hero-example', 'svg-controller', 'react-adapter'],
    primarySource: 'hero-example'
  },
  switch: {
    title: 'Switch',
    summary: '把 native checkbox 作为状态真源，把 thumb、track fill copy 与镜片作为派生视觉。',
    question: '如何同时保留键盘和表单语义，又获得按住、拖动、释放时的玻璃形变？',
    principle: [
      'checkbox 决定 checked；玻璃层不保存第二份业务状态。',
      'track fill copy 是 refraction target，真实 track 继续正常渲染。',
      'checked 改变位置，hold 改变几何；只有 hold 引起的形状变化需要新 map。'
    ],
    buildSteps: [
      { title: '保留 Native Input', body: '透明 input 覆盖命中区，负责 focus、键盘、表单和值变化。' },
      { title: '派生 Progress', body: 'checked 映射为 0/1，再用 spring 驱动 thumb 与 lens 的 x。' },
      { title: '处理 Hold', body: 'pointer down 时扩大 lensW/lensH，release 后恢复，形成橡胶感。' }
    ],
    reasons: [
      { title: '为什么不直接做 div 开关', body: 'native checkbox 已经解决语义、焦点、键盘和表单提交，不需要重新发明。' },
      { title: '为什么 refraction target 是 fill copy', body: '移动的填充高光能在镜片里弯折，track 本体仍保持清晰稳定。' }
    ],
    pitfalls: ['视觉 thumb 抢占 input 指针事件', 'checked 与 Motion state 双向漂移', '拖动时重建 filter pool'],
    validation: ['Space 键可切换', 'checked 与 aria 状态一致', '按住时镜片扩大，释放后回弹'],
    guideSources: ['switch-example', 'react-adapter', 'svg-controller'],
    primarySource: 'switch-example'
  },
  slider: {
    title: 'Slider',
    summary: '让 native range 维持数值语义，glass thumb 只消费 value 派生出的 progress。',
    question: '如何让镜片沿轨道低成本移动，并确保 fill、thumb、键盘步进始终同步？',
    principle: [
      'value 是唯一真源，progress = (value - min) / (max - min)。',
      'fill 宽度、thumb 位置与 filter region 都从 progress 派生。',
      '纯 x 位移复用 map；按住或尺寸变化才更新几何。'
    ],
    buildSteps: [
      { title: '建立轨道', body: '正常绘制 track 与 fill，把透明 native range 放在最上层。' },
      { title: '映射坐标', body: '用 progress 乘以有效轨道长度，并扣除 thumb 半宽。' },
      { title: '同步镜片', body: '把相同坐标交给 SVG controller，避免视觉与输入值错位。' }
    ],
    reasons: [
      { title: '为什么移动不重建 Map', body: 'map 描述局部镜片曲面，与它位于轨道哪一段无关。' },
      { title: '为什么 Safari 需要单独校验', body: '纵向 displacement 与 filter bbox 在 Safari 更容易暴露裁切和缩放误差。' }
    ],
    pitfalls: ['用 CSS left 与 transform 混合两套坐标', '忽略 thumb 宽度', '隐藏 input 后丢失 focus ring'],
    validation: ['方向键可步进', 'fill 终点、thumb 中心和 lens 中心一致', '拖动时 map signature 不变'],
    guideSources: ['slider-example', 'svg-controller'],
    primarySource: 'slider-example'
  },
  toggle: {
    title: 'Segmented Toggle',
    summary: '真实按钮负责选择与焦点，selected overlay 和玻璃药丸负责高亮与折射。',
    question: '如何让不同宽度的选项之间平滑移动，同时不破坏按钮语义和文字可读性？',
    principle: [
      '真实按钮层接收点击和键盘操作。',
      '同构 overlay 作为 refraction target，并设置 pointer-events: none。',
      '选项变化同时更新 lens x 与宽度；仅位置变化时 map 可复用。'
    ],
    buildSteps: [
      { title: '测量选项', body: '读取当前按钮的 offsetLeft 与 offsetWidth，建立镜片目标几何。' },
      { title: '移动 Indicator', body: '用 spring 同步 x、宽度和高亮 overlay。' },
      { title: '响应 Resize', body: '字体或容器宽度变化后重新测量，不能继续使用旧 bbox。' }
    ],
    reasons: [
      { title: '为什么需要 overlay', body: '它提供一份可被折射的选中态内容，同时让真实按钮保持稳定、可点击。' },
      { title: '为什么宽度变化要重建 map', body: '宽度属于镜片几何；继续拉伸旧 map 会改变曲率和圆角。' }
    ],
    pitfalls: ['让 overlay 接收点击', '假设所有选项等宽', '文字换行后不重新测量'],
    validation: ['方向键和点击均能切换', '药丸不超出当前选项', 'resize 后中心和宽度仍匹配'],
    guideSources: ['toggle-example', 'react-adapter'],
    primarySource: 'toggle-example'
  },
  qr: {
    title: 'QR Code / Canvas',
    summary: '二维码点阵直接在 shader 中求值；occupancy、finder eyes、painting 与 lens map 组成独立的 WebGL 管线。',
    question: '如何在不逐帧重画整张二维码的前提下，让点阵、定位眼和五层扩散镜片同时保持清晰与可动画？',
    principle: [
      '二维码矩阵上传为 occupancy texture，普通点阵通过 O(1) texelFetch 判断是否存在。',
      '三个 finder eyes 不进入点阵纹理，而由三层 rounded-rect SDF 在 shader 中解析。',
      '点击复用五个镜片槽；每帧只更新当前 half-size、painting texture 与合成 map。'
    ],
    buildSteps: [
      { title: '编码矩阵', body: '用 QR 编码器生成模块矩阵，移除 finder eyes 与 Logo 保留区后写入 occupancy texture。' },
      { title: '建立解析几何', body: '把三组 finder eyes 表达为九个 rounded-rect SDF，并通过 uniform 控制 hover scale。' },
      { title: '生成镜片 Map', body: '五槽 ring buffer 分别生成透明边界 map，再按当前最大镜片缩放合成。' },
      { title: '运行 Shader', body: 'R/G 解码位移，RGB 使用 2/1/0 的额外色散距离；finder eyes 只接受 16% 位移。' }
    ],
    reasons: [
      { title: '为什么不用 source canvas 截图', body: '点阵查询和 finder-eye SDF 在 GPU 内完成，缩放时不会引入一次额外的位图采样。' },
      { title: '为什么分开 painting scale 与 color', body: '圆点收缩和颜色扩散拥有不同时间曲线，独立纹理允许它们只更新自己的数据。' },
      { title: '为什么限制 DPR', body: 'drawing buffer 使用 1.25 × min(devicePixelRatio, 3)：先用 1.25 倍超采样保持圆点边缘，再把设备 DPR 封顶为 3，防止片元成本无限增长。' }
    ],
    pitfalls: ['每帧重新编码 QR 矩阵', '把 finder eyes 烘焙进低分辨率位图', '只改 CSS width/height 而不更新 drawing buffer'],
    validation: ['occupancy 与 WebGL output 均非空', '点击前后 output signature 改变', '五层镜片结束后正确回收并可再次触发'],
    guideSources: ['qr-scene', 'qr-shader', 'qr-example'],
    primarySource: 'qr-example'
  },
  video: {
    title: 'Video Controls',
    summary: '把 live video frame 作为 source texture，用一个 renderer 处理多个圆形和条形镜片。',
    question: '如何持续更新视频纹理，又不让暂停状态、seek、CORS 或 context loss 破坏折射？',
    principle: [
      '播放中按帧上传 video texture；暂停时只在交互和布局变化后重绘。',
      '圆形按钮和进度条共享 source/blur texture，各自拥有 bbox 和几何。',
      'live video 始终走 WebGL，不把 Safari 当作降级模式。'
    ],
    buildSteps: [
      { title: '准备 Video', body: '设置 muted、playsInline、preload，并确保跨域资源允许纹理采样。' },
      { title: '建立 Renderer', body: '创建 source/map/blur textures 和一组 circle/bar lens。' },
      { title: '同步媒体事件', body: 'play 启动帧循环，pause 停止，seek 后立即重绘。' },
      { title: '释放资源', body: '卸载时取消 RAF、解绑事件并删除 texture/program/buffer。' }
    ],
    reasons: [
      { title: '为什么共用一个 Renderer', body: '多个镜片读取同一视频源，复用 source 与 blur texture 能避免重复上传。' },
      { title: '为什么需要 tight bbox', body: '只在镜片覆盖区域执行复杂片元计算，减少移动设备上的 fill-rate 压力。' }
    ],
    pitfalls: ['暂停后 RAF 仍常驻', '跨域视频污染 texture', 'context 恢复后继续使用旧句柄'],
    validation: ['Play/Pause 状态真实变化', 'seek 后画面与进度同步', '播放前后 canvas signature 不同'],
    guideSources: ['video-example', 'webgl-shader', 'webgl-controller'],
    primarySource: 'video-example'
  },
  'how-it-works': {
    title: 'How It Works / Displacement Map',
    summary: '把折射结果与 map 并排显示，用同一组参数解释每个通道和重建边界。',
    question: '哪些参数改变镜片几何，哪些只改变采样强度，什么时候必须生成新 map？',
    principle: [
      'Width、Height、Radius、Depth、Curvature 与 Splay 改变 map 内容。',
      'Scale 改变 feDisplacementMap 或 shader 的采样强度，不必重建 map。',
      '位置只更新 filter region 或 uniform，map 与 source 都应复用。'
    ],
    buildSteps: [
      { title: '并排输出', body: '左侧运行折射，右侧直接显示同一 LensMapResource。' },
      { title: '暴露参数', body: '用页面内 range 控件更新 geometry/material，而不是 Storybook Controls。' },
      { title: '连接粒子', body: '参数变化从镜片中心发射三个粒子；粒子画布放入同一 refraction target，因此也经过当前 map。' },
      { title: '记录 Signature', body: '每次形状变化比较 map signature，验证位置变化没有误触发重建。' }
    ],
    reasons: [
      { title: '为什么显示 Map', body: '它把不可见的采样方向变成可检查数据，便于定位方向、边界和缓存问题。' },
      { title: '为什么参数要分组', body: 'geometry 决定资源是否失效，render scale 只影响消费阶段；混在一起会造成不必要重建。' }
    ],
    pitfalls: ['把 Scale 当成几何参数', 'map 外不是中性灰', '改变位置后 signature 也变化'],
    validation: ['R/G 方向符合预期', '形状变化 map 同步变化并触发粒子', '位置变化不重建 map'],
    guideSources: ['playground-example', 'lens-map', 'svg-controller'],
    primarySource: 'playground-example'
  }
};
