# Metaflow Viewer

Metaflow Viewer 是基于 SuperSplat Viewer 定制的 3D Gaussian Splatting 浏览器，服务于 `metaflow.shuang-su.com` 的资源浏览、流式 LOD、漫游、体素碰撞和 ACG 资源发布。

## 当前版本

| 字段 | 值 |
|------|----|
| 展示版本 | `4.2b` |
| 包版本 | `4.2.0` |
| 索引 schema | `1.1` |
| 截止 commit | `66e4311` |
| 更新时间 | `2026-06-06` |

版本来源是 `metadata/version-history.json`。线上公开记录由 `scripts/generate_index.py` 同步到 `data/version-history.json`，`data/index.json.release` 会暴露当前版本。

## 版本规则

- `package.json` 使用合法 semver，例如 `4.2.0`。
- 对外展示版本使用 `4.2b` 这样的双轨标签。
- 大版本按功能线划分：
  - `1.x`：初始 viewer、分享、加载体验、基础路由。
  - `2.x`：LOD 迁移、流式识别、加载阶段、冲突提示。
  - `3.x`：漫游、碰撞体素、移动端/第一人称控制。
  - `4.x`：动画策略、figure8、Firefly/2568 等资源发布。
- 小功能或修复递增数字小版本：`4.0`、`4.1`、`4.2`。
- 纯资源更新在当前代码版本后追加字母：`4.2a`、`4.2b`。

## 最近版本

| 版本 | 日期 | commit | 类型 | 摘要 |
|------|------|--------|------|------|
| `4.2b` | 2026-06-06 | `66e4311` | resource | add ACG 2568 route and Firefly thumbnails |
| `4.2a` | 2026-06-03 | `f1d95ff` | resource | use merged settings for Firefly Azur Lane |
| `4.2` | 2026-06-01 | `5df187a` | feature | add FireflyFes38 ACG resources |
| `4.1` | 2026-04-23 | `e3eab5b` | feature | enable synthetic figure-eight animation |
| `4.0a` | 2026-04-23 | `e67801c` | resource | add SZTU C1 and FES scenes |
| `4.0` | 2026-04-17 | `fac8405` | chore | add animation policy helpers |
| `3.20a` | 2026-04-15 | `4fe0e0f` | resource | restore Dayun to LFS while keeping Phoenix rollout |

完整 commit 级版本记录见 `metadata/version-history.json`。

## 运行

```bash
cd metaflow-viewer
npm install
npm run build
npm run serve
```

本地服务默认在 `http://localhost:3000`。

## 生成索引

```bash
./scripts/generate_index.py
```

生成内容：

- `data/index.json`
- `data/version-history.json`

## 验证

```bash
cd metaflow-viewer
node --test tests/*.mjs
npm run build
```
