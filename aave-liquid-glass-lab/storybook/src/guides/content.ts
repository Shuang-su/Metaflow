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
  iterationLessons: Array<{
    symptom: string;
    rootCause: string;
    correction: string;
    guardrail: string;
  }>;
  debugOrder: string[];
  invariants: string[];
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
    iterationLessons: [
      {
        symptom: '外观像半透明卡片，但背景像素没有弯折',
        rootCause: '把 tint、blur、border 与 shadow 当成折射本身，缺少 generated displacement map 和二次采样。',
        correction: '先生成可检查的 R/G displacement map，再分别接入 SVG filter 与 WebGL shader；visual shell 只保留材质表面。',
        guardrail: '验收时必须读取 feImage / feDisplacementMap 或 WebGL map texture，并证明 source 像素签名发生变化。'
      },
      {
        symptom: 'Safari 中基准效果完整，但文档却把 Safari 标成不支持',
        rootCause: '把 Chromium-only 的 SVG backdrop-filter 实验路线误当成最终实现。',
        correction: '浏览器矩阵按最终管线描述：DOM 使用 generated map + SVG displacement，Canvas/Video 使用 WebGL。',
        guardrail: '任何兼容性结论都必须指明“哪条渲染路径”和“哪个具体 API”，不能只写浏览器名称。'
      },
      {
        symptom: '直接运行锁定模块时行为正确，但无法回答代码如何修改',
        rootCause: '把 oracle 当成了独立实现；运行原模块只能证明基准存在，不能证明可读代码等价。',
        correction: '同页分离锁定基准、独立实现和源码证据，并对 DOM、map、几何、交互与像素逐层核验。',
        guardrail: '独立实现目录禁止导入 origin runtime；每个代码块必须来自实际运行的 TypeScript/GLSL 文件。'
      }
    ],
    debugOrder: [
      '先确认业务状态或媒体状态真的改变，再检查视觉层。',
      '读取 lens geometry、container bbox 与 target bbox，排除坐标系和响应式缩放错误。',
      '检查 map 是否非空、中性区是否正确、几何变化时 signature 是否更新。',
      '检查 SVG filter region 或 WebGL uniforms 是否消费了同一份坐标和 map。',
      '最后才调整 tint、border、shadow、blur 与动画曲线。'
    ],
    invariants: [
      '锁定基准用于对照，独立实现用于修改，格式化源码用于解释；三者职责不能混用。',
      '截图只能证明某一帧外观，不能单独证明折射、交互、缓存或跨浏览器等价。',
      '位置变化复用 map；shape/material 变化才使 map cache 失效。'
    ],
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
    iterationLessons: [
      {
        symptom: '镜片看起来是圆形，但折射或模糊区域呈正方形',
        rootCause: 'visual shell 的 border-radius 只裁了表面，filter region、mask 或归一化 blur 仍按正方形 map 处理。',
        correction: '让圆形 SDF、mask、filter bbox 与 shell 共享同一中心和半径，并按 target 宽高分别归一化 blur。',
        guardrail: '同时检查 shell 截图、clip-path、filter bbox 和 feGaussianBlur 的 X/Y 标准差，不能只看边框。'
      },
      {
        symptom: '窄屏下圆形镜片变成椭圆',
        rootCause: '展示容器只缩放了一个轴，或把桌面坐标直接套进响应式尺寸。',
        correction: '固定镜片 aspect-ratio，并由当前 target bbox 重新计算 position 和 filter region。',
        guardrail: '桌面与 390×844 都读取实际宽高，圆形镜片要求 width === height，而不是仅靠视觉判断。'
      },
      {
        symptom: '背景组件静止，只有一个玻璃圆圈在移动',
        rootCause: '使用静态截图或裁切后的副本替代 live DOM，背景自己的动画和状态丢失。',
        correction: '将动态网格和图标作为真实 refraction target，镜片只移动 filter region。',
        guardrail: '基准与独立实现都必须在连续帧中出现背景变化，且镜片移动期间 map signature 保持不变。'
      },
      {
        symptom: '镜片或折射贴片漂到组件外部',
        rootCause: '绝对定位参考了错误祖先，bleed、negative margin 与 host padding 没有组成同一坐标系。',
        correction: '由 glass container 统一管理局部坐标，target、filter region 和 shell 都相对同一 host。',
        guardrail: 'resize、滚动和移动端下逐项读取 container、target、lens bbox，禁止依赖硬编码页面坐标。'
      }
    ],
    debugOrder: [
      '冻结动画，先核对 target、host、lens 的中心与宽高。',
      '显示 map preview，确认圆形边界外为中性位移。',
      '临时关闭 shell，只保留 SVG filter，判断方块来自滤镜还是材质层。',
      '恢复动画并确认只更新 x/y 与 filter bbox，不重建 map。',
      '最后比较桌面、竖屏和主题切换后的逐帧画面。'
    ],
    invariants: [
      '圆形 map、圆形 mask、圆形 shell 和正方形 lens bbox 必须同心同尺寸。',
      'Hero 背景必须是 live target，不能退化为截图、clone overlay 或嵌套 iframe。',
      '动画过程中 filter 节点数和 map signature 保持稳定。'
    ],
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
    iterationLessons: [
      {
        symptom: '切到开启状态后没有绿色填充，镜片仍只折射灰色轨道',
        rootCause: 'refraction target 指向静态 track，而不是与 checked 同步的 fill copy。',
        correction: '真实 track 和专用 fill copy 同时由 checkbox 状态派生，玻璃只折射 fill copy。',
        guardrail: '分别检查 off/on 两态的真实 fill、target copy、checkbox.checked 与 lens position。'
      },
      {
        symptom: '白色初始态、thumb 尺寸和参考不一致',
        rootCause: '用通用开关尺寸替代了组件自己的 74×28 track、116×70 glass host 与负边距模型。',
        correction: '按 track、hit area、glass host、lens map 四层分别建模，禁止用一个 CSS pill 兼任全部角色。',
        guardrail: '把四层 bbox 记录为运行指标，主题切换后尺寸不得变化。'
      },
      {
        symptom: '快速连续点击时动画迟钝，甚至先完成旧动画再响应新状态',
        rootCause: '每次切换都排队启动新 spring，没有停止旧控制器；视觉层还维护了第二份 checked。',
        correction: 'native checkbox 保持唯一状态，启动新 motion 前停止旧动画，并从当前视觉值继续积分。',
        guardrail: '连续快速切换 5 次，最终 checked、aria、fill 与 lens 必须在同一帧序列内收敛。'
      },
      {
        symptom: '点击 thumb 没反应或键盘无法切换',
        rootCause: 'visual shell/overlay 接收了 pointer events，透明 input 没覆盖完整命中区。',
        correction: 'native input 位于交互层，所有视觉复制层 pointer-events: none，并保留 focus ring。',
        guardrail: '鼠标、触摸、Space、Tab focus 和表单读取必须使用同一个 checkbox。'
      }
    ],
    debugOrder: [
      '读取 checkbox.checked、aria 与 change 事件，先确认状态真源。',
      '分别显示 real track、fill copy 和 glass target，确认绿色状态进入折射层。',
      '核对 74×28 track 与 116×70 host 的相对位置和负边距。',
      '快速点击并观察旧 spring 是否被取消、hold geometry 是否在 release 后归零。',
      '最后检查 light/dark 材料参数，而不是先用颜色覆盖结构问题。'
    ],
    invariants: [
      'checkbox 是唯一 checked 真源，玻璃层不得保存可漂移的副本。',
      'off/on、hold/release 是两类状态：前者移动镜片，后者改变几何。',
      '视觉层不抢事件，键盘、焦点和表单语义始终可用。'
    ],
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
    iterationLessons: [
      {
        symptom: '滑块一拖动就“露馅”，像白色胶囊盖在轨道上而不是折射轨道',
        rootCause: 'visual thumb 自己画了高光和填充，但 refraction target 没有包含与 value 同步的 fill copy。',
        correction: '真实 track 正常绘制，fill copy 作为 target；glass thumb 只显示 shell 并折射下面的 fill。',
        guardrail: '临时隐藏 shell 后仍应看到轨道在 filter region 内被弯折，否则只是装饰层。'
      },
      {
        symptom: '数值到达 0 或 100 时，thumb、fill 终点和镜片中心对不上',
        rootCause: '用 progress × trackWidth 直接定位，忽略 thumb 半宽、host padding 或 CSS transform。',
        correction: '统一使用有效行程 travel = trackWidth - thumbWidth，并在 host 局部坐标中计算中心。',
        guardrail: '验收 0、50、100 三个锚点，三层中心误差应小于一个 CSS 像素。'
      },
      {
        symptom: '拖动时性能下降，map data URL 持续变化',
        rootCause: '把 x position 放进 map cache key，或把 motion scale 误当成 shape。',
        correction: '固定 thumb 几何时复用 map，只更新 filter bbox；按住导致的尺寸变化才重建。',
        guardrail: '记录拖动前后 map signature：纯位置变化必须相同。'
      },
      {
        symptom: 'Safari 中纵向折射被裁掉或强度明显不同',
        rootCause: 'filter bbox 没包含 bleed，或直接复用 Chromium 的归一化 scaleY。',
        correction: '使用 tight bbox + bleed，并对 target 宽高分别换算 displacement scale。',
        guardrail: 'Safari 单独检查顶部/底部边缘、0/100 端点和竖屏尺寸。'
      }
    ],
    debugOrder: [
      '读取 native range 的 min/max/value/step 与键盘变化。',
      '核对 progress、有效行程、thumb 中心、fill 终点和 lens 中心。',
      '隐藏 shell 验证 target fill 在镜片内确实发生位移。',
      '持续拖动并比较 map signature 与 filter bbox 更新次数。',
      '最后在 Safari、竖屏和 0/100 边界复测裁切。'
    ],
    invariants: [
      'value 是唯一真源，progress 只能由 min/max/value 派生。',
      'track、fill、thumb、lens 使用同一个局部坐标系和有效行程。',
      '纯拖动不重建 map，native range 的方向键和 focus ring不能丢失。'
    ],
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
    iterationLessons: [
      {
        symptom: '选中项瞬移，或只有文字状态变化而玻璃药丸没有过渡',
        rootCause: '直接把 selected 写成最终 left/width，没有从当前 lens state 运行 spring。',
        correction: '把 x、halfWidth、halfHeight 分别从当前值启动可中断 spring，并用速度驱动短暂形变。',
        guardrail: '慢速录制相邻项和跨多项切换，镜片必须连续且快速反向操作不能排队。'
      },
      {
        symptom: '药丸在不同长度标签上偏心、过宽或溢出',
        rootCause: '假设选项等宽，或只测 offsetLeft 没测真实 bbox 与响应式布局。',
        correction: '每次 resize/字体变化后测量每个按钮的中心、半宽和半高，再更新目标几何。',
        guardrail: '桌面五项与竖屏两项分别记录 bbox，不能复用桌面常量。'
      },
      {
        symptom: '增加拖动后，手指离开按钮便中断，松手又被一次 click 改回别项',
        rootCause: '没有 pointer capture，也没有区分拖动后的合成 click。',
        correction: 'group 捕获 pointer；超过阈值后进入 drag，松手吸附最近项并抑制该次合成 click。',
        guardrail: '从按钮内部拖到控件边缘、快速反向、拖后立即点击都必须保持最终选中态。'
      },
      {
        symptom: '拖动过程只有镜片位置变，宽度跳到目标项时才变化',
        rootCause: '连续输入仍使用离散 selected bbox，没有在相邻选项之间插值几何。',
        correction: '按 pointer x 在左右选项中心间插值 x/y/halfWidth/halfHeight，跨中点再更新 selected。',
        guardrail: '拖过不等宽选项时观察边界连续性，clip-path 中不得出现 NaN/Infinity。'
      }
    ],
    debugOrder: [
      '先确认真实 button 的 aria-pressed、focus 与点击状态。',
      '读取全部选项 bbox，检查中心排序、宽度和移动端可见项。',
      '关闭 overlay 的 pointer events，并验证真实按钮仍是命中层。',
      '检查 spring 是否从当前值启动、旧动画是否在新选择前停止。',
      '拖动模式再检查 pointer capture、3px 阈值、中点选择、click 抑制和松手吸附。'
    ],
    invariants: [
      '真实按钮负责语义；overlay 只提供被折射的选中态内容。',
      '选项宽度来自实时测量，不能假设等宽或依赖页面绝对坐标。',
      '点击和拖动共享同一个 selected 状态、lens 几何与 spring 收敛路径。'
    ],
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
    iterationLessons: [
      {
        symptom: '页面有 canvas 元素但内容为空，或只有清晰二维码没有折射',
        rootCause: '把“canvas 存在”误当成 renderer 已工作；source、program、texture、viewport 或 draw call 仍可能未就绪。',
        correction: '分别验证 source canvas、WebGL context、program link、texture 尺寸、viewport 与输出像素签名。',
        guardrail: '验收不能只数 canvas；至少读取中心/四角像素并比较交互前后 signature。'
      },
      {
        symptom: '二维码缩放后发糊，finder eyes 边缘尤其明显',
        rootCause: '把整个二维码烘焙成低分辨率 source bitmap，再进行二次纹理缩放。',
        correction: '普通点阵使用 occupancy texture，finder eyes 用解析 rounded-rect SDF，在 shader 中按输出分辨率求值。',
        guardrail: '改变 DPR 与 CSS 尺寸后 finder eyes 仍应保持解析边缘，不得出现 source bitmap 像素块。'
      },
      {
        symptom: '点击 Logo 有 DOM 动画，但 WebGL 画面像素不变',
        rootCause: '动画只作用于 overlay，没有更新 painting texture、lens slots 或 shader uniforms。',
        correction: '点击写入 painter 状态与五个 lens slot，每帧上传变化纹理并重新 draw。',
        guardrail: '点击前后 output signature 必须不同，动画结束后资源槽可回收并再次触发。'
      },
      {
        symptom: 'Retina 或 resize 后镜片中心偏离 Logo，画面被截断',
        rootCause: 'CSS 尺寸、drawing buffer、viewport、DPR 和 lens pixel coordinates 没有同步更新。',
        correction: '一次 resize transaction 同步五项尺寸，并限制 DPR 防止片元成本失控。',
        guardrail: '在 DPR 1/2/3 与 390px 宽度下记录 buffer/CSS 比例和中心误差。'
      }
    ],
    debugOrder: [
      '先检查 source QR matrix 与 occupancy texture 是否非空。',
      '检查 WebGL context、shader compile/link、texture unit 和 framebuffer/viewport。',
      '对齐 CSS size、drawing buffer、DPR 与 lens coordinates。',
      '点击后检查 painter state、lens slot、uniform 与 output signature 是否逐层变化。',
      '最后测试连续点击、resize、context loss 与资源 dispose。'
    ],
    invariants: [
      'finder eyes 使用解析几何，不能退化为低分辨率截图。',
      'canvas 存在不等于渲染成功，必须用非空像素和交互签名证明。',
      '静态 QR source 不逐帧重传；只更新 painter、lens 与必要 uniforms。'
    ],
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
    iterationLessons: [
      {
        symptom: '视频四周出现不属于播放器的紫色外框',
        rootCause: '把通用组件舞台的边框/背景样式套到 video figure，研究册容器污染了组件视觉。',
        correction: 'Video 使用自己的 figure、12px 圆角与移动端 padding；文档布局只负责外部间距。',
        guardrail: '对比时分别截图组件 bbox 与页面 bbox，禁止用通用卡片装饰包住真实画面。'
      },
      {
        symptom: '控制条始终可见，或鼠标移入移出时玻璃没有出现/消失动画',
        rootCause: '只实现 play/pause 按钮状态，没有实现 hover、touch、inactivity timer 与 lens alpha/geometry 生命周期。',
        correction: '把 controls visibility 作为独立交互状态，进入时激活 circle/bar lenses，超时或离开后渐隐并停止无效绘制。',
        guardrail: '验证 pointer enter、move、leave、touch、播放中超时和暂停六条路径。'
      },
      {
        symptom: '按钮文字变成 Play/Pause，但镜片和视频像素没有响应',
        rootCause: '媒体 DOM 状态与 renderer uniforms/帧循环脱节，或暂停后没有强制重绘当前帧。',
        correction: '订阅真实 media events；play 启动 RAF，pause/seeked/visibility change 触发一次同步 draw。',
        guardrail: '同时断言 video.paused、按钮标签、进度、lens uniforms 与 canvas signature。'
      },
      {
        symptom: '视频能播放但 WebGL 输出黑屏，Safari 更常见',
        rootCause: '视频尚无可上传帧、CORS 不允许纹理采样，或 context 恢复后复用了失效句柄。',
        correction: '等待 loadeddata/canplay，设置 crossOrigin/muted/playsInline，并在 context restored 后完整重建 renderer。',
        guardrail: '记录 readyState、videoWidth/Height、GL error、纹理尺寸与 context generation。'
      },
      {
        symptom: '暂停后 CPU/GPU 仍持续工作，页面切换后越来越慢',
        rootCause: 'RAF、媒体监听器、texture/program/buffer 没有随 pause 或 unmount 释放。',
        correction: '播放态才维持连续帧循环；组件卸载时统一 cancel RAF、解绑事件并 dispose。',
        guardrail: '反复进入离开页面后，活动 RAF、监听器和 WebGL 资源数量不得增长。'
      }
    ],
    debugOrder: [
      '确认 video readyState、尺寸、CORS、paused/currentTime 与真实 media events。',
      '确认 source texture 每个有效帧更新，pause/seek 后至少重绘一次。',
      '检查 circle/button 与 bar/progress lens 的 bbox、alpha 和出现/消失状态。',
      '检查 output canvas 像素、进度同步和移动端 figure 尺寸。',
      '最后执行长时间播放、切页、resize、DPR 与 context loss/restore。'
    ],
    invariants: [
      '播放器组件视觉不能被 Storybook 通用舞台边框或背景污染。',
      '媒体状态、控件可见性、lens uniforms 和帧循环是四个不同但需同步的状态机。',
      '暂停和卸载后不得保留无意义 RAF；context 恢复必须创建新 WebGL 句柄。'
    ],
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
    iterationLessons: [
      {
        symptom: 'Playground 能调参数，但结果与其他组件没有直接关系',
        rootCause: '为实验页另写一套近似玻璃算法，参数名字相同但 map 生成器和 filter 路径不同。',
        correction: 'Playground 与正式组件共享 generateLensMap、SVG controller 和材料类型，只增加可视化与控件。',
        guardrail: '相同参数在 Playground 与组件中必须生成相同 map signature。'
      },
      {
        symptom: '移动镜片也触发 map 重建，调节时卡顿',
        rootCause: 'cache key 混入 x/y，或没有区分 geometry、material 与 render-only 参数。',
        correction: '明确 cache key：shape/material 进入 key，position 和 displacement scale 仅更新消费阶段。',
        guardrail: '界面同时显示 map signature 与 rebuild 计数，移动操作要求二者保持不变。'
      },
      {
        symptom: 'map preview 有彩色图，但实际折射不变',
        rootCause: '预览和 filter 分别持有两份资源，或 feImage/WebGL map texture 没更新到新 URL/像素。',
        correction: '预览直接消费 controller 返回的同一个 LensMapResource，并在资源替换后刷新 filter/texture。',
        guardrail: '一次参数变化必须同时改变 map preview、resource signature 与折射像素。'
      },
      {
        symptom: 'Storybook Controls 能改值，但读者无法理解参数之间的因果',
        rootCause: '把实验状态放在 Storybook args，页面没有展示 map、重建边界和操作步骤。',
        correction: '参数控件置于故事内部，与 map/result 同屏，并解释每个参数是否触发资源重建。',
        guardrail: '普通组件禁用 Controls；只有实验页提供页面内可解释调节器。'
      }
    ],
    debugOrder: [
      '记录初始参数、map signature、rebuild count 与折射截图。',
      '一次只改变一个 geometry 参数，确认 map、preview 与 result 同步变化。',
      '只改变 Scale，确认 result 变化但 map signature 不变。',
      '只移动 x/y，确认 map 与 source 都被复用。',
      '恢复默认值并检查资源、粒子动画与 filter 节点没有累积。'
    ],
    invariants: [
      'Playground 必须复用正式核心，不能维护第二套近似算法。',
      '预览、SVG filter 和 WebGL texture 消费同一个 map 资源。',
      '每个参数都必须标明所属层级以及是否使 cache 失效。'
    ],
    guideSources: ['playground-example', 'lens-map', 'svg-controller'],
    primarySource: 'playground-example'
  }
};
