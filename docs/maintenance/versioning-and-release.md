# 版本与发布

本页负责“什么变化产生什么版本、哪些记录必须一致”。把构建产物送入 Netlify publish 目录的步骤见 [部署](deployment.md)。

## Viewer 版本规则

| 变化 | 版本处理 | 示例 |
|---|---|---|
| 资源、thumbnail、settings、兼容 route/alias、Bug、小型兼容行为或部署修复 | PATCH | `5.18.1` |
| 新的向后兼容产品、交互、Loader、数据或架构能力 | MINOR | `5.19.0` |
| 不兼容 URL/settings/index 契约或要求消费者迁移 | MAJOR | `6.0.0` |
| 普通文档、MCL/治理、研究、无行为 refactor、测试维护、未公开 staging | 不提升产品版本 | — |

当前真实状态仍是 display `5.18a`、package `5.18.0`。`5.18a` 及更早字母版本保持不变；下一次真实 Viewer 资源发布或兼容修复使用 `5.18.1`，之后不再创建 `5.18b`。

同一发布同时含资源和兼容修复时共用一个 PATCH；若包含新产品能力则按 MINOR。文件数量与体积影响审查路线，不改变 SemVer 含义。

## 何时不发布

- 资源只进入未公开 staging，没有 index/route；
- 只改变文档、治理或研究资料；
- 只重构内部实现且确认没有行为变化；
- 只修测试或开发工具；
- 只修正历史记录的文字，不改变产品内容。

公开 route、alias、thumbnail、settings 或资源内容一旦变化，即使采用 Direct Commit，也属于 Viewer 产品内容发布。

## Viewer 必须同步的记录

一次真实 Viewer 发布至少保持以下内容一致：

1. [`metadata/version-history.json`](../../metadata/version-history.json) 的 `current` 与新 entry；
2. `data/version-history.json` 公开镜像；
3. `data/index.json.release`；
4. `metaflow-viewer/package.json` 与 lockfile 中的 app SemVer；
5. [Viewer Ledger](../metaflow-viewer-change-ledger.md) 的行为、风险和验证记录；
6. 根 README、文档入口等“当前摘要”，但摘要不是事实源。

Version History 记录结构化版本、日期、实现 commit、route/resource changes、上游和 schema；Ledger 解释动机、修改前行为、实际变化、用户结果、风险、回退和验证。二者不要复制 PR 的完整 Completion Contract。

## 提交和最终 SHA

### 常规 Direct Commit 发布

在本地形成两个原子提交，并在一次 push 中发送：

1. 产品/资源提交：资源、route、生成器输出和必要设置；
2. `chore(release)`：引用前一个产品提交的真实 SHA，更新 Version History、公开镜像、Ledger 和版本摘要。

这样不会把缺少 release record 的中间状态单独推到远端。

### PR / squash merge 发布

PR 内先确定版本和记录内容。由于最终 squash SHA 在合并后才存在，合并后增加一个极小 release-record commit 回填最终 SHA。在 Version History、Ledger、公开镜像和最终 commit 一致前，不把 Issue 标记 `Done`，也不宣称稳定发布完成。

## Editor 独立版本

Editor 使用自己的 [`metadata/editor-version-history.json`](../../metadata/editor-version-history.json)、[Editor Ledger](../metaflow-editor-change-ledger.md)、`data/editor-version-history.json` 和 `metaflow-editor/version.json`。Viewer 发布不会自动改变 Editor 版本，Editor 内部的 Viewer package 版本也不要求与 Viewer 产品上游数字相同。

Editor 行为或上游同步发布时：

1. 更新 Editor metadata current 与 entry；
2. 构建当前 Editor 源码并显式暂存到部署镜像；
3. 运行 `scripts/generate_editor_version.py` 生成公开历史镜像和 runtime version；
4. 更新 Editor Ledger；
5. 验证 tracked bundle、runtime JSON、history 和最终 commit。

具体 `dist → metaflow-editor` 步骤见 [部署](deployment.md)。

## 本地验证

按实际产品面选择，不运行无关组件：

```bash
node --test metaflow-viewer/tests/version-history.test.mjs
node --test metaflow-viewer/tests/editor-version-history.test.mjs
python3 scripts/validate_data.py
python3 scripts/validate_platform.py
git diff --check
```

资源完整性需要完整 checkout 时再使用 `python3 scripts/validate_data.py --check-files`。实际命令、结果、未运行项、最终 SHA 和回退写入 PR、Issue 或直接提交交付。

## 回退

Version History 与 Ledger 只追加，不重写失败发布。回退通过新的记录指向恢复目标，并说明受影响 route、版本和修复 Change；生产 deploy 的恢复流程见 [部署](deployment.md)。
