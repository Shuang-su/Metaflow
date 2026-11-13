# VRM/Gaussian 渲染集成技术说明

## 渲染架构

### 双渲染器共享 WebGL 上下文

```
PlayCanvas Application (WebGL2)
  ↓
  创建 PlayCanvas GraphicsDevice
  ↓
  获取 WebGL context (gl)
  ↓
  Three.js WebGLRenderer 共享同一 context
```

**实现代码** (`app.mjs` ~line 235):
```javascript
threeRenderer = new THREE.WebGLRenderer({
    canvas: canvas,
    context: app.graphicsDevice.gl,  // 共享 PlayCanvas 的 WebGL 上下文
    alpha: true,
    premultipliedAlpha: true,
    antialias: false
});
threeRenderer.autoClear = false;  // 关键：不自动清除
```

### 渲染顺序与深度处理

**当前实现** (`app.mjs` ~line 510):
```javascript
app.on('frameend', () => {
    if (modelType === 'vrm' && vrmInstance && threeRenderer && threeCamera) {
        // 1. PlayCanvas 已完成渲染（高斯 splat、桌面、阴影）
        
        // 2. 同步 Three.js 相机
        syncCameraToThreeJS();
        
        // 3. 清除深度缓冲
        const gl = app.graphicsDevice.gl;
        gl.clear(gl.DEPTH_BUFFER_BIT);  // ← 关键操作
        
        // 4. 渲染 VRM
        threeRenderer.render(threeScene, threeCamera);
    }
});
```

### 深度清除的含义与限制

**为什么清除深度**:
- PlayCanvas 和 Three.js 使用独立的场景图和变换层次
- PlayCanvas 渲染的高斯 splat 已写入深度缓冲
- 如果不清除，VRM 可能被高斯错误遮挡（深度测试失败）
- 清除深度后，VRM 总是渲染在高斯"之上"（视觉层叠，非空间混合）
- Three.js renderer state is reset (`threeRenderer.state.reset()`) before rendering to prevent WebGL state cache conflicts

**限制** ⚠️:
1. **不支持真实空间遮挡**: VRM 不能被高斯遮挡，也不能遮挡高斯  
   **IMPORTANT**: Because depth is cleared, **mixed occlusion is not supported**. VRM always draws on top. This is an architectural tradeoff for using two separate rendering engines - there is no unified depth buffer.
2. **渲染顺序固定**: 高斯永远在后，VRM 永远在前
3. **混合场景问题**: 如果 VRM 角色应该站在高斯物体"后面"，当前实现无法正确表达
4. **透明度排序**: VRM 的透明部分与高斯之间没有正确的深度关系

**适用场景**:
- ✅ VRM 角色站在桌面上（与高斯分离）
- ✅ 高斯作为展示物，VRM 作为解说员（分层布局）
- ❌ VRM 角色穿过高斯场景（需要深度融合）
- ❌ VRM 与高斯物体交错（需要统一深度缓冲）

### 正确的深度融合方案（未实现）

如果需要真实混合，应该：

1. **统一深度缓冲**:
   - 不清除深度，让 VRM 参与 PlayCanvas 的深度测试
   - 需要 Three.js 和 PlayCanvas 的 NDC 空间完全一致

2. **统一变换体系**:
   - VRM 场景节点作为 PlayCanvas 实体的子节点
   - 或手动同步世界变换矩阵到 Three.js

3. **状态缓存管理**:
   - PlayCanvas 和 Three.js 都会缓存 WebGL 状态
   - 切换渲染器时需要显式同步状态（blend, depth, stencil, viewport）

4. **透明度排序**:
   - 收集所有透明物体（PlayCanvas + Three.js）
   - 统一排序后渲染

**当前不实现深度融合的原因**:
- 首轮原型验证空间校准和动画集成
- 深度融合需要大量状态同步和变换对齐工作
- 独立桌面人像场景不需要复杂遮挡
- 保持代码简洁，降低调试复杂度

## WebGL 状态管理

### PlayCanvas 状态缓存

