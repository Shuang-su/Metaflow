# MF-201 · APEC 5.26.1 源码审查

这个分支承载 APEC 的增量源码审查。可见 GitHub 基线为 #200 的登记分支。确切生产产品与构建来自 Netlify 正式 5.26.0 部署 6b0878e6d2d60f3a1ba9dcea，产品提交 3fa19fdb314f5b726403b0912228842f433c00b2，构建记录 2a0758bb5d63f78336aa5c96a2d07379f67d8f2e。

生产基线的 Git 记录由当前 5.26.0 的本地发行工作树保存。此审查分支提交 APEC 成套增量补丁，并使用补丁清单记录实际构建、资源增量和 SHA-256。审核时在确切生产基线应用补丁。

[发行追踪](https://github.com/Shuang-su/Metaflow/issues/201)

## 最终记录

- 本地真实产品提交 18b8702e9878147bac431561f43b9c31f33695e8，发行记录 5c0281808cfc52572ccf85f5cccbecb422b7aa28。
- 附 [精确生产相对补丁](apec-5261-production-relative.patch.gz)、[重放校验](apec-5261-patch-proof.json) 与 [发行验收](verification.md)。
- 补丁从实际生产基线 2a0758bb5d63f78336aa5c96a2d07379f67d8f2e 在独立临时 Git 索引重放后，完整源码树指纹为 2907ab8dd492a03836ea27331c15b6889b276623，与本地发行记录逐项一致。
- 资源增量有 5,231 项，SHA-256 2b8c94d449d26c31d326c65bac98bf468699b299b616b1f9fed52eebd281b6a8。补丁包含本次产品源码、元数据和发行记录。
