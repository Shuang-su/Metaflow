# Metaflow Viewer 包

这是 Metaflow Viewer 的前端包。当前使用说明见
[`docs/getting-started/viewer.md`](../docs/getting-started/viewer.md)，完整文档入口见
[`docs/README.md`](../docs/README.md)，逐提交审计见
[`docs/metaflow-viewer-change-ledger.md`](../docs/metaflow-viewer-change-ledger.md)。

## 当前版本

- 展示版本：`5.18.1`
- 包版本：`5.18.1`
- 上游 SuperSplat Viewer：`v1.26.2`
- PlayCanvas：`2.19.2`

权威来源是 [`metadata/version-history.json`](../metadata/version-history.json)，本页只是当前摘要。

## 本地运行

```bash
npm ci
npm run build
npx --no-install serve -s public -l 3000
```

服务运行在 `http://localhost:3000`，`-s` 为 `/acg/...` 等深层路径提供 SPA fallback。

稳定 route 的开发模式分两个终端：

```bash
# 终端 1
npm run watch

# 终端 2
npx --no-install serve -s public -l 3000
```

当前 `npm run develop` 使用不带 `-s` 的静态服务器，只适合根路径或直接 query 调试，不能单独证明深层 route 可访问。URL 参数和实际覆盖顺序见 [`docs/reference/viewer-url-parameters.md`](../docs/reference/viewer-url-parameters.md)，问题分层见 [调试与性能分析](../docs/guides/debug-and-profile.md)。

## 验证

```bash
node --test tests/*.mjs
npm run type:check
npm run build
```
