# Metaflow Viewer 5.26.0 和 Editor 1.4.0 发布记录

将 104 条既有入口、九个人像重建、统一后的深圳场景和 Editor 1.4.0 放在同一份 Netlify 候选内。此记录提交部署清单与源码锚点供审查。发布包的实际模型文件由 Netlify 静态文件上传提供。

Viewer 默认使用经核对的 v3。Director 经同源 v2 路径读取兼容资产。旧部署和九个人像原来的资源地址保留。初号机的原始重建 PLY 归档独立于发布。

配置、实物包和路由索引的版本见 `metadata/netlify-releases/viewer-v5.26.0.json`。生产切换以最终构建、版本检查、隔离部署按路由读回及浏览器实绘通过为准。回退目标为记录中的旧 Netlify 部署。
