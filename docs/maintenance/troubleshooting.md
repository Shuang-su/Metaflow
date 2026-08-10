# 故障排查

先判断错误位于 route/index、文件、settings、渲染、碰撞、构建还是托管 CI；不要一开始就清 cache、重装全部依赖或重建所有产品。

## Viewer

| 症状 | 优先检查 | 常见处理 |
|---|---|---|
| 稳定 route 黑屏，直链正常 | `data/index.json` 的 route/alias/files | 重新生成 index，检查 slug/override |
| 本地深层 route 直接 404，根路径 query 正常 | 静态服务器没有 SPA fallback | 使用 `npx --no-install serve -s public -l 3000`，不要只依赖当前 `npm run develop` |
| 请求 `scene.compressed.ply` 404 | route 未命中且未给 `content` | 检查 pathname、URL 编码和 index |
| `settings.json` 解析失败 | schema 版本、必需字段、无效 JSON | 从 Editor 重新导出；按 v2 schema 修复 |
| 模型 404 或只有 LFS pointer | 文件路径、LFS 对象、部署同步 | 核对 `.gitattributes`、托管对象和 data 路径 |
| WebGPU 初始化失败 | 浏览器/驱动/HTTPS | 临时加 `?webgl`，再定位能力问题 |
| 首帧出现后无法 Walk | voxel/collision、坐标系、空间范围 | 检查 index `viewer` 策略和碰撞 Network |
| 新 route 仍指向旧资源 | index cache 与资源 immutable cache | 确认 index 已重新验证；使用新资源名 |
| 动画自动播放不符合预期 | settings startMode、index exit policy、`noanim` | 分层核对，不把 URL 开关写回资源配置 |

## Editor

| 症状 | 优先检查 | 常见处理 |
|---|---|---|
| `npm ci` 拒绝 | Node 与 lockfile | 使用 `.nvmrc` 的 Node `20.19.0`，不手改 lock |
| 修改源码但 `/editor` 不变 | `dist/` 尚未进入 tracked 部署镜像 | 从 `supersplat-v2.28.0` 构建，再按 [部署说明](deployment.md#editor-release-staging) 预览并同步到 `metaflow-editor/` |
| 只有 HTML/ZIP，没有平台资源 | 导出类型 | 导出模型/SOG 与 settings-only，按 data/index 发布 |
| legacy ZIP 打开但平台 route 异常 | ZIP 契约不含 index/environment/voxel | 检查平台资源目录与 index |
| 大项目加载/导出停滞 | 浏览器内存、流式读取、文件 API | 保留上游 streaming 路径，查看控制台进度与错误 |

## Data 与生成器

- 多个 settings：生成器可能按排序选择错误文件，增加显式 override。
- streaming 与 legacy 同时存在：检查 model override 是否故意优先 streaming。
- 只有独立 compressed PLY：当前生成器不会把它作为 route 主模型；改用 SOG/streaming，或仅通过 direct URL/legacy package 验证。
- duplicate route：调整 slug 或 alias，不删除另一个资源的稳定 URL。
- `totalResources` 不一致：不要手改计数，重新生成。
- `data/*-version-history.json` 不一致：从 metadata 源重新镜像。

## 本地检查路由与按需 CI

| 症状 | 说明 |
|---|---|
| `route` 报 unowned | 路径没有组件 owner；更新 ownership 或放入正确目录 |
| `route` 报 unrouted | 路径没有本地检查路线；补规则和正负测试 |
| 建议检查明显过多 | 核对 base/head 路由并集和混合路径；不要为了减少检查而缩小 router |
| 手动 workflow 没有运行某项 | 先确认是否显式触发、当前 ref 与 router 输出；普通 PR/push 不再自动要求聚合 Gate |
| dependency review 在非 PR 场景 skipped | 预期行为；按需要在 PR 或专门依赖审查中运行 |

先在本地运行 `node scripts/ci-routing.mjs route --base origin/main`，确认 `paths`、`routes`、`checks`、`unowned` 和 `unrouted`。GitHub Actions 当前按需手动运行，不是通用完成条件；实际本地结果记录在 PR、Issue 或直接提交交付。

## 仍无法定位

创建 Issue 时写清：复现 URL/route、浏览器与设备、Network/console 摘要、期望与实际、版本事实、包含/排除范围和验收。不要粘贴 token、完整用户数据或无法脱敏的资源。

需要形成 route/direct、WebGPU/WebGL、LOD 和效果对照时，使用 [调试与性能分析](../guides/debug-and-profile.md)。
