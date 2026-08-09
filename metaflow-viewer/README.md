# Metaflow Viewer 包

这是 Metaflow Viewer 的前端包。当前使用说明见
[`docs/getting-started/viewer.md`](../docs/getting-started/viewer.md)，完整文档入口见
[`docs/README.md`](../docs/README.md)，逐提交审计见
[`docs/metaflow-viewer-change-ledger.md`](../docs/metaflow-viewer-change-ledger.md)。

## 当前版本

- 展示版本：`5.18a`
- 包版本：`5.18.0`
- 上游 SuperSplat Viewer：`v1.26.2`
- PlayCanvas：`2.19.2`

权威来源是 [`metadata/version-history.json`](../metadata/version-history.json)，本页只是当前摘要。

## 本地运行

```bash
npm ci
npm run build
npm run serve
```

服务默认运行在 `http://localhost:3000`。

开发模式：

```bash
npm run develop
```

## 验证

```bash
node --test tests/*.mjs
npm run type:check
npm run build
```
