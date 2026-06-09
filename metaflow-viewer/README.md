# Metaflow Viewer Package

这是 Metaflow Viewer 的前端包。完整版本追踪、版本规则和最近发布记录见仓库根目录 `README.md` 与 `metadata/version-history.json`。

## 当前版本

- 展示版本：`4.2b`
- 包版本：`4.2.0`
- 上游 SuperSplat Viewer：`v1.18.2`
- PlayCanvas：`2.17.1`

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
