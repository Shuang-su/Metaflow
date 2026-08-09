# Metaflow Change Lifecycle v1.0

## 完整交接、治理与实施方案

| 项目 | 内容 |
| --- | --- |
| 文档状态 | Proposed / 待实施 |
| 版本 | MCL 1.0 方案稿 |
| 日期 | 2026-08-09 |
| 适用仓库 | `Shuang-su/Metaflow` |
| 当前维护模式 | 个人维护者 + AI，兼容未来小型团队 |
| 目标读者 | 项目负责人、维护者、贡献者、Codex 及其他执行 Agent |
| 本文用途 | 完整问题交接、调研记录、方法定义、实施计划和验收契约 |

本文合并以下两份方案，并消除二者之间的命名、产物和生命周期重叠：

1. `Metaflow Agentic Spec-Driven Development 正式化方案`；
2. `Metaflow Change Lifecycle v1.0 完整方案`。

本文是后续实施的完整上位计划。它不会把方法论、仓库治理和具体产品功能混为一谈，也不会把研究资料自动视为已批准的产品能力。

---

## 1. 给 Codex 或其他执行工具的完整任务上下文

### 1.1 用户原始问题

以下内容保留用户原始问题，供后续 Agent 在没有当前聊天上下文时准确理解任务来源。

#### 问题一：识别流程、正式命名与开源项目参考

