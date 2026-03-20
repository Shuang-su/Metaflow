# Metaflow 项目索引与模块文档

> 本文档整理 PlayCanvas 高斯泼溅相关三个核心仓库的结构、关键模块与检索索引，便于后续 Web 端资源浏览器开发时快速定位代码。

---

## 目录

- [仓库概览](#仓库概览)
- [supersplat-viewer（查看器）](#supersplat-viewer查看器)
- [supersplat（编辑器）](#supersplat编辑器)
- [pcui（UI 组件库）](#pcuiui-组件库)
- [功能检索索引](#功能检索索引)

---

## 仓库概览

| 仓库 | 用途 | 版本 | 技术栈 | 本地运行 |
|------|------|------|--------|----------|
| **supersplat-viewer-v1.11.1** | 高斯泼溅查看器基线 | 1.11.1 | TypeScript + PlayCanvas + Rollup | `npm install && npm run develop` |
| **supersplat-viewer-v1.18.2** | 高斯泼溅查看器上游 | 1.18.2 | TypeScript + PlayCanvas + Rollup | 对比用 |
| **metaflow-viewer** | Metaflow 定制查看器 | 1.0.0 | TypeScript + 基于 v1.11.1 扩展 | `npm install && npm run develop` |
| **supersplat** | 高斯泼溅场景编辑器 | - | TypeScript + PlayCanvas + PCUI + Rollup | `npm install && npm run develop` |
| **pcui** | PlayCanvas 官方 UI 组件库 | - | TypeScript + SCSS + React + Storybook | `npm install && npm run storybook` |

---

## supersplat-viewer（查看器）

### 文件结构

```
supersplat-viewer-v1.11.1/
├── src/
│   ├── index.ts                 # 入口：资源加载、main() 启动
│   ├── viewer.ts                # 核心：渲染控制、后处理、CameraFrame
│   ├── ui.ts                    # UI：加载进度、全屏、设置面板、时间轴
│   ├── settings.ts              # 配置：schema 导入与版本迁移
│   ├── input-controller.ts      # 输入：键鼠/触控/手柄统一处理
│   ├── camera-manager.ts        # 相机：轨道/飞行/动画模式管理
│   ├── annotations.ts           # 标注：3D 热点系统
│   ├── annotation.ts            # 标注：单个热点渲染与交互
│   ├── picker.ts                # 拾取：深度拾取实现
│   ├── tooltip.ts               # 提示：工具提示组件
│   ├── xr.ts                    # XR：AR/VR 支持
│   ├── types.ts                 # 类型定义
│   ├── index.html               # HTML 模板
│   ├── index.scss               # 样式
│   ├── animation/               # 动画系统
│   │   ├── anim-cursor.ts       # 动画光标
│   │   ├── anim-state.ts        # 动画状态
│   │   └── create-rotate-track.ts # 旋转轨迹生成
│   ├── cameras/                 # 相机控制器
│   │   ├── camera.ts            # Camera 基类
│   │   ├── orbit-controller.ts  # 轨道相机
│   │   ├── fly-controller.ts    # 飞行相机
│   │   └── anim-controller.ts   # 动画相机
│   ├── core/                    # 核心工具
│   │   ├── math.ts              # 数学工具
│   │   ├── observe.ts           # 响应式状态
│   │   └── spline.ts            # 样条曲线
│   ├── schemas/                 # 配置 schema
│   │   ├── v1.ts                # v1 版本
│   │   └── v2.ts                # v2 版本
│   └── module/                  # NPM 模块导出
│       ├── index.ts             # html/css/js 字符串导出
│       └── index.d.ts           # 类型声明
├── package.json
├── rollup.config.mjs
├── tsconfig.json
└── README.md
```

### 版本对照表

**当前本地结构：**

- `supersplat-viewer-v1.11.1/` - 基线（PlayCanvas 2.15.2）
- `supersplat-viewer-v1.18.2/` - 上游最新（PlayCanvas 2.17.1）
- `metaflow-viewer/` - 定制版本（基于 v1.11.1 + 扩展）

**LOD 策略差异：v1.11.1 用固定 range 预设驱动 LOD，v1.18.2 用流式加载 + 动态等级。升级时将通过三方对比引入新方案，保留双通道加载能力。**

### 迁移落地规则（Metaflow）

- 保留 `metaflow-viewer` 对“主体 + 环境”双资源的加载优化。
- 保留 `metaflow-viewer` 的双通道语义：`progress + status`。
- 保留首帧与超时兜底机制：`firstFrame`、排序超时、LOD 超时。
- 保留并扩展加载状态追踪字段：`loadingMode`、`loadingStage`、`loadingConflict`。
- 保留 `metaflow-editor` 旧版本，不参与本次迁移。

### 运行时验证矩阵

| 场景 | 输入资源 | 路径判定 | 期望加载阶段 | 关键断言 |
|------|----------|----------|--------------|----------|
| A | 传统 SOG（无 JSON 流式结构） | `legacy-sog` | init → detect → download/parse/gpu → legacy-lod-loading → prepare/sort → complete | 双通道状态正常；hqMode 改预算；retinaDisplay 仅改像素比 |
| B | 流式 LOD JSON（结构字段命中） | `streaming-json` | init → detect → download/parse/gpu → stream-schedule/stream-loading → prepare → complete | 结构优先判定；hqMode + retinaDisplay 共同影响预算 |
| C | 主体 + 环境 | 按主体资源判定 | init → environment → detect → ... → complete | 环境先加载；状态文案连续；首帧/超时仍生效 |
| D | JSON 文件名与结构冲突 | 结构优先 | detect（冲突可见） → 后续按决策路径执行 | `loadingConflict=true` 且 UI 状态前缀显示 `[冲突]` |

### 冲突确认流程

1. 触发条件：JSON 文件名判定与结构字段判定不一致。
2. 系统行为：默认采用“结构优先”，并在控制台输出冲突详情。
3. UI 行为：加载状态文本带 `[冲突]` 前缀，提示当前采用的决策。
4. 人工确认：
        - 若素材来自新流式管线，保持结构优先；
        - 若素材为历史包且结构不完整，可补充文件名或元数据映射；
        - 若需强制路径，增加白名单映射（后续批次可加）。

### 关键模块说明

| 模块 | 文件 | 功能 | 可复用性 |
|------|------|------|----------|
| **Viewer** | `viewer.ts` | 渲染主循环、后处理、HDR/色调映射 | ⭐⭐⭐ 核心复用 |
| **CameraManager** | `camera-manager.ts` | 多模式相机切换与过渡 | ⭐⭐⭐ 核心复用 |
| **InputController** | `input-controller.ts` | 多设备输入抽象层 | ⭐⭐⭐ 核心复用 |
| **OrbitController** | `cameras/orbit-controller.ts` | 轨道相机控制 | ⭐⭐⭐ 直接复用 |
| **FlyController** | `cameras/fly-controller.ts` | 第一人称飞行相机 | ⭐⭐ 按需复用 |
| **Annotations** | `annotations.ts` | 3D 热点标注系统 | ⭐⭐ 资源讲解 |
| **UI** | `ui.ts` | 加载态、控制面板 | ⭐⭐ 参考实现 |
| **XR** | `xr.ts` | WebXR AR/VR 接入 | ⭐ 可选集成 |
| **Settings** | `settings.ts` | 配置版本迁移 | ⭐⭐ 配置标准 |

---

## supersplat（编辑器）

### 文件结构

```
supersplat/
├── src/
│   ├── index.ts                 # 入口：样式加载、版本输出
│   ├── main.ts                  # 主流程：事件注册、场景初始化
│   ├── editor.ts                # 编辑器：核心业务逻辑
│   ├── scene.ts                 # 场景：PlayCanvas 场景管理
│   ├── render.ts                # 渲染：渲染事件注册
│   ├── pc-app.ts                # 应用：PlayCanvas App 封装
│   │
│   ├── splat.ts                 # Splat 实体
│   ├── splat-state.ts           # Splat 状态管理
│   ├── splat-serialize.ts       # Splat 序列化
│   ├── splat-overlay.ts         # Splat 叠加渲染
│   │
│   ├── edit-ops.ts              # 编辑操作定义
│   ├── edit-history.ts          # 撤销/重做历史
│   ├── selection.ts             # 选区管理
│   │
│   ├── camera.ts                # 编辑器相机
│   ├── camera-poses.ts          # 相机姿态
│   ├── picker.ts                # 拾取
│   ├── pivot.ts                 # 轴心点
│   │
│   ├── events.ts                # 事件系统
│   ├── shortcut-manager.ts      # 快捷键管理
│   ├── shortcuts.ts             # 快捷键定义
│   │
│   ├── file-handler.ts          # 文件处理
│   ├── asset-loader.ts          # 资源加载
│   ├── drop-handler.ts          # 拖放处理
│   ├── recent-files.ts          # 最近文件
│   │
│   ├── publish.ts               # 发布流程
│   ├── iframe-api.ts            # iframe API
│   ├── timeline.ts              # 时间轴
│   ├── ply-sequence.ts          # PLY 序列
│   │
│   ├── transform.ts             # 变换
│   ├── transform-handler.ts     # 变换处理器
│   ├── transform-palette.ts     # 变换调色板
│   ├── entity-transform-handler.ts
│   ├── splats-transform-handler.ts
│   │
│   ├── infinite-grid.ts         # 无限网格
│   ├── outline.ts               # 轮廓线
│   ├── underlay.ts              # 底层渲染
│   ├── box-shape.ts             # 盒形状
│   ├── sphere-shape.ts          # 球形状
│   │
│   ├── scene-config.ts          # 场景配置
│   ├── scene-state.ts           # 场景状态
│   ├── serializer.ts            # 序列化器
│   ├── png-compressor.ts        # PNG 压缩
│   ├── sh-utils.ts              # 球谐工具
│   ├── tween-value.ts           # 缓动值
│   ├── element.ts               # 元素基类
│   ├── doc.ts                   # 文档处理
│   │
│   ├── io/                      # 输入输出
│   │   ├── index.ts
│   │   ├── read/                # 读取适配器
│   │   └── write/               # 写入适配器
│   │
│   ├── tools/                   # 工具集
│   │   ├── tool-manager.ts      # 工具管理器
│   │   ├── box-selection.ts     # 框选
│   │   ├── brush-selection.ts   # 笔刷选择
│   │   ├── lasso-selection.ts   # 套索选择
│   │   ├── polygon-selection.ts # 多边形选择
│   │   ├── rect-selection.ts    # 矩形选择
│   │   ├── sphere-selection.ts  # 球形选择
│   │   ├── flood-selection.ts   # 泛选
│   │   ├── eyedropper-selection.ts # 吸管
│   │   ├── measure-tool.ts      # 测量工具
│   │   ├── move-tool.ts         # 移动工具
│   │   ├── rotate-tool.ts       # 旋转工具
│   │   ├── scale-tool.ts        # 缩放工具
│   │   └── transform-tool.ts    # 变换工具基类
│   │
│   ├── data-processor/          # 数据处理
│   │   ├── index.ts
│   │   ├── calc-bound.ts        # 边界计算
│   │   ├── calc-positions.ts    # 位置计算
│   │   └── intersect.ts         # 相交检测
│   │
│   ├── shaders/                 # 着色器
│   │
│   ├── ui/                      # 用户界面
│   │   ├── editor.ts            # 编辑器 UI 主入口
│   │   ├── localization.ts      # 国际化
│   │   ├── menu.ts              # 菜单
│   │   ├── menu-panel.ts        # 菜单面板
│   │   ├── scene-panel.ts       # 场景面板
│   │   ├── data-panel.ts        # 数据面板
│   │   ├── view-panel.ts        # 视图面板
│   │   ├── timeline-panel.ts    # 时间轴面板
│   │   ├── splat-list.ts        # Splat 列表
│   │   ├── color-panel.ts       # 颜色面板
│   │   ├── color.ts             # 颜色选择
│   │   ├── transform.ts         # 变换面板
│   │   ├── bottom-toolbar.ts    # 底部工具栏
│   │   ├── right-toolbar.ts     # 右侧工具栏
│   │   ├── mode-toggle.ts       # 模式切换
│   │   ├── view-cube.ts         # 视图立方体
│   │   ├── histogram.ts         # 直方图
│   │   ├── progress.ts          # 进度条
│   │   ├── spinner.ts           # 加载动画
│   │   ├── tooltips.ts          # 工具提示
│   │   ├── popup.ts             # 弹窗基类
│   │   ├── about-popup.ts       # 关于弹窗
│   │   ├── export-popup.ts      # 导出弹窗
│   │   ├── shortcuts-popup.ts   # 快捷键弹窗
│   │   ├── publish-settings-dialog.ts
│   │   ├── image-settings-dialog.ts
│   │   ├── video-settings-dialog.ts
│   │   ├── scss/                # 样式
│   │   └── svg/                 # SVG 图标
│   │
│   └── utils/                   # 工具函数
│
├── static/
│   ├── env/                     # 环境贴图
│   ├── icons/                   # 图标
│   ├── images/                  # 图片
│   ├── lib/                     # 第三方库
│   └── locales/                 # 语言包
│
├── docs/
│   └── index.md
├── package.json
├── rollup.config.mjs
├── tsconfig.json
└── README.md
```

### 关键模块说明

| 模块 | 文件 | 功能 | 可复用性 |
|------|------|------|----------|
| **Scene** | `scene.ts` | 场景管理与渲染 | ⭐⭐⭐ 核心参考 |
| **Splat** | `splat.ts` | 高斯泼溅数据实体 | ⭐⭐⭐ 数据模型 |
| **EditHistory** | `edit-history.ts` | 撤销/重做系统 | ⭐⭐⭐ 编辑功能 |
| **ToolManager** | `tools/tool-manager.ts` | 工具注册与切换 | ⭐⭐⭐ 工具系统 |
| **Selection Tools** | `tools/*-selection.ts` | 多种选区工具 | ⭐⭐ 编辑扩展 |
| **Transform Tools** | `tools/*-tool.ts` | 变换工具 | ⭐⭐ 编辑扩展 |
| **EditorUI** | `ui/editor.ts` | 编辑器界面 | ⭐⭐ UI 参考 |
| **IO** | `io/` | 文件读写 | ⭐⭐⭐ 格式支持 |
| **Events** | `events.ts` | 事件总线 | ⭐⭐⭐ 架构参考 |
| **Localization** | `ui/localization.ts` | 国际化 | ⭐⭐ 多语言 |

---

## pcui（UI 组件库）

### 文件结构

```
pcui/
├── src/
│   ├── index.ts                 # 主入口
│   ├── index.tsx                # React 入口
│   ├── class.ts                 # 基础类
│   │
│   ├── components/              # 组件库
│   │   ├── index.ts             # 组件导出
│   │   ├── components.tsx       # React 组件集合
│   │   │
│   │   ├── Element/             # 基础元素
│   │   ├── Container/           # 容器
│   │   ├── Panel/               # 面板
│   │   ├── Overlay/             # 遮罩层
│   │   │
│   │   ├── Button/              # 按钮
│   │   ├── Label/               # 标签
│   │   ├── LabelGroup/          # 标签组
│   │   ├── Divider/             # 分隔线
│   │   │
│   │   ├── TextInput/           # 文本输入
│   │   ├── TextAreaInput/       # 多行文本
│   │   ├── NumericInput/        # 数字输入
│   │   ├── BooleanInput/        # 布尔输入
│   │   ├── SelectInput/         # 下拉选择
│   │   ├── SliderInput/         # 滑块
│   │   ├── VectorInput/         # 向量输入
│   │   ├── ArrayInput/          # 数组输入
│   │   ├── RadioButton/         # 单选按钮
│   │   │
│   │   ├── ColorPicker/         # 颜色选择器
│   │   ├── GradientPicker/      # 渐变选择器
│   │   │
│   │   ├── TreeView/            # 树形视图
│   │   ├── TreeViewItem/        # 树形项
│   │   ├── GridView/            # 网格视图
│   │   ├── GridViewItem/        # 网格项
│   │   │
│   │   ├── Menu/                # 菜单
│   │   ├── MenuItem/            # 菜单项
│   │   │
│   │   ├── Progress/            # 进度条
│   │   ├── Spinner/             # 加载动画
│   │   ├── InfoBox/             # 信息框
│   │   ├── Code/                # 代码块
│   │   ├── Canvas/              # 画布
│   │   └── InputElement/        # 输入元素基类
│   │
│   ├── binding/                 # 数据绑定
│   │   ├── index.ts
│   │   ├── BindingBase/         # 绑定基类
│   │   ├── BindingElementToObservers/  # 元素→观察者
│   │   ├── BindingObserversToElement/  # 观察者→元素
│   │   └── BindingTwoWay/       # 双向绑定
│   │
│   ├── helpers/                 # 辅助函数
│   │   ├── search.ts            # 搜索
│   │   └── utils.ts             # 工具函数
│   │
│   ├── examples/                # 示例
│   │   ├── BidirectionalBinding/
│   │   ├── History/
│   │   ├── Observer/
│   │   └── TodoList/
│   │
│   ├── Math/                    # 数学工具
│   │
│   └── scss/                    # 样式
│
├── react/                       # React 包装
│   ├── package.json
│   └── tsconfig.json
│
├── styles/                      # 样式入口
│   └── package.json
│
├── examples/                    # 独立示例
│   ├── index.html
│   ├── elements/
│   └── utilities/
│
├── test/                        # 测试
│   ├── components/
│   └── helpers/
│
├── utils/                       # 构建工具
│
├── .storybook/                  # Storybook 配置
│
├── package.json
├── rollup.config.mjs
├── tsconfig.json
├── typedoc.json
├── BUILDGUIDE.md
└── README.md
```

### 组件清单

| 分类 | 组件 | 用途 |
|------|------|------|
| **布局** | Container, Panel, Overlay, Divider | 页面结构 |
| **基础** | Button, Label, LabelGroup | 基础交互 |
| **输入** | TextInput, NumericInput, BooleanInput, SelectInput, SliderInput | 表单输入 |
| **高级输入** | VectorInput, ArrayInput, ColorPicker, GradientPicker | 专业输入 |
| **列表** | TreeView, GridView, Menu | 数据展示 |
| **反馈** | Progress, Spinner, InfoBox | 状态反馈 |
| **特殊** | Code, Canvas | 代码/画布 |

### 数据绑定

| 类型 | 类 | 用途 |
|------|---|------|
| 单向（元素→数据） | `BindingElementToObservers` | 表单提交 |
| 单向（数据→元素） | `BindingObserversToElement` | 数据展示 |
| 双向 | `BindingTwoWay` | 实时同步 |

---

## 功能检索索引

### 按功能分类

#### 🎬 渲染与显示

| 功能 | 仓库 | 文件 | 说明 |
|------|------|------|------|
| 高斯泼溅渲染 | viewer | `viewer.ts` | GSplat 组件加载与渲染 |
| 后处理效果 | viewer | `viewer.ts` | Bloom、Vignette、色调映射等 |
| 场景管理 | supersplat | `scene.ts` | PlayCanvas 场景封装 |
| 无限网格 | supersplat | `infinite-grid.ts` | 编辑器网格 |
| 轮廓渲染 | supersplat | `outline.ts` | 选中物体轮廓 |
| Splat 叠加 | supersplat | `splat-overlay.ts` | 多层叠加显示 |

#### 📷 相机系统

| 功能 | 仓库 | 文件 | 说明 |
|------|------|------|------|
| 相机管理 | viewer | `camera-manager.ts` | 多模式切换 |
| 轨道相机 | viewer | `cameras/orbit-controller.ts` | 围绕目标旋转 |
| 飞行相机 | viewer | `cameras/fly-controller.ts` | 第一人称漫游 |
| 动画相机 | viewer | `cameras/anim-controller.ts` | 路径动画 |
| 编辑器相机 | supersplat | `camera.ts` | 编辑模式相机 |
| 相机姿态 | supersplat | `camera-poses.ts` | 视角存储/恢复 |

#### 🎮 输入与交互

| 功能 | 仓库 | 文件 | 说明 |
|------|------|------|------|
| 输入控制器 | viewer | `input-controller.ts` | 键鼠/触控/手柄 |
| 拾取 | viewer | `picker.ts` | 深度拾取 |
| 快捷键 | supersplat | `shortcut-manager.ts` | 快捷键系统 |
| 拖放处理 | supersplat | `drop-handler.ts` | 文件拖放 |

#### ✏️ 编辑功能

| 功能 | 仓库 | 文件 | 说明 |
|------|------|------|------|
| 编辑历史 | supersplat | `edit-history.ts` | 撤销/重做 |
| 编辑操作 | supersplat | `edit-ops.ts` | 操作定义 |
| 选区管理 | supersplat | `selection.ts` | 选区状态 |
| 框选工具 | supersplat | `tools/box-selection.ts` | 3D 框选 |
| 笔刷选择 | supersplat | `tools/brush-selection.ts` | 笔刷绘选 |
| 套索选择 | supersplat | `tools/lasso-selection.ts` | 自由套索 |
| 变换工具 | supersplat | `tools/move-tool.ts` 等 | 移动/旋转/缩放 |
| 测量工具 | supersplat | `tools/measure-tool.ts` | 距离测量 |

#### 📁 数据与 IO

| 功能 | 仓库 | 文件 | 说明 |
|------|------|------|------|
| Splat 数据 | supersplat | `splat.ts` | 数据实体 |
| Splat 序列化 | supersplat | `splat-serialize.ts` | PLY 导出 |
| 文件读写 | supersplat | `io/` | 格式适配 |
| 资源加载 | supersplat | `asset-loader.ts` | 资源管理 |
| 配置 schema | viewer | `schemas/` | 版本迁移 |

#### 🖼️ 用户界面

| 功能 | 仓库 | 文件 | 说明 |
|------|------|------|------|
| 加载 UI | viewer | `ui.ts` | 进度、全屏 |
| 标注系统 | viewer | `annotations.ts` | 3D 热点 |
| 编辑器 UI | supersplat | `ui/editor.ts` | 完整编辑界面 |
| 场景面板 | supersplat | `ui/scene-panel.ts` | 场景树 |
| 属性面板 | supersplat | `ui/data-panel.ts` | 属性编辑 |
| 时间轴 | supersplat | `ui/timeline-panel.ts` | 动画时间轴 |
| 基础组件 | pcui | `src/components/` | 全套 UI 组件 |
| 数据绑定 | pcui | `src/binding/` | 响应式绑定 |

#### 🥽 XR 支持

| 功能 | 仓库 | 文件 | 说明 |
|------|------|------|------|
| AR/VR | viewer | `xr.ts` | WebXR 接入 |

#### 🌐 国际化

| 功能 | 仓库 | 文件 | 说明 |
|------|------|------|------|
| 多语言 | supersplat | `ui/localization.ts` | i18n 系统 |
| 语言包 | supersplat | `static/locales/` | 翻译文件 |

---

### 按文件类型检索

#### TypeScript 入口文件

| 文件 | 仓库 | 作用 |
|------|------|------|
| `src/index.ts` | viewer | 查看器入口 |
| `src/index.ts` | supersplat | 编辑器入口 |
| `src/main.ts` | supersplat | 编辑器主逻辑 |
| `src/index.ts` | pcui | 组件库入口 |

#### 配置文件

| 文件 | 仓库 | 作用 |
|------|------|------|
| `package.json` | 所有 | 依赖与脚本 |
| `tsconfig.json` | 所有 | TypeScript 配置 |
| `rollup.config.mjs` | 所有 | 构建配置 |
| `eslint.config.mjs` | 所有 | 代码规范 |

#### 样式文件

| 文件 | 仓库 | 作用 |
|------|------|------|
| `src/index.scss` | viewer | 查看器样式 |
| `src/ui/scss/` | supersplat | 编辑器样式 |
| `src/scss/` | pcui | 组件样式 |

---

### 依赖关系图

```
┌─────────────────────────────────────────────────────────┐
│                      PlayCanvas Engine                   │
└─────────────────────────────────────────────────────────┘
                            ▲
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│ supersplat-   │   │  supersplat   │   │     pcui      │
│    viewer     │   │   (editor)    │◄──│  (UI library) │
│  (runtime)    │   │               │   │               │
└───────────────┘   └───────────────┘   └───────────────┘
```

---

### 快速定位指南

| 我想要... | 去看... |
|-----------|---------|
| 加载并显示一个 .ply 文件 | `viewer/src/index.ts` → `loadGsplat()` |
| 实现轨道相机控制 | `viewer/src/cameras/orbit-controller.ts` |
| 添加 3D 标注热点 | `viewer/src/annotation.ts` |
| 实现撤销/重做 | `supersplat/src/edit-history.ts` |
| 创建选区工具 | `supersplat/src/tools/` |
| 使用滑块组件 | `pcui/src/components/SliderInput/` |
| 实现数据双向绑定 | `pcui/src/binding/BindingTwoWay/` |
| 添加 AR 支持 | `viewer/src/xr.ts` |
| 导出 PLY 文件 | `supersplat/src/splat-serialize.ts` |
| 添加新语言 | `supersplat/static/locales/` |

---

## 附录

### 技术栈

- **运行时**: PlayCanvas Engine
- **语言**: TypeScript
- **构建**: Rollup
- **样式**: SCSS
- **UI**: PCUI (原生 + React)
- **测试**: Storybook (pcui)

### 相关链接

- [PlayCanvas Engine](https://github.com/playcanvas/engine)
- [SuperSplat 在线版](https://superspl.at/editor)
- [PCUI 文档](https://developer.playcanvas.com/user-manual/pcui)
- [PCUI Storybook](https://playcanvas.github.io/pcui/storybook/)

---

*文档生成时间: 2026-02-01*
