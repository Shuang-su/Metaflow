# Plan

## Scope

- 修复 production/tagged Viewer build 在 Supabase sink 下缺少 endpoint 时静默关闭 analytics 的问题。
- 为 Netlify production context、controlled release build 和 production smoke 固定并验证 collector endpoint。
- 将产品修复登记为 Viewer PATCH `5.19.2`，不改写已发布的 `5.19.1` tag、版本记录或线上历史。
- 上线后用真实浏览器请求和 Supabase 只读查询确认事件恢复。

## Acceptance

- endpoint 缺失的 production build 直接失败；带 endpoint 的 build 生成正确 HTML meta。
- Viewer `5.19.2`、`92d11b0`、87 条资源索引在 immutable 与 production URL 一致。
- collector 请求返回 HTTP 200，Supabase 能看到 `session_started`、`page_viewed`、`session_heartbeat` 等事件。
- 测试、MCL、release contract、平台校验和 publish hygiene 通过。

## Risks and limits

- Netlify 本次使用用户已授权的 CLI artifact publish；其 API provenance 为 `deploy_source=cli`、`commit_ref=null`，不冒充 Git deploy。
- 本次自动化浏览器验证不是实体 iPad；iPad/Safari 的真实触摸、pointer capture 与横竖屏行为仍需设备专项复测。
- Supabase schema、migration、Edge Function 和既有 RLS advisory 不在本次变更范围内。
