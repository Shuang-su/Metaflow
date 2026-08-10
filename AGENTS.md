# Metaflow Agent Rules

`docs/metaflow-change-lifecycle-v1.0.md` 是唯一 MCL 规范。其 `status: candidate` 期间，MCL 只约束 MF-1 和 Proposal、Spec 或 Plan 明确指定的试点；其他任务不能宣称受尚未生效的仓库级政策约束。

## 权威顺序

1. system、developer 与当前用户指令；
2. 本文件与 MCL；
3. 已接受的 Issue、Proposal、Spec 和 Plan；
4. 可选工具、Skill、Plugin 与外部案例。

外部案例或单次 Plan 不能建立仓库政策。只有已应用并重新核验的自动化或权限可以称为 enforced control。

## 开始前

1. 检查 `git status --short --branch`、upstream 和相关 diff，保护已有改动与未跟踪文件。
2. 有 Issue 时使用 `MF-<issue-number>`；无 Issue 的简单任务只在需要标识时使用 `MF-T0-<date>-<slug>`。
3. 根据 `metadata/components.json` 判断组件，并按用户影响、不可逆性、公共契约、安全、数据与发布影响判断风险。
4. 阅读 Issue 及适用的唯一 Spec/Plan；公共契约、跨组件和高风险任务使用隔离 branch/worktree。
5. Issue 一旦创建，确认它已写清背景、目标、包含/排除范围、验收、风险、状态和工件链接。

只读探索可以先于 Plan；产品、架构、兼容、迁移、安全边界和生产决策不可以。

## 选择流程

- 纯文档、治理、研究和无行为机械维护可直接实施、本地检查并 Commit；Issue/PR 可选。
- 小型兼容修复和已有契约内的常规资源可使用 Request 或轻量 Issue，经定向验证后 Direct Commit 或 PR。
- 新产品行为、公共数据契约和跨组件实现使用 Issue、唯一 Spec、唯一 Plan 与 PR。
- 架构、安全、破坏性迁移、重大上游同步和正式生产变化按需要增加 Proposal/ADR、迁移、回滚和观察。
- T0–T3 是风险标签，不自动展开固定长流程。RED/GREEN/REFACTOR 只用于适合测试先行的行为代码。

资源按常规、大型/新增入口、结构性三档判断。公开资源变化即使 Direct Commit 也必须更新 PATCH、Viewer Ledger 和 Version History；staging 不提升版本。详细阈值与版本规则见 MCL。

## 实施中

- 只实现已授权范围；出现新的高影响决策时返回 Issue、Proposal 或 Spec。
- 不重置用户历史、不覆盖无关工作、不删除未跟踪研究。
- Commit 保持原子和简洁；无 Issue/PR 的直接提交只允许简短 `Validation:`、`Release:`、`Refs:` trailer。
- 验证命令由 Plan、变更路径和风险决定；`scripts/ci-routing.mjs` 是本地检查选择器，不代表 GitHub 必需 Gate。
- 物质性外部写入、失败、验证和未运行检查写入 PR、Issue 或直接提交交付；外部写入后重新读取。
- 完整交流由 Codex 任务链接承担，仓库不默认保存完整用户请求、Agent 回复或重复 Plan。
- 不要求 subagent；只有当前指令允许且工作可独立时才使用。
- Spec compliance 与 code/document quality 分开自查；只有不同非实现作者可以称 independent review。

## Completion Contract 与完成

- 有 PR：PR 记录实际结果、验收映射、验证、未运行项、偏差、风险、回退和后续。
- 无 PR 但有 Issue：在 Issue 的完成交付中回填 Commit、验证、未运行项和遗留事项。
- Issue/PR 都没有：commit trailer 与最终 Codex 回复共同说明实际结果。
- 产品发布另外更新对应 Ledger 与 Version History；二者不是通用 Completion Contract。

Task Record、Completion Dossier、Manifest 和全文 transcript 仅在合规、事故、破坏性迁移、正式发布或用户明确要求的审计模式中生成。旧 MF-1/MF-9 档案仍可使用：

```bash
node scripts/mcl.mjs check docs/changes/1-adopt-mcl-v1 --strict
```

新 Change 没有 legacy manifest 时，不运行 `generate`，也不因缺少 completion 目录失败。

## 组件与版本边界

- `viewer`、`editor`、`design`、`data`、`platform`、`reference` 是独立所有权域。
- Design 研究没有获准 Experiment Promotion Proposal 时不构成产品行为。
- 上游快照是不可变参考；同步必须作为 Change，而不是覆盖。
- Version History 与 Ledger 只追加；回滚通过新记录表达。
- Viewer 当前保持 `5.18a / 5.18.0`；下一次真实发布为 `5.18.1`，此后新 entry 使用完整 SemVer 且 `displayVersion === appSemver`。历史字母版本不改写。
- Editor 保持独立版本、Ledger 和 Version History。
