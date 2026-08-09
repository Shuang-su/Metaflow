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
2. T1–T3 使用 GitHub Issue 号作为 `MF-<issue-number>`；无 Issue T0 使用 `MF-T0-<date>-<slug>`。
3. 根据 `metadata/components.json` 判断组件和风险。
4. 阅读 Issue 及适用的唯一 Spec/Plan；T2/T3 使用隔离 branch/worktree。
5. 确认 Issue 已写清背景、目标、包含/排除范围、验收、风险、状态和工件链接。

只读探索可以先于 Plan；产品、架构、兼容、迁移、安全边界和生产决策不可以。

## 实施中

- 只实现已授权范围；出现新的高影响决策时返回 Issue、Proposal 或 Spec。
- 不重置用户历史、不覆盖无关工作、不删除未跟踪研究。
- Commit 保持原子和简洁，不复制 Issue、Plan 或对话全文。
- 物质性外部写入、失败、验证和未运行检查写入 PR；外部写入后重新读取。
- 完整交流由 Codex 任务链接承担，仓库不默认保存完整用户请求或 Agent 回复。
- 不要求 subagent；只有当前指令允许且工作可独立时才使用。
- Spec compliance 与 code quality 分开自查；只有不同非实现作者可以称 independent review。

## 完成

完成交付以 Issue 和 PR 为准：

- Issue 验收逐项确认，状态更新为 Done/Released/Observing 等实际状态；
- PR 列出实际变更、检查、未运行项、偏差、风险、回退和后续工作；
- Issue 链接最终 PR、squash commit、Spec/Plan 和 Evidence；
- 最终回复提供这些链接，不复制完整档案。

Task Record、Completion Dossier、Manifest 和全文 transcript 仅在合规、事故、破坏性迁移、正式发布或用户明确要求的审计模式中生成。旧 MF-1 档案仍可使用：

```bash
node scripts/mcl.mjs check docs/changes/1-adopt-mcl-v1 --strict
```

新 Change 没有 legacy manifest 时，不运行 `generate`，也不因缺少 completion 目录失败。

## 组件边界

- `viewer`、`editor`、`design`、`data`、`platform`、`reference` 是独立所有权域。
- Design 研究没有获准 Experiment Promotion Proposal 时不构成产品行为。
- 上游快照是不可变参考；同步必须作为 Change，而不是覆盖。
- Version History 只追加；回滚通过新记录表达。