> [https://chatgpt.com/share/6a788411-d11c-83e8-afac-0871d9def42d](https://chatgpt.com/share/6a788411-d11c-83e8-afac-0871d9def42d) 看一下这个项目里面推进和项目改进的遵循一个什么流程，这个有正式的命名吗，他是学习了什么，这个流程最正式的应该怎么做，有没有项目范例，我想要在我的项目中运用这个逻辑 [Shuang-su/Metaflow](https://github.com/Shuang-su/Metaflow)；我们还能学习什么开源项目的流程 [playcanvas/supersplat](https://github.com/playcanvas/supersplat)，[playcanvas/supersplat-viewer](https://github.com/playcanvas/supersplat-viewer)，或者还有什么有名的项目；我用网页的 GPT 问了一遍，但是你不必完全采纳，你可以独立思考，再根据我们的实际情况做判断。

#### 问题二：把开发方法升级为 Change Lifecycle

> 我们是不是可以按 Agentic Software Development Methodology，中间 Design / Spec，换成你计划里面的 plan；和 Spec-Driven Development 一起来作为我们的方案；再加上 Metaflow 自己现有的 Ledger / Version History；将整套流程升级为 Change Lifecycle，引入 SuperSplat / SuperSplat Viewer、Proposal 进行学习；和现在的方案有什么不同；对比和分析，使得方案尽可能完善。

#### 问题三：形成完整交接包

> 结合两份方案，同时在完成时提交 Codex / 其他工具的用户完整问题、Agent 行动与回复摘要、完整计划全文，形成尽可能细节完善的方案计划，内容尽可能详实。

### 1.2 用户已经确认的关键选择

后续执行 Agent 不应再次询问已经确定的事项：

- 维护模式是“个人 + AI”，未来可能扩展到 SztuCode 规模的小型团队。
- 当前没有能稳定参与每个 PR 的第二位维护者。
- `aave-liquid-glass-lab`、Swiftgram Liquid Glass 研究和后续 UI 实验应纳入 Metaflow，但归属独立的 `design` 域。
- `design` 域未来可能成为 `metaflow.shuang-su.com/design`，因此后续 UI 改进需要考虑产品化路径。
- 第一阶段先建立规范文档，同时恢复绿色基线、Issue / PR / CI 和分支门禁。
- 后续需要完整建设 RFC / ADR、浏览器测试、视觉、性能、安全、发布和上游同步，而不是只做一份说明文档。
- 不能为了建立治理而丢失、重写或覆盖当前本地已有工作。

### 1.3 后续执行 Agent 的总目标

在不破坏现有工作树和产品行为的前提下，把 Metaflow 建设成一个具有以下能力的个人及小团队项目：

1. 每项变化都能从信号、提案、规格、实施、验证追溯到发布和运行反馈；
2. AI 可以高效执行，但不能自行改变已经批准的产品或架构决策；
3. 小改动保持轻量，大改动具有正式决策、迁移和回滚机制；
4. Viewer、Editor、Design、Data、Platform 和上游参考快照各自拥有明确边界；
5. 现有 Change Ledger 和 Version History 升级为发布后的权威审计系统；
6. SuperSplat / Viewer 的上游变化经过显式评估，而不是被动覆盖 Metaflow 定制；
7. 所有“完成”都有自动化或人工证据，不以 Agent 的文字声明代替验证。

---

## 2. Agent 已执行的行动与回复摘要

本节记录可审计的行动、结果和结论，不包含隐藏思维过程。

### 2.1 分享对话与 SztuCode 核验

Agent 通过浏览器读取了分享对话，并进一步在 GitHub 核验其关键案例：

- [SztuCode Issue #33](https://github.com/rojim666/SztuCode/issues/33) 包含背景、任务范围、验收标准和非目标；
- [SWE-bench 事件隔离 Design / Spec](https://github.com/rojim666/SztuCode/blob/main/docs/superpowers/specs/2026-08-08-swebench-event-scope-design.md) 包含问题、目标、非目标、方案比较、详细设计和测试设计；
- [Implementation Plan](https://github.com/rojim666/SztuCode/blob/main/docs/superpowers/plans/2026-08-08-swebench-event-scope.md) 把实现拆成 RED、最小实现、集成、全量验证和提交步骤；
- [PR #67](https://github.com/rojim666/SztuCode/pull/67) 链接 Issue，记录变更、验证结果、已知无关失败和非目标；
- Plan 明确要求使用 Superpowers 的 `subagent-driven-development` 或 `executing-plans`；
- 仓库还存在 Roadmap、Issue 模板、PR 模板、CODEOWNERS、Python CI 和 ADR 目录。

结论：该案例真实采用了 Superpowers 风格的 Agentic Development、Spec、Plan、TDD 和 PR 验证链，但目前只有一组 `docs/superpowers` Spec / Plan，更适合作为清晰案例，而不是长期成熟度已经得到证明的行业标准。

### 2.2 Metaflow 本地仓库核验

Agent 检查了本地 Git、目录结构、版本元数据、构建脚本和测试，得到以下事实：

- 本地 `main` 相对 `origin/main` 领先 9 个提交；这些提交主要涉及 Aave Liquid Glass 设计实验。
- `swiftgram-ios-liquid-glass-lab/` 当前未跟踪，不能在未审计来源、许可、敏感内容和体积前自动纳入版本控制。
- 当前仓库没有 `AGENTS.md`、根级 `CONTRIBUTING.md`、正式 Roadmap 或 `.github` 工作流。
- GitHub 远端当前没有开放或历史 PR、Issue、Actions 工作流、分支保护、Ruleset 和 Release 标签。
- Viewer `package.json` 为 `5.18.0`，结构化元数据展示版本为 `5.18a`，但根 README 仍出现 `5.17`，Project Index 仍引用更旧的 Viewer / 上游基线。
- `metadata/version-history.json` 当前 schema 为 `1.0`，包含 112 条 Viewer 历史记录，`documentedThrough` 为 `c613a87`。
- `metadata/editor-version-history.json` 当前记录 Metaflow Editor `1.1.0`，基于 SuperSplat `v2.28.0`。
- Viewer TypeScript 检查通过。
- Viewer 测试 52 项中 51 项通过；唯一失败来自版本历史测试把后续 `design-lab` 提交错误识别为 Viewer 产品提交。
- Editor 当前具备 lint 和 build，但没有独立自动化测试脚本。
- Aave Storybook 具备 typecheck、页面生成和静态 Storybook 构建脚本。
- Netlify 当前从 `metaflow-viewer` 构建并复制 Editor / Data，但生产构建命令没有先执行测试和类型检查。
- 仓库包含大体积数据和多个上游源码快照，不适合每个 PR 都进行无差别全量 checkout、LFS 下载和构建。

结论：Metaflow 已经具备非常有价值的事后审计能力，但缺少事前决策、变更边界、自动门禁和从 Proposal 到 Release 的统一追溯。

### 2.3 Metaflow 现有 Ledger / Version History 核验

Agent 阅读了：

- [`docs/metaflow-viewer-change-ledger.md`](./metaflow-viewer-change-ledger.md)；
- [`docs/metaflow-editor-change-ledger.md`](./metaflow-editor-change-ledger.md)；
- [`metadata/version-history.json`](../metadata/version-history.json)；
- [`metadata/editor-version-history.json`](../metadata/editor-version-history.json)。

这些材料已经能够回答：

- 为什么修改；
- 修改前用户看到什么；
- 实际代码、数据和部署发生了什么；
- 对用户产生了什么结果；
- 兼容风险、回滚关系和后续约束是什么；
- Editor / Viewer 分别基于哪个上游版本。

不足之处是它们主要从 commit 和已完成版本回溯事实，尚未稳定链接 Proposal、Spec、Plan、PR、CI Evidence、Release Tag 和部署结果。

### 2.4 SuperSplat / Viewer 核验

Agent 核验了当前 SuperSplat 和 SuperSplat Viewer 的 Issues、Discussions、CI、发布流程和代表性 PR：

- 两个仓库都启用了 Issues 和 Discussions；
- 仓库中没有正式 Proposal、RFC、ADR、Issue Template 或 PR Template 体系；
- SuperSplat 当前 PR CI 主要运行 build、lint 和 locale lint；
- Viewer 当前 PR CI 主要运行 build 和 lint；`package.json` 中的 `test` 仍是无真实测试的占位命令；
- Viewer 的 publish workflow 对 stable / beta、npm provenance 和 GitHub Release 处理较完善；
- [SuperSplat PR #1000](https://github.com/playcanvas/supersplat/pull/1000) 的 Summary、Motivation、Validation、Screenshots、Issue 链接、undo / redo、无障碍和多语言检查值得学习；
- [Viewer PR #273](https://github.com/playcanvas/supersplat-viewer/pull/273) 使用设备 / 渲染后端行为矩阵，并明确区分 stub 验证和真实硬件验证，适合作为兼容性证据范例。

结论：SuperSplat / Viewer 应作为产品变化表达、上游兼容、CI 和发布参考，而不应作为正式 Proposal 或测试治理的上限。

### 2.5 其他开源方法核验

Agent 进一步对比了以下项目：

- [Superpowers](https://github.com/obra/superpowers)：brainstorming、writing plans、worktree、TDD、review 和 evidence over claims；Metaflow 只把这些视为方法参考，不采用其 `subagent-driven-development` 作为默认执行器；
- [GitHub Spec Kit](https://github.github.com/spec-kit/)：Constitution、Specify、Plan、Tasks、Implement；
- [PlayCanvas Engine](https://github.com/playcanvas/engine/blob/main/.github/CONTRIBUTING.md)：大变化先讨论、小 PR、行为变化需要测试；
- [MapLibre GL JS](https://github.com/maplibre/maplibre-gl-js/blob/main/CONTRIBUTING.md)：Bug 先用失败测试证明、Draft PR、benchmark 和 AI 贡献责任；
- [Vite](https://github.com/vitejs/vite/blob/main/CONTRIBUTING.md)：playground fixture、开发 / 构建双模式 E2E；
- [Three.js](https://github.com/mrdoob/three.js/blob/dev/.github/CONTRIBUTING.md)：Examples、截图、E2E 和性能回归关注；
- [Rust RFC](https://github.com/rust-lang/rfcs)：重大变化才进入 RFC，保留动机、缺点和替代方案；
- [Godot Proposals](https://github.com/godotengine/godot-proposals)：模糊想法先 Discussion，成熟方案再 Proposal；
- [MADR](https://adr.github.io/madr/)：Context、Options、Decision、Consequences、Confirmation；
- [Kubernetes KEP](https://github.com/kubernetes/enhancements/tree/master/keps/NNNN-kep-template)：生产就绪、升级 / 降级、监控、版本偏差和发布门槛；
- [ISO/IEC/IEEE 12207:2026](https://www.iso.org/standard/90219.html)：软件生命周期过程框架，但不要求具体方法；
- [ISO/IEC 25010:2023](https://www.iso.org/standard/78176.html)：产品质量属性和验收维度。

### 2.6 前两轮回复形成的结论

第一轮方案把开发内核命名为 `Metaflow Agentic Spec-Driven Development`，重点建立风险分级、CI、分支保护、视觉 / 性能、发布和上游同步。

第二轮方案进一步确认：

- 最外层不应只以开发方法命名，而应升级为 `Metaflow Change Lifecycle`；
- Agentic Methodology 和 SDD 是 MCL 内部的开发内核；
- Proposal 应成为是否进入正式开发的前置门；
- Design / Spec 不能被 Implementation Plan 替代；
- Ledger / Version History 应成为生命周期中的正式发布后状态；
- 上游版本和 design 实验都应通过标准 Change 类型进入同一流程。

---

## 3. 最终方法定义与正式命名

### 3.1 正式名称

项目级正式名称为：

> **Metaflow Change Lifecycle（MCL）**

开发阶段的子方法名称为：

> **Metaflow Agentic Spec-Driven Development（Metaflow ASDD）**

二者不是竞争关系：

```text
Metaflow Change Lifecycle
├── Signal / Observation
├── Proposal Governance
├── Metaflow ASDD
│   ├── Change Spec
│   ├── Technical Design
│   ├── Implementation Plan
│   ├── Agentic Execution
│   └── Evidence / Review
├── Release Management
├── Change Ledger / Version History
└── Observation / Feedback / Upstream Input
```

可用以下公式表达：

```text
MCL = Proposal Governance
    + Agentic Software Development Methodology
    + Spec-Driven Development
    + TDD / Evidence-Based Delivery
    + GitHub Flow / Release Management
    + Ledger / Version History
    + Observation / Upstream Feedback
```

### 3.2 为什么 Plan 不能替代 Design / Spec

Proposal、Spec、Design 和 Plan 的输出具有不同法律式契约作用：

| 产物 | 核心问题 | 可以决定什么 | 不允许决定什么 |
| --- | --- | --- | --- |
| Proposal | 是否值得做 | 价值、优先级、方向、继续或停止 | 具体文件和实现步骤 |
| Change Spec | 要交付什么 | 用户行为、接口、数据契约、验收、非目标 | 未经说明改变战略方向 |
| Technical Design | 采用什么系统方案 | 架构、数据流、兼容、失败和迁移设计 | 改变已经批准的用户结果 |
| Implementation Plan | 怎样执行 | 顺序、文件、测试、提交和验证命令 | 新增产品需求或架构选择 |
| Evidence | 是否真的完成 | 证明或否定验收 | 修改验收标准 |
| Ledger | 实际发生了什么 | 记录事实、风险、回滚和后续 | 重写旧事实 |
| Version History | 什么已正式发布 | 发布版本、标签、时间和包含的 Change | 代表尚未发布的工作 |

普通 T2 Change 将 Product Spec 和 Technical Design 合并在一份 `spec.md` 中，避免形式主义。只有 T3 或跨多个组件的复杂变化才拆分 RFC / ADR。

### 3.3 方法原则

1. **先确认问题，再优化实现。**
2. **Spec 是行为契约，Plan 是执行契约。**
3. **风险决定流程重量，不以代码行数判断重要性。**
4. **自动证据优先于 Agent 声明。**
5. **一个 Change 一个主目标，禁止混入无关重构。**
6. **研究可以进入仓库，但不自动成为产品。**
7. **上游更新是一项 Change，不是覆盖操作。**
8. **版本历史只追加，不重写已经发布的事实。**
9. **所有重复信息必须有唯一真源和自动一致性检查。**
10. **个人维护模式不能依赖不存在的第二位审批者。**
11. **AI 可以起草、实现和审查，但不能自行通过产品、架构或生产发布门。**
12. **流程本身也要被度量和改进。**

### 3.4 Codex 原生执行优先级

Metaflow 的 Agent 执行以 Codex 原生提示词和运行规则为权威，不把 Superpowers 的 skill 流程嵌入强制路径。

执行优先级固定为：

```text
Codex system / developer instructions
→ 当前用户请求与授权边界
→ 仓库 AGENTS.md 和 MCL 治理文档
→ 已批准的 Proposal / Spec / Plan
→ 可选 skill、开源方法和案例参考
```

Codex 原生计划方式包括：

- 先检查真实仓库、配置、类型、测试和 Git 状态，再提出问题；
- 只向用户询问无法从环境发现、且会实质改变方案的偏好；
- Plan 必须决策完备，让实施阶段不再临时决定产品和架构；
- 进入执行后持续汇报短状态，保护用户已有工作，按风险运行工具；
- 实现、验证和交付是同一任务的一部分，不能以计划或代码生成代替实际验证；
- 最终明确已完成、未完成、失败、风险和文件 / PR / Release 证据。

Superpowers 的 brainstorming、TDD、worktree 和 review 思想可以用于改进模板，但：

- 不要求安装或调用 `subagent-driven-development`；
- 不要求调用 `executing-plans`；
- 不因 Superpowers 建议而绕过 Codex 当前模式、权限或工具规则；
- 不默认把每个 Plan task 分配给子 Agent；
- 只有用户、当前 Codex 规则或仓库 `AGENTS.md` 明确允许，并且子任务真正独立时，才考虑多 Agent 并行；
- 不允许并行 Agent 同时修改同一文件、共享构建目录或同一发布状态。

---

## 4. Metaflow 组件与所有权模型

建立机器可读的组件注册表，作为路径分类、CI 路由、版本历史和 CODEOWNERS 的共同真源。

### 4.1 组件集合

| ID | 类型 | 主要路径 | 发布方式 | 上游关系 | 默认检查 |
| --- | --- | --- | --- | --- | --- |
| `viewer` | product | `metaflow-viewer/`、Viewer 运行数据和 Viewer 元数据 | `viewer-vX.Y.Z` | SuperSplat Viewer、PlayCanvas | test、typecheck、build、E2E、visual |
| `editor` | product | `supersplat-v2.28.0/`、`metaflow-editor/`、Editor 元数据 | `editor-vX.Y.Z` | SuperSplat Editor | lint、build、导出契约、E2E |
| `design` | lab / future product | `aave-liquid-glass-lab/`、合规纳入后的 Swiftgram lab、未来 `/design` | 产品化前不发稳定产品版本；产品化后 `design-vX.Y.Z` | 外部设计研究 | typecheck、storybook build、visual、license audit |
| `data` | product data | `data/` 及场景索引、SOG / PLY / LOD / voxel 数据 | 随受影响产品或独立 data revision | 数据格式和资源源头 | schema、索引、哈希、小样本兼容、定时全量验证 |
| `platform` | infrastructure | `scripts/`、`netlify.toml`、analytics、Supabase、部署配置 | infra change / 随产品发布 | Netlify、Supabase | script tests、config validation、smoke、安全 |
| `reference` | upstream snapshot | `supersplat-viewer-v*/`、非 active 的 `supersplat-v*/` | 不部署 | 上游不可变快照 | 完整性、来源、版本、许可；不做每 PR 全量构建 |

### 4.2 组件注册表接口

建议新增 `metadata/components.json`，schema 固定为：

```json
{
  "schemaVersion": "1.0",
  "components": [
    {
      "id": "viewer",
      "kind": "product",
      "ownedPaths": ["metaflow-viewer/**"],
      "versionSource": "metadata/version-history.json",
      "checks": ["viewer-test", "viewer-typecheck", "viewer-build", "viewer-e2e"],
      "deployTarget": "/",
      "upstream": {
        "repository": "playcanvas/supersplat-viewer",
        "versionField": "current.upstream.version"
      }
    }
  ]
}
```

具体路径列表在实施时由真实目录和部署依赖生成，不在多个 workflow 中手工复制。

### 4.3 Design 域晋升规则

研究资料与正式产品之间设置 `Experiment Promotion Proposal`：

1. 研究阶段允许保存来源、对比、实验和可运行 demo；
2. 必须记录来源、许可、抓取日期、是否包含外部代码或资产；
3. 产品化 Proposal 说明目标用户、页面信息架构、保留与重写内容、性能和移动端要求；
4. Proposal 被接受后才创建 `/design` 产品 Spec；
5. 产品实现不得直接依赖无法再分发的源码或私有资产；
6. `design` 变更不触发 Viewer 版本历史，除非它同时改变 `/` 或 Viewer 公共组件；
7. 研究结论和产品行为使用不同证据目录，避免再次混淆。

---

## 5. Change 风险分级与流程强度

### 5.1 T0：维护与资料

适用：错别字、链接、注释、无行为变化的文档、研究资料补充、机械依赖锁文件维护。

必需：

- 范围说明；
- PR 或在明确允许时的维护提交；
- 路径相关的文档、生成物或安全检查；
- 明确说明为什么不影响产品行为。

不需要：独立 Proposal、Spec、Plan、ADR、产品版本。

### 5.2 T1：Bug 与小型改进

适用：范围清晰、接口不变、可用单一回归测试证明的问题。

必需：

- Issue 或 PR 中的完整 Bug 说明；
- 复现步骤或 RED 测试；
- 最小修复；
- 相关自动测试；
- PR、风险和回滚说明；
- 如果用户可见，更新 Ledger / Version History。

### 5.3 T2：产品功能与 UI

适用：新功能、设置、交互、UI、数据能力、`/design` 页面、用户可见兼容行为。

必需：

- Issue；
- 必要时 Product Proposal；
- Change Spec；
- Implementation Plan；
- 独立分支 / worktree；
- 功能、视觉、兼容和性能证据；
- Preview；
- PR；
- Ledger / Version History。

### 5.4 T3：架构、公共契约与高风险迁移

适用：

- URL / query 参数公共语义；
- settings、index、project、export 等持久化格式；
- Viewer / Editor / Data 的组件边界；
- 加载、排序、渲染、碰撞、缓存、部署或认证主路径；
- 破坏性数据迁移；
- 大规模上游同步；
- 隐私、安全和信任边界；
- 推翻已有 ADR；
- 多阶段或无法一次安全回滚的变化。

必需：

- Discussion 或正式 Proposal / RFC；
- 选项、缺点、兼容和迁移分析；
- 接受后如属长期架构决策则创建 ADR；
- Change Spec；
- 分阶段 Implementation Plan；
- Beta、迁移、回滚、监控和观察期；
- 完整 Ledger、Version History 和 Release Evidence。

---

## 6. Change Lifecycle 状态机

### 6.1 主状态

```text
Observed
  ↓
Proposed
  ↓
Accepted
  ↓
Specified
  ↓
Planned
  ↓
Implementing
  ↓
Verifying
  ↓
Released
  ↓
Observing
  ↓
Closed
```

旁路终态：

```text
Rejected
Parked
Superseded
Rolled Back
```

### 6.2 阶段与 Gate

#### Gate 0：Signal 可行动性

输入：反馈、Bug、指标、Roadmap、上游 Release、设计实验。

检查：

- 是否有可验证的问题或机会；
- 是否重复；
- 受影响组件；
- 是否需要紧急处理；
- 最低证据是否足够。

输出：关闭、合并到已有 Change，或进入 Proposal。

#### Gate 1：Proposal 接受

检查：

- 问题与目标用户是否真实；
- 为什么现在做；
- 成功信号；
- 非目标；
- 替代路径；
- 风险、成本和优先级；
- 是否符合产品方向。

输出：`Accepted`、`Parked` 或 `Rejected`。

只有人类负责人可以接受 T2/T3 Proposal。AI 可以起草和评审，但不能自行批准。

#### Gate 2：Spec 就绪

检查：

- 用户行为是否无歧义；
- 输入、输出、状态、错误和降级是否明确；
- 公共接口和兼容策略是否明确；
- 验收能否被测试或观察；
- 是否留下实施者必须自行做出的高影响决策。

输出：批准的 `spec.md`。

#### Gate 3：Plan 可执行

检查：

- 任务顺序和依赖；
- RED / GREEN / REFACTOR 边界；
- 目标文件或子系统；
- 验证命令；
- 提交和 PR 边界；
- 是否存在明确的串行依赖；仅在当前 Codex 规则允许时，才标注真正独立的可选并行任务；
- 中止与升级条件。

Plan 如果出现新的用户行为、架构选择或兼容政策，必须返回 Gate 1 或 Gate 2。

#### Gate 4：实现完整

检查：

- 代码是否只实现批准范围；
- 测试是否先证明失败再证明修复；
- 是否存在无关重构；
- 文档、生成物和迁移是否同步；
- 工作树是否包含意外文件、日志、凭据或大资源。

输出：Draft PR 和 Evidence 初稿。

#### Gate 5：验证与 Review

分两轮：

1. **Spec Compliance Review**：实现是否满足 Spec、遗漏或超出范围；
2. **Code Quality Review**：正确性、可靠性、维护性、性能、安全和测试质量。

这两轮表示 Review 关注点的分离，不等于强制启动两个子 Agent。默认由 Codex 主 Agent 进行独立 review pass；只有当前规则明确允许时才委托独立 Agent。

自动 CI、视觉、性能或安全失败不能由 Review 文字豁免；必须修复或在 Proposal / Spec 中正式调整要求。

#### Gate 6：Release Readiness

检查：

- 必需 CI 全绿；
- Preview / Beta 证据；
- 版本号和标签；
- 迁移与回滚；
- 线上 smoke；
- Ledger / Version History；
- 已知限制和观察指标。

输出：Stable Release 或返回修复。

#### Gate 7：观察与关闭

检查：

- 线上路径、错误和性能；
- 是否出现回滚、兼容或支持问题；
- 成功指标是否达到；
- 是否需要生成新的 Change。

Change 只有在观察期结束、Ledger 完整且没有未归属的阻断问题时才能 `Closed`。

---

## 7. Change 文档与数据契约

### 7.1 Change ID 与目录

每项进入正式流程的变化使用 GitHub Issue 号：

```text
MF-<issue-number>
```

T2/T3 文档聚合到：

```text
docs/changes/<issue-number>-<slug>/
├── proposal.md      # T2 可选，T3 必需；Technical Proposal 即 RFC
├── spec.md          # T2/T3 必需
├── plan.md          # T2/T3 必需
└── evidence.md      # 从验证阶段开始维护
```

全局、长期架构决定保存在：

```text
docs/adr/NNNN-<decision>.md
```

### 7.2 通用 Front Matter

```yaml
---
change_id: MF-123
title: Short descriptive title
status: proposed
component:
  - viewer
risk: T2
type: product
owner: Shuang-su
created: 2026-08-09
updated: 2026-08-09
issue: https://github.com/Shuang-su/Metaflow/issues/123
supersedes: null
---
```

合法状态固定为：

```text
observed
proposed
accepted
specified
planned
implementing
verifying
released
observing
closed
rejected
parked
superseded
rolled-back
```

### 7.3 Proposal 模板

1. 摘要；
2. 问题 / 机会；
3. 用户与场景；
4. 证据；
5. 为什么现在做；
6. 目标与可测成功信号；
7. 非目标；
8. 候选方案；
9. 成本与依赖；
10. 兼容、安全、隐私和性能风险；
11. 推荐决定；
12. `Accept / Park / Reject` 记录。

### 7.4 Change Spec 模板

1. 背景与关联 Proposal；
2. 用户可见行为；
3. 用户旅程、UI 状态或行为矩阵；
4. 公共 URL、配置、数据、类型或 API 契约；
5. Technical Design 与数据流；
6. 状态、错误、超时、取消、降级和恢复；
7. 兼容与迁移；
8. 安全和隐私；
9. 性能预算；
10. 无障碍、移动端和 reduced motion；
11. 非目标；
12. 功能、测试、视觉、性能、部署验收标准；
13. 未决项。Spec 进入 `specified` 前未决项必须为零或被明确延期。

### 7.5 Implementation Plan 模板

1. Goal；
2. Architecture Summary；
3. 依赖和前置条件；
4. 工作树 / 分支策略；
5. 任务列表；
6. 每项任务的目标路径；
7. RED 测试和预期失败；
8. 最小 GREEN 实现；
9. REFACTOR 边界；
10. 验证命令与预期结果；
11. 提交边界；
12. 串行依赖，以及在当前 Codex 规则明确允许时才使用的可选并行关系；
13. 风险、回滚和中止条件；
14. 最终全量检查。

### 7.6 Evidence 模板

Evidence 只能记录实际结果：

- 执行环境和 commit SHA；
- 实际命令、退出码、通过 / 失败数量；
- 未运行项目及原因；
- 浏览器、设备和渲染后端；
- 截图、录屏、CI artifact；
- 性能原始数据、样本数和比较基线；
- Preview / Beta URL；
- 线上 smoke；
- 已知限制；
- Spec 验收逐项映射；
- Review 结论；
- 发布、回滚和观察结果。

不得把“Agent 判断应该通过”写成测试证据。

### 7.7 ADR 模板

ADR 字段固定为：

- Title；
- Status：`proposed / accepted / rejected / deprecated / superseded`；
- Context；
- Decision Drivers；
- Considered Options；
- Decision；
- Positive / Negative Consequences；
- Compatibility / Migration；
- Confirmation；
- 关联 Proposal、Spec 和替代 ADR。

不是所有接受的 Proposal 都需要 ADR；只有难以从代码还原、长期影响多个 Change 的技术决定需要。

---

## 8. GitHub 协作模型

### 8.1 Issue 类型

建立以下表单：

- Bug Report；
- Product / Feature Proposal；
- Performance / Compatibility；
- Upstream Sync Proposal；
- Experiment Promotion Proposal；
- Security 报告继续走私密安全渠道，不使用公开 Issue。

### 8.2 标签

组件：

```text
component/viewer
component/editor
component/design
component/data
component/platform
component/reference
```

类型：

```text
type/bug
type/feature
type/proposal
type/upstream-sync
type/release
type/docs
type/security
type/performance
```

风险：

```text
risk/T0
risk/T1
risk/T2
risk/T3
```

状态由 GitHub Project 字段承载，不用大量状态标签重复维护。

### 8.3 GitHub Project 字段

- `Lifecycle Phase`：Observed、Proposed、Accepted、Specified、Planned、Implementing、Verifying、Released、Observing、Closed；
- `Risk`：T0-T3；
- `Component`；
- `Target Release`；
- `Change Type`；
- `Owner`；
- `Upstream Version`；
- `Blocked By`。

Roadmap 继续提供 `Now / Next / Later` 视图；Milestone 表示具体发布目标。

### 8.4 分支与 worktree

- Codex 实现分支：`codex/mf-<issue>-<slug>`；
- 人工功能分支：`feature/mf-<issue>-<slug>`；
- 修复分支：`fix/mf-<issue>-<slug>`；
- 发布分支只在确有冻结需求时建立，默认从 `main` 标签发布；
- T2/T3 必须使用独立 worktree；
- 不得在已有脏工作树中覆盖用户文件；
- 不使用 `git reset --hard` 或历史重写整理当前 9 个提交。

### 8.5 PR 模板

PR 必须包含：

1. Change ID / Closes Issue；
2. Summary；
3. Motivation；
4. Behavior；
5. Scope / Non-goals；
6. Proposal / Spec / Plan / ADR；
7. Validation；
8. UI Evidence；
9. Compatibility Matrix；
10. Performance；
11. Risk / Rollback；
12. Ledger / Version History；
13. AI Assistance；
14. 未完成和未验证内容。

### 8.6 Review 与合并门禁

`main` Ruleset：

- 必须通过 PR；
- 禁止 force push 和删除；
- 必须解决所有 Review conversation；
- 必须通过稳定名称的 `required / gate`；
- 合并前分支必须包含最新目标分支或通过 merge queue；
- 默认 squash merge；
- 合并后删除分支；
- 当前 required approvals 为 `0`；
- 固定第二维护者加入后切换为 `1`，并启用 CODEOWNERS approval；
- 管理员紧急绕过只用于生产事故，随后必须补 Issue、证据和回顾。

---

## 9. 人与 AI 的责任边界

| 活动 | 人类负责人 | Codex 主 Agent | Review pass / 可选独立 Agent | CI / 自动化 |
| --- | --- | --- | --- | --- |
| 收集 Signal | 决定是否重要 | 整理证据 | 可检查遗漏 | 汇总监控 / 上游信息 |
| Proposal | 接受、搁置或拒绝 | 起草、分析选项 | 反驳和风险审查 | 校验模板 |
| Spec | 批准用户与公共契约 | 起草、消除歧义 | Spec Compliance Review | 校验字段和链接 |
| Plan | 确认范围和执行时机 | 拆解成可执行任务 | 检查遗漏和不可执行决策 | 校验引用 |
| Implementation | 处理权限和高风险选择 | 编码、测试、文档 | 独立代码审查 | build / test / scan |
| Release | 批准生产发布 | 准备版本和证据 | 检查 readiness | 构建、部署、smoke |
| Ledger | 对事实负责 | 汇总 diff 与证据 | 检查追溯完整性 | 生成并校验数据 |

AI 使用规则：

- PR 记录使用的 Agent / 模型类别和主要参与范围，不要求公开隐藏推理；
- AI 不能用自己的 Review 代替自动测试；
- 默认由 Codex 主 Agent 执行独立的 Review pass；若当前规则允许独立 Agent，则使用隔离上下文降低自我确认偏差；
- `subagent-driven-development` 和 `executing-plans` 不属于 Metaflow 必需流程；
- Agent 遇到 Spec 外决策必须停止并升级，不得“顺便优化”；
- Agent 声称无法验证时必须说明阻塞和剩余风险；
- 生产发布、破坏性迁移和安全边界变化必须由人类负责人确认。

---

## 10. CI 与自动化架构

### 10.1 总体设计

所有 PR 首先运行轻量路径分类，然后只启动相关组件作业。无论跳过哪些作业，最后始终运行同一个汇总 Job：

```text
required / gate
```

这样 GitHub Ruleset 不依赖会因路径变化而消失的动态检查名。

所有 Actions：

- 固定到完整 commit SHA；
- 最小化 `permissions`；
- `persist-credentials: false`；
- 使用并发分组取消旧运行；
- 设置 timeout；
- 只缓存 lockfile 对应依赖；
- PR 作业无生产写权限；
- fork PR 不接触部署 secret。

### 10.2 Always-on 治理作业

- Change front matter 与状态枚举；
- 组件路径注册表；
- Proposal / Spec / Plan / Evidence 引用关系；
- Markdown 链接；
- 生成文件是否最新；
- README / Project Index / package / metadata 版本一致性；
- Version History schema；
- `git diff --check`；
- 凭据和明显敏感文件扫描；
- 禁止 `.DS_Store`、日志、缓存和构建目录进入提交。

### 10.3 Viewer 作业

路径命中 Viewer 后执行：

```text
npm ci
npm test
npm run type:check
npm run build
```

同时验证：

- Version History 与运行时版本；
- 数据索引和 redirect；
- analytics 契约；
- tiled voxel 索引；
- 动画策略；
- 构建产物不存在意外大文件。

### 10.4 Editor 作业

路径命中 active Editor 后执行：

```text
npm ci
npm run lint
npm run build
```

在第二阶段补充自动化契约：

- 打开、编辑、undo / redo；
- HTML / SOG package；
- legacy ZIP；
- 直接 `settings.json`；
- `.ssproj` 保存后重开；
- 100000 frame 时间轴；
- locale 完整性；
- runtime version、About、console 和 Service Worker 版本一致性。

### 10.5 Design 作业

Aave Storybook 至少执行：

```text
npm ci
npm run typecheck
npm run generate-study-pages
npm run build-storybook
```

新增：

- 来源和许可证 manifest；
- 外部 URL / 资产完整性；
- Storybook smoke；
- 固定视口视觉；
- reduced motion；
- 横向 overflow；
- 控件交互；
- 研究镜像与独立实现的边界检查。

Swiftgram lab 在完成许可和敏感内容审计前不进入常规 CI。

### 10.6 Data / Platform 作业

- 小型 schema fixture 在每个相关 PR 运行；
- 大型 LFS 和完整场景语料在定时 / 手动工作流运行；
- Netlify 配置、redirect 和 SPA fallback 验证；
- 生成脚本 idempotence；
- Supabase migration / function 静态检查；
- analytics 隐私和事件 schema；
- 部署包路径完整性。

### 10.7 浏览器 E2E

借鉴 Vite，使用同一组 fixture 同时验证：

1. 开发服务器；
2. 生产构建和静态服务器。

PR 必需环境：

- Chromium；
- WebGL；
- 桌面 `1440×900`；
- 移动 `390×844`。

定时 / 发布前环境：

- WebGPU；
- Safari / WebKit；
- Firefox；
- 真实移动设备；
- XR / Vision Pro / Quest 等有条件硬件。

### 10.8 Viewer Fixture 矩阵

- Legacy SOG；
- 流式 JSON / LOD；
- subject + environment；
- 单体 voxel；
- tiled voxel；
- annotation、picker 和 target navigation；
- Orbit / Anim / Fly / Walk；
- URL 参数与 settings；
- 加载超时和 first-frame fallback；
- 损坏输入；
- 不支持能力的降级；
- WebGL / WebGPU 选择；
- 移动触控和窄屏。

Fixture 必须小、可再分发、确定性强，不在 PR 中下载完整生产数据。

### 10.9 视觉回归

- 固定相机、DPR、字体、时区、语言、动画时间和网络响应；
- 快照前等待明确的 ready signal，而不是固定 sleep；
- 小型 baseline PNG 纳入版本控制；
- 完整截图、diff 和录屏保存为 CI artifact；
- baseline 更新必须由显式 PR 审查，不能自动接受；
- 对抗锯齿和 GPU 差异使用区域 mask 或经过校准的阈值，不得用过大阈值掩盖真实回归。

### 10.10 性能

PR 硬门禁：

- JS / CSS bundle 大小；
- 关键资源数；
- 明确的同步阻塞或大依赖引入；
- 小型 fixture 的首帧超时上限。

趋势指标：

- time to first visible splat；
- time to stable frame；
- p50 / p95 frame time；
- 交互响应；
- CPU heap；
- 场景下载与解码时间。

GPU 运行性能在 GitHub 共享 runner 上先作为 advisory。只有专用 runner 累积至少 20 次稳定样本且变异系数低于 10% 后，才以基线 p95 加 10% 建立阻断预算。

### 10.11 安全与依赖

- CodeQL 针对活动 JS / TS 组件；
- Dependabot 或 Renovate 只覆盖 active package；
- 自动更新不自动合并；
- dependency review；
- secret scanning；
- Workflow 权限和 action SHA 检查；
- 外部研究资产的许可和来源审计；
- 高风险安全报告不进入公开 Proposal。

---

## 11. Ledger 与 Version History 升级

### 11.1 权威关系

| 系统 | 生命周期角色 | 权威范围 |
| --- | --- | --- |
| GitHub Issue | 进行中的 Change Record | 状态、讨论、负责人和优先级 |
| Proposal / Spec / Plan | 决策与执行契约 | 为什么、做什么、怎样做 |
| Evidence | 验证记录 | 实际测试、Review 和部署事实 |
| Version History JSON | 机器可读发布真源 | 版本、日期、git ref、包含的 Change |
| Change Ledger Markdown | 维护者审计 | 动机、演化、风险、上游和用户结果 |
| GitHub Release / Tag | 发布制品 | 对外发布点和不可变 commit |

### 11.2 Schema 1.1

Viewer 和 Editor Version History 从 `1.0` 兼容升级到 `1.1`。新条目增加可选 `trace`：

```json
{
  "trace": {
    "changeId": "MF-123",
    "issue": "https://github.com/Shuang-su/Metaflow/issues/123",
    "proposal": "docs/changes/123-example/proposal.md",
    "spec": "docs/changes/123-example/spec.md",
    "plan": "docs/changes/123-example/plan.md",
    "pullRequest": "https://github.com/Shuang-su/Metaflow/pull/456",
    "evidence": "docs/changes/123-example/evidence.md",
    "releaseTag": "viewer-v5.19.0",
    "deployUrl": "https://metaflow.shuang-su.com/",
    "upstream": {
      "repository": "playcanvas/supersplat-viewer",
      "from": "v1.26.2",
      "to": "v1.28.0"
    }
  }
}
```

兼容政策：

- 现有 112 条 Viewer 历史不强制完整回填；
- 旧条目缺少 `trace` 仍合法；
- MCL 生效后的用户可见 T1、T2、T3 必须包含 `trace.changeId` 和 PR；
- Stable Release 必须包含 tag、Evidence 和 deploy；
- 回滚创建新条目，不修改旧条目；
- 生成脚本负责把结构化历史发布到 `data/` 和运行时 endpoint；
- CI 校验 package semver、display version、git ref、runtime JSON、README 和 Project Index。

### 11.3 Ledger 更新策略

- Version History 保存结构化事实，Ledger 不重复维护版本真源；
- Ledger 只增加无法由 JSON 充分表达的动机、行为演化、用户结果、风险和后续约束；
- Release PR 同时更新二者；
- CI 验证新产品版本在 Ledger 中存在对应 Change ID；
- 纯文档维护不产生产品版本；
- 多组件 Change 分别进入相关 Ledger，但使用同一 Change ID。

---

## 12. Release Lifecycle

### 12.1 版本与标签

- Viewer：`viewer-vX.Y.Z`；
- Editor：`editor-vX.Y.Z`；
- Design 产品化后：`design-vX.Y.Z`；
- Beta：`viewer-vX.Y.Z-beta.N` 等；
- Viewer `5.18a` 等 display version 可以保留，但 tag 和 package 使用 SemVer；
- 上游版本与 Metaflow 产品版本保持独立，不把 SuperSplat tag 当作 Metaflow tag。

### 12.2 发布阶段

```text
PR Preview
  ↓
Merge to main
  ↓
Beta Tag / Staging
  ↓
Release Readiness
  ↓
Stable Tag
  ↓
Immutable Build
  ↓
Production Deploy
  ↓
Post-deploy Smoke
  ↓
GitHub Release + Ledger
  ↓
Observation
```

### 12.3 发布证据

- tag 指向的 commit；
- required gate；
- 构建 artifact 哈希；
- Preview / Beta URL；
- 浏览器和场景矩阵；
- 数据和 migration 状态；
- 生产 URL smoke；
- Version History endpoint；
- 已知限制；
- 回滚目标。

### 12.4 回滚

- 优先恢复上一成功 Netlify deploy；
- 创建 revert PR 或修复 PR；
- Version History 添加 rollback 条目；
- Change 标记 `rolled-back`；
- 保留原 Release 和 Evidence，不删除失败事实；
- 事故结束后产生 T1/T3 follow-up Change。

---

## 13. Upstream Sync Lifecycle

### 13.1 监控

定时检查：

- `playcanvas/supersplat-viewer` stable release；
- `playcanvas/supersplat` stable release；
- `playcanvas/engine` 与当前产品直接相关的 release；
- 关键依赖安全更新。

工作流只创建或更新 Issue，不自动修改 active 源码或合并依赖。

### 13.2 Upstream Sync Proposal

必须记录：

- 当前本地基线和目标上游 tag / commit；
- 上游 Added / Changed / Fixed / Breaking；
- 对 Metaflow 用户的价值；
- 受影响的本地定制；
- 数据、URL、导出、渲染和部署兼容；
- 是否值得当前同步；
- Skip / Defer 的理由；
- 建议发布版本和 Beta 范围。

### 13.3 两层分类

上游变化处置：

```text
Adopt   直接采用
Defer   暂缓，等待条件满足
Skip    明确不采用并记录理由
```

本地定制处置：

```text
Keep      原实现继续有效
Port      迁移到新上游结构
Replace   用上游新能力替代本地实现
Drop      删除不再需要的定制
Conflict  需要新的产品或架构决定
```

`Conflict` 必须返回 Proposal / RFC，不能由同步 Agent 独自选择。

### 13.4 同步验证

- Viewer / Editor active 源码 diff；
- 现有本地 patch map；
- 功能、视觉、性能和兼容矩阵；
- 旧数据和旧导出包；
- 新数据格式；
- WebGL / WebGPU；
- Editor 保存、导出和重新打开；
- Service Worker / cache；
- Preview / Beta；
- Ledger 和 Version History。

跳过某个上游版本也要保留 Proposal 结果，防止下一轮重复调研。

---

## 14. 开源项目学习矩阵

| 项目 / 方法 | Metaflow 应采用 | 不应照搬 |
| --- | --- | --- |
| SztuCode | Issue → Spec → Plan → TDD → PR 的完整案例；Roadmap、模板、ADR、CI | 不能因一个成功案例就假设流程已长期成熟 |
| Codex 原生工作方式 | 探索真实环境、决策完备计划、按权限执行、持续状态、验证后交付 | 不用计划文本代替实际实施和验证 |
| Superpowers | 仅参考 brainstorming、worktree、TDD、Review 和证据优先 | 不强制 `subagent-driven-development` / `executing-plans`，不让 skill 覆盖 Codex 提示词 |
| Spec Kit | Constitution、Specify、Plan、Tasks、Implement 的收敛关系 | 不与 MCL 并行维护第二套重复文档 |
| SuperSplat | 实际 3D 编辑器功能 PR、动机、验证、截图、locale、undo / redo | 当前缺少正式 Proposal 和完善测试，不作为治理上限 |
| SuperSplat Viewer | WebGL / WebGPU / XR 行为矩阵、beta / stable 发布、依赖更新 | 当前 PR CI 和自动测试覆盖不足 |
| PlayCanvas Engine | 大变化先讨论、小 PR、行为变化需测试、examples | 不需要复制大型团队全部维护流程 |
| MapLibre GL JS | Bug 先证明、Draft PR、benchmark、AI 责任 | 不要求每个微小修改都走完整 benchmark |
| Vite | playground fixture、serve / build 双模式测试 | 不需要复制其多包发布复杂度 |
| Three.js | examples、截图、视觉和性能检查 | 不能只依赖人工 example 测试 |
| Rust RFC | 重大变化的动机、替代、缺点和共识 | 不让普通 Bug 进入 RFC |
| Godot Proposals | Idea 与成熟 Proposal 分层、一个 Proposal 一个问题 | 不采用禁止 AI 起草 Proposal 的规则 |
| MADR | 简洁 ADR 结构和 supersede 关系 | 不为可逆局部实现制造 ADR |
| Kubernetes KEP | 高风险变化的 readiness、监控、升级 / 降级 | 不把 KEP 重量套到普通 UI 功能 |
| ISO 12207 / 25010 | 生命周期和质量属性术语 | 不宣称模板本身等于标准合规 |

---

## 15. 分阶段实施路线

实施以多个小型、可审查 PR 完成，不建立一个包含所有治理、测试和发布变化的巨型 PR。

### Phase 0：保护现场与建立实施入口

目标：不丢失当前工作。

1. 在当前 HEAD 创建保留分支，承载已领先远端的 9 个设计提交；
2. 将其作为独立 design-domain onboarding Change；
3. 不 reset 当前 `main`；
4. 从 `origin/main` 创建新的治理 worktree；
5. Swiftgram 未跟踪目录先审计来源、许可、敏感文件和体积；
6. 记录当前测试、版本和 GitHub 配置快照。

验收：现有提交和未跟踪目录都可恢复，治理 PR 不混入设计实验内容。

### Phase 1：MCL Constitution 与模板

交付：

- MCL 权威文档；
- `CONTRIBUTING.md`；
- `AGENTS.md`；
- Roadmap；
- Change 状态、风险和组件定义；
- Proposal / Spec / Plan / Evidence / ADR 模板；
- Issue / PR 模板；
- 标签和 GitHub Project 字段设计。

验收：使用一个样例 T1 和 T2 Change 通过模板静态校验，不修改产品行为。

### Phase 2：组件注册与绿色基线

交付：

- `metadata/components.json`；
- 路径分类器；
- Version History 测试按组件作用域执行；
- README / Project Index / package / metadata 版本一致性；
- Viewer 52 项测试全绿；
- Editor 和 Design 当前构建基线。

验收：当前 design 提交不再触发 Viewer Ledger 假阳性；不使用提交哈希白名单掩盖问题。

### Phase 3：核心 CI 与分支保护

交付：

- Always-on governance；
- Viewer、Editor、Design、Data / Platform path-scoped jobs；
- `required / gate`；
- action SHA 和最小权限；
- Ruleset、CODEOWNERS、squash 和 conversation resolution。

顺序：先让 workflow 在 `main` 存在并成功，再设置 required check。

验收：测试 PR 在 gate 失败时不能合并，恢复绿色后可以合并。

### Phase 4：Ledger / Version History 1.1

交付：

- 兼容 schema 1.1；
- trace 字段；
- 生成脚本和 `--check`；
- Ledger / Version 链接校验；
- namespaced tag 规则；
- legacy 历史兼容测试。

验收：旧 112 条记录继续可读；新模拟 Release 能完整追溯到 Change、PR、Evidence 和 tag。

### Phase 5：浏览器、视觉与性能

交付：

- 小型 Viewer fixture；
- serve / build 双模式 Playwright；
- Chromium / WebGL 必需门禁；
- visual snapshot；
- bundle budget；
- 定时 WebGPU / 多浏览器 / 性能趋势；
- Editor 导出和 reopen 契约；
- Design Storybook 视觉和 reduced-motion。

验收：故意引入行为、视觉和 bundle 回归时，对应检查能够失败。

### Phase 6：安全、发布与回滚

交付：

- CodeQL、依赖和 secret 检查；
- Preview / Beta / Stable；
- immutable artifact；
- GitHub Release；
- production smoke；
- Netlify rollback；
- Release Evidence。

验收：先完成不写生产的 dry run，再完成受控 Beta；故意失败的 smoke 不得生成成功 Release。

### Phase 7：Upstream Sync 自动化

交付：

- 周期性 release watcher；
- Upstream Sync Proposal 模板；
- 上游变化和本地定制双层分类；
- diff / patch map；
- no-op 去重；
- Beta 兼容矩阵；
- 同步 Ledger。

验收：模拟新版本只创建一个 Issue；无变化不重复创建；同步不能自动合并。

### Phase 8：两个真实试点与 MCL 1.0 生效

试点一：当前 design-domain onboarding，验证 Experiment Promotion / Product Proposal、视觉 Evidence 和域边界。

试点二：下一次 Viewer 或 Editor 上游同步，验证 Upstream Sync Proposal、patch map、Beta、Version History 和 Ledger。

试点完成后：

- 统计文档重复和耗时；
- 删除无决策价值的字段；
- 修正过重或过轻的 Gate；
- 发布 `MCL 1.0`；
- 从该日期起，新 T2/T3 强制执行完整流程。

---

## 16. 测试计划与验收场景

### 16.1 治理测试

- T0 文档 PR 不要求 Spec；
- T1 Bug 缺少复现 / 回归证据时失败；
- T2 缺少 Spec 或 Plan 时失败；
- T3 缺少 Proposal / RFC 时失败；
- 非长期架构变化不被错误要求 ADR；
- Plan 引用错误 Change ID 时失败；
- Release 缺少 Evidence 或 tag 时失败；
- rollback 试图修改旧 Version 条目时失败。

### 16.2 路径作用域测试

- 只改 design，不触发 Viewer 版本要求；
- 改 Viewer 公共组件，触发 Viewer CI 和 Version 检查；
- 改 Editor 源码，触发 Editor lint / build / contract；
- 改 `metadata/components.json`，触发所有治理检查；
- 改 Netlify 或生成脚本，触发 Platform 和 smoke；
- 改 reference 快照，只运行来源 / 完整性，不运行全部 active 构建。

### 16.3 功能和兼容测试

- 旧 SOG 能加载并显示首帧；
- streaming / LOD 能渐进加载；
- subject + environment 保持组合语义；
- voxel walk 和 tiled voxel 不回归；
- URL / settings 在 WebGL 和 WebGPU 下按 Spec 工作；
- 不支持 WebGPU 时降级而不是空白；
- Editor 导出旧格式和新格式；
- 旧项目保存后能重新打开；
- service worker 不缓存错误版本；
- `/editor`、未来 `/design` 和根路径部署后可访问。

### 16.4 流程端到端验收

选取一个 T1：

```text
Bug Issue → RED → Fix → PR → Gate → Merge → Version / Ledger
```

选取一个 T2：

```text
Product Proposal → Spec → Plan → Preview → Visual / E2E → Release → Observe
```

选取一个 T3：

```text
RFC → ADR → Spec → Staged Plan → Beta → Migration / Rollback → Stable → Observe
```

选取一个上游同步：

```text
Release Watch → Sync Proposal → Patch Classification → Sync PR → Beta → Ledger
```

四条链都能在 GitHub 和仓库中完整追溯，才视为 MCL 实施完成。

---

## 17. Definition of Done

### 17.1 所有 Change 的共同 DoD

- 范围和风险等级正确；
- 必需产物存在并互相链接；
- 实现与 Spec 一致；
- 所有声明都有实际证据；
- 没有未说明的失败检查；
- 没有凭据、日志、缓存或意外大文件；
- 文档和生成物同步；
- PR 讨论解决；
- 回滚路径明确；
- Ledger / Version 更新规则得到满足。

### 17.2 Release DoD

- Stable tag 使用正确命名空间；
- tag 指向已通过 required gate 的 `main` commit；
- immutable artifact 可定位；
- Preview / Beta 结果存在；
- production smoke 成功；
- Version endpoint 显示正确版本；
- GitHub Release 链接 Change；
- Ledger 和 Version History 已发布；
- 观察期和负责人明确。

### 17.3 上游同步 DoD

- 来源 tag / commit 可验证；
- Added / Changed / Fixed / Breaking 已分析；
- 每项本地定制已分类；
- 没有未解释的 Conflict；
- 旧数据、旧导出和关键设备已经验证；
- Beta 完成；
- upstream base、依赖和 patch map 已更新；
- Skip / Defer 项保留理由。

---

## 18. 流程度量与持续改进

MCL 不以“写了多少文档”为成功，而以减少错误决策、回归和无法解释的版本差异为目标。

建议记录：

- Proposal 到 Accepted 的时间；
- Accepted 到 Released 的 lead time；
- Spec 进入实现后重新打开的次数；
- PR CI 首次通过率；
- 逃逸到生产的缺陷；
- rollback 次数；
- 上游同步延迟；
- 视觉 / 性能回归拦截次数；
- 长期 Parked Proposal；
- 每类 Change 的流程耗时；
- Ledger / Version 追溯缺失率。

每两个稳定版本进行一次 Process Retrospective：

- 哪些字段没有帮助决策；
- 哪些失败本应更早发现；
- 哪些检查过慢或不稳定；
- 哪些风险等级判断错误；
- 哪些工作可自动生成；
- 是否需要调整 T0-T3 门槛。

流程变化本身按 T2 或 T3 Change 管理，避免无记录地持续漂移。

---

## 19. 风险与缓解

| 风险 | 后果 | 缓解 |
| --- | --- | --- |
| 文档过重 | 个人项目推进变慢 | T0-T3 分级；T0/T1 快路径；普通功能合并 Design / Spec |
| 多份真源漂移 | README、package、metadata 不一致 | 结构化元数据为真源；生成和 `--check` |
| AI 自我确认 | 实现和 Review 共享盲点 | Codex 独立 review pass、自动 CI、人类 Gate；规则允许时再使用独立 Agent |
| GitHub shared runner 性能噪声 | 虚假性能失败 | bundle 先硬门禁；GPU 性能校准后再阻断 |
| 仓库和 LFS 过大 | CI 慢、成本高 | 路径过滤、小 fixture、定时全量数据检查 |
| 上游覆盖本地定制 | 用户能力回归 | Sync Proposal、patch map、双层分类、Beta |
| 没有第二维护者 | PR 审批规则阻塞 | 暂不要求人类 approval；固定维护者加入后再切换 |
| 历史 112 条无法补齐 | 迁移成本过高 | schema 1.1 向后兼容；只对新 Change 强制 trace |
| 研究资产许可不清 | 无法公开或部署 | Design manifest、许可 Gate、不明来源不入库 |
| Proposal 与 RFC 重复 | 形式主义 | RFC 定义为 Technical Proposal，不创建两份重复文档 |
| Plan 越权做决定 | 实现偏离用户目标 | Plan readiness 检查；新决策退回 Proposal / Spec |
| 自动发布误操作 | 生产事故 | PR 无生产权限；Beta；人类 Release Gate；可恢复部署 |

---

## 20. 执行 Agent 的操作约束

后续 Codex 或其他工具实施本文时必须遵守：

1. 开始前读取本文件、仓库状态、相关 Change 文档和组件注册表；
2. 以 Codex 原生 system / developer / user 提示词、当前 collaboration mode 和仓库 `AGENTS.md` 为执行权威；
3. 不把 Superpowers `subagent-driven-development` 或 `executing-plans` 当作必需步骤；
4. 先分类 T0-T3，再决定产物，不默认所有变化都需要 RFC；
5. 不修改与当前 Change 无关的用户文件；
6. 不重置当前 `main` 或删除未跟踪 Swiftgram 资料；
7. 不把 research snapshot 当作可再分发产品代码；
8. 不在一个 PR 同时建立全部治理、迁移上游和重做产品 UI；
9. 每轮变更先建立或引用 Issue / Change ID；
10. T2/T3 在 Spec 和 Plan 获得确认前不得进入实现；
11. 测试失败必须记录准确数量、命令和原因；
12. 不能把局部测试成功表示为完整发布成功；
13. 任何生产写入、分支规则变更、Release 或上游同步都要事后重新读取验证；
14. 完成时交付：文件清单、行为变化、实际验证、未验证内容、风险、Change / PR / Release 链接；
15. 如果创建 Git commit、push 或 PR，必须明确展示成功结果；
16. 如果只完成部分阶段，状态必须报告为 partial，不能把计划或 dry run 当作已实施。

---

## 21. 本方案的最终成功标准

Metaflow 在满足以下全部条件后，才可以宣告 `MCL 1.0` 正式生效：

1. 权威流程、模板、组件模型和风险等级已经进入 `main`；
2. 当前 Viewer、Editor、Design 基线绿色；
3. GitHub Issue / PR / Project / Ruleset 已真实配置并验证；
4. `required / gate` 能阻止失败 PR；
5. Version History 1.1 能兼容旧历史并追踪新 Change；
6. Viewer 至少具备核心 Playwright 和视觉回归；
7. Editor 至少具备导出和 reopen 契约；
8. Design 至少具备 Storybook 构建、视觉和来源检查；
9. Preview、Beta、Stable、smoke 和 rollback 已完成演练；
10. 上游 watcher 和 Sync Proposal 已完成一次真实试点；
11. design-domain onboarding 已完成一次真实试点；
12. Ledger 能从产品能力追溯到 Change、PR、Release 和上游；
13. 流程没有要求当前不存在的第二位审批者；
14. 两次试点后的流程复盘已经删除无价值重复项；
15. 后续任何新 T2/T3 Change 都能由另一名维护者或 Agent 仅阅读仓库资料就继续执行，不依赖当前聊天历史。

达到这些标准后，Metaflow 的正式工作流为：

```text
Signal / Observation
→ Proposal
→ Accept / Park / Reject
→ Change Spec
→ Implementation Plan
→ Agentic TDD Execution
→ Draft PR
→ Automated Evidence
→ Spec Review
→ Code Review
→ Preview / Beta
→ Stable Release
→ Change Ledger / Version History
→ Observation
→ Next Change
```

这条链以 Codex 原生计划与执行提示词为主线，以 SDD 作为契约方法，只选择性吸收 Superpowers 的有用经验；同时利用 Metaflow 已有 Ledger / Version History 的审计优势，把 SuperSplat / Viewer 的上游演进、设计实验和产品反馈统一纳入一个可持续的 Change Lifecycle。