PlayCanvas `GraphicsDevice` 维护 WebGL 状态缓存：
- Blend mode, depth test, cull face
- Active texture units, bound textures
- Shader program, vertex/index buffers
- Viewport, scissor test

### Three.js 状态管理

Three.js `WebGLRenderer` 也维护状态缓存：
- `WebGLState` 跟踪当前 WebGL 状态
- `setBlending()`, `setDepthTest()` 等方法

### 共享上下文的风险

**潜在问题**:
1. PlayCanvas 设置状态 → Three.js 不知道 → 状态冲突
2. Three.js 修改状态 → PlayCanvas 缓存过期 → 下一帧错误
3. 纹理单元绑定冲突
4. FBO (Framebuffer Object) 绑定冲突

**当前缓解措施**:
- `threeRenderer.autoClear = false`: 避免清除 PlayCanvas 的颜色缓冲
- 深度清除手动调用 `gl.clear(gl.DEPTH_BUFFER_BIT)`: 不依赖 Three.js 缓存
- `frameend` 事件: 确保 PlayCanvas 完成渲染后才调用 Three.js

**未验证的风险**:
- [ ] Blend mode 冲突（透明 VRM 材质 vs 高斯 alpha）
- [ ] Depth write 状态（Three.js 可能关闭深度写入）
- [ ] Viewport 设置（resize 时两个渲染器是否同步）
- [ ] Stencil buffer 使用（如果 PlayCanvas 或 Three.js 启用）

### 推荐审查项

**独立审查者应检查**:
1. 打开浏览器 DevTools → Performance → Record
2. 加载 VRM 并观察 1 分钟
3. 检查 WebGL 调用顺序和状态变化
4. 验证没有冗余的状态设置（表示缓存失效）
5. 用 Spector.js 或 WebGL Inspector 捕获帧

**测试用例**:
- 透明 VRM 材质 + 高斯 splat 混合
- 快速切换 VRM/Gaussian 模型
- Resize 窗口后验证两个渲染器的 viewport
- 长时间运行检查内存/纹理泄漏

## 相机投影同步

### PlayCanvas 相机参数

```javascript
const cam = camera.camera;  // PlayCanvas CameraComponent
threeCamera.fov = cam.fov;                    // 垂直 FOV (度)
threeCamera.aspect = cam.aspectRatio;         // 宽高比
threeCamera.near = cam.nearClip;              // 近裁剪面
threeCamera.far = cam.farClip;                // 远裁剪面
threeCamera.updateProjectionMatrix();
```

### 离轴投影支持 ✅ **已实现**

PlayCanvas 支持 `camera.projectionOffset` (x, y) 以实现校准的离轴投影。Three.js 的 `PerspectiveCamera` 没有直接等效 API。

**当前实现** (app.mjs ~line 520):
```javascript
// CRITICAL: Copy full projection matrix including off-axis offset
const pcMatrix = cam.projectionMatrix;
if (pcMatrix && pcMatrix.data) {
  // PlayCanvas uses column-major 4x4 matrix
  const m = pcMatrix.data;
  threeCamera.projectionMatrix.set(
    m[0], m[4], m[8],  m[12],
    m[1], m[5], m[9],  m[13],
    m[2], m[6], m[10], m[14],
    m[3], m[7], m[11], m[15]
  );
  threeCamera.projectionMatrixInverse.copy(threeCamera.projectionMatrix).invert();
}
```

**正确性**:
- ✅ Three.js 相机使用与 PlayCanvas 完全相同的投影矩阵
- ✅ 包含离轴偏移（calibrated eyepoint）
- ✅ VRM 透视与高斯/桌面完全一致
- ✅ 支持任意眼位，不局限于屏幕中心

**测试验证**:
- 改变 eye X/Y/Z 和 tilt 值
- VRM 脚部与桌面的对齐应保持正确
- VRM 头部 lookAt 应正确朝向相机位置

## 坐标系对齐

### PlayCanvas 坐标系
- 右手系：X 向右，Y 向上，Z 向前（朝向观察者）
- Quaternion 旋转

