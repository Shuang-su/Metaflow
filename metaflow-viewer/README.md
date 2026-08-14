# Metaflow Viewer 包

这是 Metaflow Viewer 的前端包。当前使用说明见
[`docs/getting-started/viewer.md`](../docs/getting-started/viewer.md)，完整文档入口见
[`docs/README.md`](../docs/README.md)，逐提交审计见
[`docs/metaflow-viewer-change-ledger.md`](../docs/metaflow-viewer-change-ledger.md)。

## 当前版本

- 展示版本：`5.19.1`（production stable）
- 包版本：`5.19.1`
- 活跃源码底层：SuperSplat Viewer `v1.29.1`
- PlayCanvas：`2.21.3`

Viewer `5.19.1` 已正式发布到生产。`metadata/version-history.json` 记录 `v1.29.1` 运行时产品 SHA `26e311c` 与发布控制修复 SHA `534b013`；`viewer-v5.19.0` prepare 在 deployment 前失败且从未进入生产，实际升级路径是 `5.18.1 -> 5.19.1`。D2 controlled Prepare 通过后，因 Netlify Git build 再次停滞，经明确授权使用精确 D2 CLI/API fallback 发布；production smoke 和 15 分钟观察均通过。

## 本地运行

```bash
npm ci
npm run build
npx --no-install serve -s public -l 3000
```

服务运行在 `http://localhost:3000`，`-s` 为 `/acg/...` 等深层路径提供 SPA fallback。

排查 PlayCanvas 引擎断言或内部状态时，可以显式选择 development export：

```bash
ENGINE=debug npm run build
```

该命令只用于诊断；普通 `npm run build` 仍使用 PlayCanvas production/default export，部署流程也不会自动启用 Debug Engine。

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
