# Metaflow Viewer

基于 [SuperSplat Viewer](https://github.com/playcanvas/supersplat-viewer) 构建的 3D Gaussian Splatting 浏览器。

## 快速开始

```bash
# 安装依赖
npm install

# 构建项目
npm run build

# 启动服务器
npm run serve
# 或
npm start
```

服务器将在 http://localhost:3000 启动。

## 开发模式

```bash
# 开发模式（自动重新构建 + 服务器）
npm run develop
```

## 使用方式

### 1. URL 路由（推荐）

直接访问路由路径即可加载对应资源：

```
http://localhost:3000/acg/ad05/delta-force
http://localhost:3000/acg/ad05/frieren
http://localhost:3000/acg/yzx/yzx
```

路由信息来自 `/data/index.json`。

### 2. URL 参数

也可以使用 URL 参数指定内容：

```
http://localhost:3000/?content=/data/path/to/model.sog&settings=/data/path/to/settings.json
```

支持的参数：
| 参数 | 说明 |
|------|------|
| `content` | 模型文件路径 (.sog / .compressed.ply) |
| `settings` | 设置文件路径 (.json) |
| `poster` | 加载时显示的图片 |
| `skybox` | 天空盒图片 |
| `noui` | 隐藏 UI |
| `noanim` | 禁用动画 |

## 项目结构

```
metaflow-viewer/
├── src/                    # 源代码
│   ├── index.html          # HTML 模板（含路由配置）
│   ├── index.scss          # 样式
│   ├── index.ts            # 入口
│   └── ...                 # 其他模块
├── public/                 # 构建产物
│   ├── index.html
│   ├── index.css
│   ├── index.js            # 打包后的 JS (含 PlayCanvas 引擎)
│   ├── data -> ../../data  # 数据目录软链接
│   └── serve.json          # 服务器配置（SPA 路由）
├── package.json
├── rollup.config.mjs
└── tsconfig.json
```

## 数据目录

`/data/index.json` 包含所有资源的索引信息：

```json
{
  "resources": [
    {
      "id": "delta-force",
      "title": "三角洲",
      "route": "/acg/ad05/delta-force",
      "files": {
        "model": "ACG/AD05/.../Delta Force.sog",
        "settings": "ACG/AD05/.../settings.json"
      }
    }
  ]
}
```

## 部署

构建后的 `public/` 目录可以直接部署到任何静态服务器。

**注意**：需要配置服务器支持 SPA 路由（将所有路径重定向到 index.html，除了 /data/ 等静态资源）。

Nginx 配置示例：

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```
