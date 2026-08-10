# 版本、发布与部署

## 发布类型与 Viewer SemVer

| 变化 | Viewer 版本处理 | 典型验证 |
|---|---|---|
| 资源、thumbnail、settings、兼容 route/alias、Bug 或小型兼容修复 | PATCH，例如 `5.18.1` | 受影响数据/Viewer 的定向本地验证 |
| 新的向后兼容产品、交互、Loader、数据或架构能力 | MINOR，例如 `5.19.0` | 受影响组件的测试、类型、构建和必要交互验证 |
| 不兼容 URL/settings/index 契约或要求消费者迁移 | MAJOR，例如 `6.0.0` | 迁移、兼容、回滚、发布和观察方案 |
| 文档、治理、研究、无行为 refactor、测试维护、未公开 staging | 不产生产品版本 | 对应文档/治理本地检查 |
| Editor 行为或上游同步 | 使用 Editor 独立版本 | Editor lint/build/contract 及适用验证 |

当前 Viewer 仍为展示版本 `5.18a`、package `5.18.0`。所有历史字母版本保持原样；下一次真实 Viewer 发布为 `5.18.1`，以后不再创建字母后缀。

## 更新事实源

Viewer 更新 `metadata/version-history.json` 和 [Viewer Ledger](../metaflow-viewer-change-ledger.md)；Editor 更新 `metadata/editor-version-history.json` 和自己的 Ledger。运行生成器后，`data/` 镜像和 index release 元数据必须一致。Viewer 实际发布还要同步 package/lock 与当前版本摘要；Editor 发布还要更新 `metaflow-editor/version.json` 和实际 bundle。

Version History 提供机器事实，Ledger 解释动机、原行为、用户结果、风险与证据；二者都不是通用 Completion Contract。不要只修改 root README、package version 或目录名来宣布发布。

常规 Direct Commit 发布先提交产品/资源，再以 `chore(release)` 引用其真实 SHA；两个提交一次 push。Squash PR 合并后必须回填最终 SHA，之后才能把发布标为稳定完成。

## Netlify build

当前 `netlify.toml` 从 `metaflow-viewer/` 执行：

1. 校验 legacy MCL 与平台配置；
2. `npm ci`；
3. 运行 `scripts/generate_index.py`；
4. 构建 Viewer；
5. 把 `data/` 同步到 `public/data/`；
6. 把 `metaflow-editor/` 同步到 `public/editor/`。

发布目录是 `metaflow-viewer/public/`。`/data/*`、`/assets/*`、`/editor/*` 直接提供静态文件，最后的 `/*` 才回退到 Viewer SPA。

## Cache 规则

- `/data/index.json`：`max-age=0, must-revalidate`；
- 大型静态资源与 Editor static：长期 immutable；
- SOG/PLY：二进制内容类型和长期 cache。

index 可以快速指向新资源，而资源文件名应尽量不可变。覆盖同路径大文件需要显式 cache 风险评估。

## 本地验证与按需 CI

执行 Plan、变更路径和风险命中的本地检查，并在 PR、Issue 或直接提交交付中记录命令、结果、环境、未运行项和原因。`scripts/ci-routing.mjs` 可以选择建议检查，但普通 GitHub CI 只按需手动运行，不是所有发布的通用 Gate。

## Controlled release

受控 release workflow 保留给正式发布，要求：

- 已存在、指向当前 commit 的 namespaced tag；
- 指定受治理 Change 目录；
- Viewer/Editor/Design tag 与组件一致；
- 先验证和构建，再生成不可变证据；
- 只有显式 `promote_production=true` 才进入受保护 production environment。

生产阶段会触发 Netlify build hook、等待 tagged commit ready、核对 published deploy、执行 smoke，最后才创建 GitHub Release。不要用一次 preview 或普通 main 合并代替正式发布证据。

## 回滚

rollback workflow 需要明确 deploy ID、原因和 `ROLLBACK` 确认；它恢复已成功的 immutable deploy，验证生产指向，随后创建跟进 Issue。

回滚后追加 Version History、Ledger 和修复 Change，不重写原发布记录。

## 文档-only 交付

纯文档 PR 不运行产品 build、E2E 或部署。合并到 `main` 后站点是否重新构建由托管配置决定，但文档任务本身不手动触发 production mutation。
