# 版本、发布与部署

## 发布类型

| 变化 | 版本处理 | 典型检查 |
|---|---|---|
| Viewer 代码/行为 | 新数字 display 版本与 app SemVer | Viewer test/type/build/E2E、data、CodeQL |
| 纯资源 | 当前数字版本字母后缀 | data 验证、受影响 Viewer |
| Editor 行为/上游同步 | Editor fork 版本 | Editor lint/build/contract、CodeQL |
| 文档 | 不产生产品版本 | docs route |

## 更新事实源

Viewer 更新 `metadata/version-history.json`；Editor 更新 `metadata/editor-version-history.json`。运行生成器后，`data/` 镜像和 index release 元数据必须一致。Editor 发布还要更新 `metaflow-editor/version.json` 和实际 bundle。

不要只修改 root README、package version 或目录名来宣布发布。

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

因此 index 可以快速指向新资源，而资源文件名应尽量不可变。覆盖同路径大文件需要显式 cache 风险评估。

## Controlled release

受控 release workflow 要求：

- 已存在、指向当前 commit 的 namespaced tag；
- 指定受治理 Change 目录；
- Viewer/Editor/Design tag 与组件一致；
- 先验证和构建，再生成不可变证据；
- 只有显式 `promote_production=true` 才进入受保护 production environment。

生产阶段会触发 Netlify build hook、等待 tagged commit ready、核对 published deploy、执行 smoke，最后才创建 GitHub Release。不要用一次成功的 preview 代替这条链路。

## 回滚

rollback workflow 需要明确 deploy ID、原因和 `ROLLBACK` 确认；它恢复已成功的 immutable deploy，验证生产指向，随后创建强制跟进 Issue。

回滚后追加版本历史和修复 Change，不重写原发布记录。

## 文档-only 发布

纯文档 PR 不运行产品 build、E2E 或部署。合并到 `main` 后站点是否重新构建由托管配置决定，但文档任务本身不手动触发 production mutation。
