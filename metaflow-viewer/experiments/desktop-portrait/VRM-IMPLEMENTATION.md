# VRM 1.0 角色集成实现报告

**实施日期**：2026-11-13  
**Issue**: [MF-165](https://github.com/Shuang-su/Metaflow/issues/165)  
**PR**: [#166](https://github.com/Shuang-su/Metaflow/pull/166)  
**分支**: `codex/mf-165-desktop-portrait`  
**提交**: `5bb87a91`

## 实现概述

在现有桌面高斯人像原型基础上，新增 **VRM 1.0 角色支持**，实现：

1. ✅ **VRM 加载器**：支持本地 `.vrm` 文件和 HTTPS URL，带取消/超时/大小限制
2. ✅ **待机动画**：呼吸（15次/分钟）、随机眨眼（平均3秒）、注视观察者
3. ✅ **音频驱动口型**：本地合成测试音频，AudioContext 分析驱动嘴巴张开
4. ✅ **空间集成**：VRM 与高斯共享离轴投影、桌面坐标和校准参数
5. ✅ **渲染合成**：Three.js 与 PlayCanvas 共享 WebGL 上下文
6. ✅ **资源管理**：正确释放 VRM 场景、动画、音频和 Three.js 资源
7. ✅ **48 项自动化测试通过**

## 技术架构

### 渲染栈

- **PlayCanvas 2.23.0**：高斯 splat 渲染、相机投影、桌面场景
- **Three.js 0.170.0**：VRM 骨骼动画和材质渲染
- **@pixiv/three-vrm 3.1.4**：VRM 1.0 规范支持（humanoid、expressions、lookAt）

### 渲染管线

```
PlayCanvas 渲染循环:
  1. 更新相机离轴投影 (projection.mjs)
  2. 渲染桌面、阴影、高斯 splat (PlayCanvas)
  3. 同步 Three.js 相机与 PlayCanvas 相机
  4. 清除深度缓冲 (gl.clear(DEPTH_BUFFER_BIT))
  5. 渲染 VRM 角色 (Three.js, 共享 WebGL context)
  6. 呈现最终画面
```

**关键设计**：
- 共享 WebGL 上下文避免多渲染器性能损耗
- 深度清除确保 VRM 不被高斯遮挡（临时策略，正式混合需深度融合）
- VRM 场景变换与 PlayCanvas personRoot 实体同步

### 模块结构

#### `vrm-loader.mjs`
VRM 文件加载器，模式与 `asset-loader.mjs` 一致：

- 流式下载，支持 Content-Length 和实际字节限制（150 MiB）
- 取消当前加载、超时控制（120 秒）
- GLTFLoader + VRMLoaderPlugin 解析 VRM 1.0
- 验证 humanoid 骨骼必需性
- 返回 `VRM` 实例（Three.js 场景 + VRM 扩展）

#### `vrm-animation.mjs`
动画控制器：

**`createVRMAnimationController(vrm, options)`**:
- **呼吸动画**：`chest` 骨骼缩放，sin 波形（0.25 Hz = 15次/分钟），振幅 2%
- **眨眼动画**：随机间隔（3±2秒），快速闭合/睁开曲线（0.15秒），使用 `blink` 表情
- **注视动画**：平滑插值 `lookAt.target` 到相机世界位置
- **口型动画**：`setMouthOpen(0-1)` 驱动 `aa` 表情（日文 VRM 标准）

**`createAudioMouthController(options)`**:
- AudioContext + AnalyserNode 分析音频频谱
- 强调 300-3000 Hz 语音频段
- 计算平均音量 → 非线性曲线 → 口型张开量（0-1）
- 调用回调 `onMouthUpdate(amount)`

#### `vrm-adapter.mjs`
PlayCanvas 集成适配器（备用设计，当前在 app.mjs 直接集成）：

- `createVRMEntity()`: 封装 VRM 为 PlayCanvas 风格实体
- `createAudioController()`: 音频播放 + 口型同步
- 提供 `render(pcCamera, dt)` 统一接口

#### `test-audio.mjs`
合成语音测试音频：

- 生成 3 秒 WAV 格式音频（44100 Hz, mono, 16-bit PCM）
- 模拟音素序列：a/o/e/u/i + 静音/辅音
- 基频 + 2/3 次谐波，包络调制
- 用于演示口型，不连接外部语音服务

#### `vrm-loader.test.mjs`
VRM 加载器单元测试（8 项）：

- 配置验证、输入验证
- Content-Length 和实际字节限制
- HTTP 错误处理、body 取消
- 并发加载、主动取消、超时

### 集成到 app.mjs

**新增变量**:
```javascript
let modelType = 'gaussian' | 'vrm';
let vrmInstance = null;  // Three.js VRM 对象
let vrmAnimController = null;
let audioMouthController = null;
let threeRenderer, threeScene, threeCamera;
```

**关键修改**:
1. **`openPortrait()`**: 检测 `.vrm` 扩展名，分支加载逻辑
   - VRM: `vrmLoader.load()` → 创建 Three.js 场景 → `createVRMAnimationController()`
   - Gaussian: 保持原有 `portraitLoader.load()` 逻辑
2. **`disposeCurrentModel()`**: 统一释放当前模型（VRM 或 Gaussian）
3. **`updatePerson()`**: 
   - VRM: 同步 `vrmInstance.scene` 变换与 PlayCanvas `personRoot`
   - Gaussian: 保持原有 `model.setLocal*` 逻辑
4. **`app.on('update')`**: 调用 `vrmAnimController.update(dt)`
5. **`app.on('frameend')`**: 
   - 同步 Three.js 相机
   - 清除深度缓冲
   - 渲染 VRM 场景

**UI 更新**:
- 文件选择器接受 `.vrm`
- VRM 模型加载后显示「VRM 测试音频」控制
- 播放/停止按钮控制测试音频和口型

## 测试状态

### 自动化测试

```bash
npm test  # 48/48 通过 (1197 ms)
```

**覆盖范围**:
- **Gaussian 加载器** (11 项): 流控制、取消、超时、限制、解析、清理
- **引擎投影** (3 项): PlayCanvas 2.23.0 相机矩阵、偏移 setter、桌面变换
- **几何投影** (12 项): 屏幕角点不变、视差方向、倾角共面、无效输入
- **追踪** (14 项): 启停竞争、权限拒绝、丢脸、后摄拒绝、推理失败
- **VRM 加载器** (8 项): 配置、输入验证、限制、取消、超时、HTTP 错误

### 浏览器验证

**环境**: Headless Chrome, WebGL2

**结果**: ✅ 页面加载成功，渲染合成高斯校准样本

**截图**: 
- `/opt/cursor/artifacts/desktop-portrait-gaussian-calibration.png` (79 KB)
- 1280×800 PNG, 3 秒虚拟时间预算

**局限**:
- Headless 环境没有真实 WebGL 硬件加速
- 未加载真实 VRM 文件（需 `.vrm` 资产）
- 未验证 MToon 材质、表情、骨骼动画
- 未测试音频播放和口型同步

### 待验收项

**代码完成，需实际浏览器/设备验证**:
- [ ] 真实 VRM 1.0 文件加载和材质渲染（MToon、透明度、纹理）
- [ ] humanoid 骨骼正确映射（hips、spine、head、hands、feet）
- [ ] expressions 正确驱动（blink、aa、其他表情）
- [ ] lookAt 注视方向和平滑度
- [ ] 呼吸、眨眼动画视觉效果
- [ ] 测试音频播放和口型同步的实际对应关系
- [ ] VRM 与桌面共享投影时的空间一致性
- [ ] 眼位移动时角色透视变化的正确性
- [ ] 资源切换、pagehide 时的完整释放

**需实机验证（iPad）**:
- [ ] Safari/主屏幕应用兼容性
- [ ] VRM 材质在移动 GPU 的渲染质量
- [ ] 头部追踪与 VRM 动画并发性能
- [ ] AudioContext 在 iOS 的用户手势要求
- [ ] 持续运行温升和帧率稳定性（目标 30+ fps）
- [ ] VRM + Gaussian 混合场景的性能

## VRM 模型授权

⚠️ **不随代码分发任何 VRM 模型文件**

**参考对象（未包含）**:
- **LAPLACE Milky Green（明前奶绿）**: [Persona VRM](https://laplace.live/persona/vrm)
  - 授权: 非商业使用 + 署名（[License §4](https://laplace.live/persona/license)）
  - 用户需自行下载并遵守条款
- **Persona 示例角色**: 同上

**用户可用资源**:
- VRM Consortium 官方示例（CC0/CC-BY）
- 自行创建的 VRM 角色
- 明确授权的第三方 VRM

**元数据保留**:
- VRM 内嵌的作者、授权和署名信息在 `vrm.meta` 中保留
- 商业发布需使用完全授权的角色与声音

## 未实现功能

留作后续产品集成：

1. **实时对话**
   - Eidolon 或等效服务接入
   - 麦克风输入与语音识别
   - 倾听/思考/说话状态可视化
   - 记忆与人格配置

2. **音素口型**
   - 当前是音量近似（AudioContext 频谱分析）
   - 需语音服务提供 phoneme/viseme 时间戳
   - 或使用预训练口型预测模型

3. **高级功能**
   - 多角色切换
   - VRM + Gaussian 混合场景深度融合
   - 弹簧骨骼物理（springBone）
   - 碰撞约束（constraints）
   - 正式 Viewer 集成与版本发布

## 文件清单

**新增文件**:
```
metaflow-viewer/experiments/desktop-portrait/
├── vrm-loader.mjs           (270 行) VRM 加载器
├── vrm-animation.mjs        (280 行) 动画控制器 + 音频分析
├── vrm-adapter.mjs          (240 行) PlayCanvas 适配器（备用）
├── test-audio.mjs           (120 行) 合成测试音频
├── vrm-loader.test.mjs      (150 行) VRM 加载器测试
└── browser-test.mjs         (70 行)  浏览器截图测试
```

**修改文件**:
```
metaflow-viewer/experiments/desktop-portrait/
├── package.json             (+2 deps: three, @pixiv/three-vrm)
├── package-lock.json        (+19 packages)
├── index.html               (更新 UI: VRM 文件选择、音频控制)
├── app.mjs                  (+180 行) VRM 集成逻辑
└── README.md                (+VRM 说明和授权信息)

docs/changes/165-desktop-portrait/
├── spec.md                  (更新验收项和实现状态)
└── plan.md                  (标记完成阶段)
```

## 使用方式

### 启动实验

```bash
cd metaflow-viewer/experiments/desktop-portrait
npm ci --ignore-scripts
npm run serve
# 打开 http://127.0.0.1:4176/
```

### 加载 VRM 角色

1. 点击「打开本地人像 · PLY / SOG / VRM」
2. 选择 `.vrm` 文件（需用户自备授权文件）
3. 调整校准参数：
   - 可见画布宽度（厘米）
   - 屏幕倾角（度）
   - 眼位相对屏幕中心（厘米）
   - 人像展示高度（厘米）
   - 脚点距屏幕下沿向后（厘米）
   - 人像朝向（度）

### 测试口型动画

1. 加载 VRM 后，「VRM 测试音频」区域显示
2. 点击「播放测试音频」
3. 观察角色嘴巴随音频张开
4. 点击「停止」结束播放

### 进入展示模式

1. 调整完毕后点击「进入展示」
2. 全屏显示，隐藏控制界面
3. 按 Escape 或点击「退出展示 · 调整」恢复

## 已知限制

1. **深度融合**: 当前 VRM 通过深度清除渲染在高斯之上；正式混合需深度融合
2. **音素对齐**: 口型是音量近似，不是准确音素时间轴
3. **表情兼容性**: 不同 VRM 的 expressions 名称可能不一致（blink/blinkLeft/blinkRight, aa/mouth）
4. **性能**: Three.js + PlayCanvas 双渲染器有一定开销，iPad 性能待实测
5. **iPad 音频**: iOS AudioContext 需用户手势，首次播放可能需交互
6. **浏览器验证**: Headless Chrome 截图成功，但未用真实 VRM 验证材质和动画

## 下一步行动

### 短期（浏览器 QA）

1. [ ] 在 Chrome/Safari 桌面版加载真实 VRM 1.0 文件
2. [ ] 截图验证材质渲染（MToon、透明度、纹理）
3. [ ] 录制 5-10 秒视频展示呼吸、眨眼、注视和口型
4. [ ] 检查 console 错误和性能指标
5. [ ] 上传截图/视频到 `/opt/cursor/artifacts/`

### 中期（对话集成设计）

1. [ ] 调研 Eidolon API（认证、请求格式、响应结构）
2. [ ] 评估 Fish Audio 或其他语音服务
3. [ ] 设计对话状态机（idle → listening → thinking → speaking → idle）
4. [ ] 实现麦克风输入和流式识别
5. [ ] 音素时间轴解析和口型映射

### 长期（产品集成）

1. [ ] iPad HTTPS 部署和实机测试
2. [ ] 头部追踪与 VRM 动画并发优化
3. [ ] VRM + Gaussian 深度融合渲染
4. [ ] 正式 Viewer 集成与版本发布
5. [ ] 多角色、记忆、人格配置系统

## 总结

✅ **代码实现完成**: VRM 1.0 加载、待机动画、注视、音频驱动口型  
✅ **测试通过**: 48 项自动化测试全部通过  
✅ **浏览器启动**: Headless Chrome 成功截图  
⏳ **待验收**: 真实 VRM 材质/表情/骨骼，iPad 实机性能  
🔄 **未实现**: 实时对话、音素口型、多角色切换

**提交**: `5bb87a91` on `codex/mf-165-desktop-portrait`  
**PR**: [#166 (Draft)](https://github.com/Shuang-su/Metaflow/pull/166)  
**日期**: 2026-11-13
