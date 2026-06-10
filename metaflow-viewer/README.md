# Metaflow Viewer Package

这是 Metaflow Viewer 的前端包。完整使用说明见仓库根目录
[`README.md`](../README.md)，逐提交审计见
[`docs/metaflow-viewer-change-ledger.md`](../docs/metaflow-viewer-change-ledger.md)。

## 当前版本

- 展示版本：`5.4`
- 包版本：`5.4.0`
- 上游 SuperSplat Viewer：`v1.26.2`
- PlayCanvas：`2.19.2`

## 本地运行

```bash
npm install
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
npm run build
```
