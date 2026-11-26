# MF-201 · APEC 5.26.1 源码审查

这个分支承载 APEC 的增量源码审查。可见 GitHub 基线为 #200 的登记分支。确切生产产品与构建来自 Netlify 正式 5.26.0 部署 6b0878e6d2d60f3a1ba9dcea，产品提交 3fa19fdb314f5b726403b0912228842f433c00b2，构建记录 2a0758bb5d63f78336aa5c96a2d07379f67d8f2e。

生产基线的 Git 记录由当前 5.26.0 的本地发行工作树保存。此审查分支提交 APEC 成套增量补丁，并使用补丁清单记录实际构建、资源增量和 SHA-256。审核时在确切生产基线应用补丁。

[发行追踪](https://github.com/Shuang-su/Metaflow/issues/201)

## 最终记录

- 本地真实产品提交 18b8702e9878147bac431561f43b9c31f33695e8，发行记录 5c0281808cfc52572ccf85f5cccbecb422b7aa28。
- 附 [精确生产相对补丁](apec-5261-production-relative.patch.gz)、[重放校验](apec-5261-patch-proof.json) 与 [发行验收](verification.md)。
- 补丁从实际生产基线 2a0758bb5d63f78336aa5c96a2d07379f67d8f2e 在独立临时 Git 索引重放后，完整源码树指纹为 2907ab8dd492a03836ea27331c15b6889b276623，与本地发行记录逐项一致。
- 资源增量有 5,231 项，SHA-256 2b8c94d449d26c31d326c65bac98bf468699b299b616b1f9fed52eebd281b6a8。补丁包含本次产品源码、元数据和发行记录。

## Viewer 5.27.0

桌面和移动端共用 SuperSplat 顶部菜单，按 Studio A–F 分区选择 37 个原始展示机位。APEC 全览在馆内接近边界时扩框，手动拖缩和跟随仍可独立使用。中央通道的 L2 Pro 原片和成品地坪共同支持本次碰撞修改。

[相对 5.26.1 生产树的完整增量](apec-5270-production-relative.patch.gz)与[逐文件变更、SHA-256 及重放树](apec-5270-patch-proof.json)可用于本地复现。解压后对清单指定的 base 执行 `git apply --index`，再用 `git write-tree` 核对。线上实测与回退记录见 [MF-201](https://github.com/Shuang-su/Metaflow/issues/201)。

## 与 Mac Studio 发行合并到主线

Viewer 5.27.0 直接继承 Mac Studio 的 Viewer 5.26.0 和独立发行的 Editor 1.4.0。合并包括 Viewer、Director、两代 Editor 源码与发布镜像、公开索引，以及两次发行的记录。5.26.0 准备阶段的记录仍保留在原文件中。两次实际部署的产品提交、构建提交和部署 ID 以[联合发行记录](../../../metadata/netlify-releases/viewer-v5.27.0.json)为准。

完整资源继续由不可变 Netlify 部署交付。资源锁覆盖 105 个入口、57,939 个数据文件和 59,012,720,028 字节。校验包括索引的 SHA-256、每个文件的大小和内容摘要。可恢复单个场景或完整发布目录。大运的流式模型和碰撞位于不同目录，按场景恢复同时包含两者。

```bash
python3 scripts/materialize-data.py --route /shenzhen/dayun --output .codex-work/dayun-data
python3 scripts/materialize-data.py --all --output metaflow-viewer/public/data
```

两代 Editor 继续使用 1.4.0 自带的独立导出 Viewer。重新构建 Editor 导出模块会验证当前源码和实际模块字节。原始发布分支的 Git 提交对象和 5.26.0 索引保存在压缩凭据中，可以从 Netlify 发布提交沿父链验证旧版本。联合源码与各次原始部署使用各自的提交号。

[联合 PR](https://github.com/Shuang-su/Metaflow/pull/200) · [APEC 增量 PR](https://github.com/Shuang-su/Metaflow/pull/203) · [资源锁](../../../metadata/data-releases/active.lock.json)

GitHub 对这次 Git 推送授权了仓库内容写入。原始发行历史还包含九个 Actions 工作流的变化，需要单独的 workflow 写权限。这些差异与 [5.26.0 / 5.27.0 原始工作流补丁](prior-release-workflows.patch)一起保存，可在当前主线使用 `git apply --check` 验证。主线当前实际启用的 CI 与发行工作流沿用合并前的配置。
