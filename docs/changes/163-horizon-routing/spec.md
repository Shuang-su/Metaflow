# MF-163 — Horizon 入口契约

关联：Shuang-su/Metaflow#163、Shuang-su/metaflow-horizon#129。所有权 platform，风险 T2。用户于 2026-11-13 批准独立站点上线及路由接入。

正式入口为 https://metaflow.shuang-su.com/horizon/ 。`/horizon` 和 `/horizon/*` 在 SPA 通配前一跳代理至同 Netlify 团队的独立静态站，浏览器保持正式域名。Horizon 文件实际位于 `/horizon/` 下，未知文章由目标站返回真实 404，不落到 Metaflow 首页。

不更改 Viewer、Editor、Director 的产品代码或版本。公开站点配置与 Git 当前状态分别记录，初次路由发布以实时生产部署文件清单为准；不构建未发布的本地产品变化。Horizon 日常发布独立进行。

验收：两种首页入口、深层文章刷新、CSS/JS/图片、搜索、RSS、sitemap、canonical、真实 404，以及主站首页、查看器深链、编辑器、Director 和 build.json。所有线上文件哈希除 netlify.toml 外与发布前一致。保留可直接恢复的生产部署 ID。
