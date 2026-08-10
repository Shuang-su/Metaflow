# Change 状态与历史注册表

本目录保存长期技术契约和历史 Change 证据。文件存在不表示它仍是当前政策，也不表示新任务要复制同样的工件。开始协作时先读当前 [MCL v1.0 candidate](../metaflow-change-lifecycle-v1.0.md)、实时 Issue 和本表；只有明确需要审计历史时才进入 legacy `completion/`。

## 如何判断一个工件

| 状态 | 含义 | 使用方式 |
|---|---|---|
| 现行 candidate | 当前唯一规范文本，但尚未激活为全仓强制政策 | 作为候选协作契约；遵守 `AGENTS.md` 的生效边界 |
| 当前契约 | 已接受、仍用于解释当前 candidate 的 Spec/Plan | 可引用，不重复全文；任务状态仍以实时 Issue 为准 |
| 已完成 | 实施已经结束，保留实际方案和证据 | 只用于维护与追溯；旧命令不自动沿用 |
| 已取代 | 后续 Change 改变了其流程或契约 | 只用于理解演进；执行时使用取代者 |
| Legacy 审计档案 | 为旧试点保留的 Dossier、Manifest、Task Record、transcript 等 | 仅显式审计模式读取；不能作为日常模板 |

## 当前注册表

| Change | 实时状态 | 仓库工件分类 | 当前含义 |
|---|---|---|---|
| [MF-1](https://github.com/Shuang-su/Metaflow/issues/1) | Open；等待独立激活决策 | Bootstrap + legacy 审计档案 | 初始 MCL candidate 和历史完成证据。`completion/`、旧 Gate 与全量归档要求不代表 Revision 6 默认流程；激活必须按实时 Issue 重新决策 |
| [MF-9](https://github.com/Shuang-su/Metaflow/issues/9) | Done | Legacy 审计档案 | Reference dependency/Editor ownership 的历史决策快照；严格档案兼容保留，不作为新任务模板 |
| [MF-16](https://github.com/Shuang-su/Metaflow/issues/16) | Done | 已完成、操作契约已取代 | 建立路径路由器时的 Spec/Plan；其中 PR/push 自动 CI 和 `required / gate` 已由 Revision 6 取消，路由器现在是本地检查选择器 |
| [MF-18](https://github.com/Shuang-su/Metaflow/issues/18) | Done | Revision 5，已取代 | 建立 Issue/Commit/PR/Spec/Plan 分层；四个 Gate 和旧状态链由 MF-28 进一步精简 |
| [MF-28](https://github.com/Shuang-su/Metaflow/issues/28) | Done | 当前 Revision 6 契约 | 本地优先流程、分级资源发布、Ledger/Version History 边界和 Viewer SemVer 前向规则 |
| [MF-32](https://github.com/Shuang-su/Metaflow/issues/32) | Done（本注册表进入 `main` 后） | 文档维护 | 分类历史工件、修正活动模板，并完善 25 篇中文 Viewer/Editor 手册；PR、Commit 与验证以实时 Issue 完成交付为准 |

## 权威顺序

1. 当前用户指令、`AGENTS.md` 与当前 MCL；
2. 实时 Issue 的背景、范围、验收与状态；
3. 该 Issue 链接的唯一 Spec/Plan；
4. 已完成或已取代的 Change，仅作为历史证据。

历史正文中的 `Ready`、四个 Gate、`required / gate`、Dossier/Manifest 或全量 transcript 都可能在当时正确，但不能覆盖当前 Revision 6。若历史文件与当前入口冲突，不要修改 legacy 证据来“统一措辞”；应更新实时 Issue、活动模板或本注册表。

## Legacy 完整性

MF-1、MF-9 的旧档案保持原位且不批量重写。需要核验 MF-1 时使用现有兼容命令：

```bash
node scripts/mcl.mjs check docs/changes/1-adopt-mcl-v1 --strict
```

新 Change 没有 legacy Manifest 时不运行 `generate`，也不因为缺少 `completion/` 判定失败。