### Three.js 坐标系
- 右手系：X 向右，Y 向上，Z 向前（朝向观察者）
- 与 PlayCanvas 一致 ✅

### VRM 坐标系
- 符合 glTF 2.0：右手系，Y 向上
- VRM 1.0 定义 +Z 为角色前方（朝向观察者时为 -Z）
- 通过 VRM humanoid 的 T-pose 和零旋转定义

### 变换同步

```javascript
const worldTransform = personRoot.getWorldTransform();  // PlayCanvas
const pos = worldTransform.getTranslation();
const rot = worldTransform.getRotation();
const scl = worldTransform.getScale();

vrm.scene.position.set(pos.x, pos.y, pos.z);
vrm.scene.quaternion.set(rot.x, rot.y, rot.z, rot.w);
vrm.scene.scale.set(scl.x, scl.y, scl.z);
```

**关键点**:
- PlayCanvas `personRoot` 实体位于桌面坐标系
- VRM 场景的变换直接复制 PlayCanvas 世界变换
- 坐标系一致，不需要轴转换
- 旋转用四元数，避免欧拉角万向锁

## 材质兼容性

### PlayCanvas 材质
- StandardMaterial (PBR)
- Gaussian Splat（自定义渲染器）

### Three.js/VRM 材质
- MToon（卡通渲染，VRM 标准）
- StandardMaterial (PBR)
- UnlitMaterial

### 光照

**PlayCanvas 场景**:
- 高斯 splat 不使用光照（baked）
- 桌面使用 `useLighting: false` + emissive map

**Three.js 场景**:
- 添加 DirectionalLight (1.2 强度)
- 添加 AmbientLight (0.6 强度)
- VRM 材质响应光照

**不一致**:
- 高斯和 VRM 的光照环境不同
- VRM 看起来可能比高斯"更亮"或"更暗"
- 需要手动调整光照强度以匹配视觉

## 性能考虑

### 双渲染器开销
- 两套场景图遍历
- 两套状态管理
- 可能的状态缓存失效

### 高斯 Splat 性能
- PlayCanvas GSplat 插件：排序 + 渲染
- 依赖顶点着色器和片段着色器

### VRM 性能
- 骨骼动画：CPU 骨骼矩阵计算
- 表情动画：Morph target blending
- LookAt：每帧头部/眼睛骨骼旋转
- MToon 材质：额外的 outline pass

### 移动设备 (iPad)
- WebGL2 性能依赖 GPU
- 骨骼动画在 CPU 上可能成为瓶颈
- Headless 测试不能反映真实 iPad 性能

**待实机验证**:
- [ ] 30 fps 稳定性
- [ ] 温升和节流
- [ ] 电池消耗
- [ ] 头部追踪 + VRM 动画并发

## 总结

### 当前实现的权衡

✅ **优点**:
- 快速原型验证 VRM 集成
- 最小化代码改动（不重构 PlayCanvas 场景）
- 独立桌面人像场景工作良好

⚠️ **限制**:
- 不支持 VRM 与高斯的真实深度混合
- 离轴投影未完全复制到 Three.js
- WebGL 状态同步未经充分验证
- 性能开销未在真实设备测量

### 后续改进方向

1. **深度融合** (if needed):
   - 统一深度缓冲
   - 状态缓存显式同步
   - 透明度统一排序

2. **投影对齐**:
   - 直接复制 PlayCanvas 投影矩阵到 Three.js
   - 验证极端眼位下的透视一致性

3. **单渲染器架构**:
   - 将 VRM 解析为 PlayCanvas 实体
   - 或将高斯 splat 移植到 Three.js
   - 消除双渲染器开销

4. **性能优化**:
   - 骨骼动画移到 GPU（vertex shader）
   - LOD 控制 VRM 细节
   - 动态禁用不可见的动画更新

---

**文档日期**: 2026-11-13  
**实现版本**: commit 505bcadd on `codex/mf-165-desktop-portrait`  
**状态**: 深度清除方案工作但有明确限制；深度融合留作后续
