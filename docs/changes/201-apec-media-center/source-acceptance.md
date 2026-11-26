# MF-201 · Viewer 5.26.1 源码复跑

正式产品提交 18b8702e9878147bac431561f43b9c31f33695e8，发行记录 5c0281808cfc52572ccf85f5cccbecb422b7aa28。源码验收工作树的测试提交为 7486ef82b8faae464bd8aa171c30245519f1383d。 [仅测试增量补丁](apec-5261-test-follow-up.patch.gz) 从发行记录重放并校验树一致性，补丁解压后 SHA-256 为 9a91e9605a2b04c88ebeb2c11ac442834b11fef428209866666dee57c0d5c475。

独立工作树用发布锁定的 PlayCanvas 2.24.2 重新生成 Viewer dist。仅补充测试引用的源文件和资产夹具。实际活动资产与 Dayun 碰撞夹具包括 87 个按 Git blob 核对的文件和 615 个按 SHA-256 校验的 LFS 对象，合计 2,378,648,547 字节。Dayun 完整 293 tile 声明及 JSON/BIN 路径均通过，没有启用小夹具模式。

## 测试结果

- Viewer 的 npm test 注册 211 项测试，210 通过，1 失败，0 跳过。日志 SHA-256 为 e1043caaaf9134e8ce7cab7e978c85c8d46561a2e91c69aff493a3b4e1b93ca2。
- 通过项包括原生产 104 条目录逐字段与原顺序一致、新增单条 APEC 主路由及小写别名、流式模型身份、公开设置 105 项兼容性、BitCity/SZCAF 原资产和 Dayun 碰撞夹具。
- APEC 测试夹具直接使用发行清单的开场设置，1,177 字节，SHA-256 95f9da4356e5a819afae08aad19314a9a19f8e91aa09c38aa3280806140dc304。
- 唯一失败为 Editor 镜像用当前 Viewer 源码重新计算嵌入导出 Viewer 指纹。5.26.1 Viewer-only 源码指纹为 684d56d381dfb31f70bccd3e17105c752bbf7fdf9992c71a95220332c83047fd，Editor 1.4.0 原发行记录的嵌入来源指纹为 0a6ba089fb2403781b6d8784cc28277f470eae38c0125b77e327ee28656b18f1。
- 在 Editor 1.4.0 实际生产来源 2a0758bb5d63f78336aa5c96a2d07379f67d8f2e 上单独运行同一 verifyEditorMirrors 校验，默认镜像 28 个文件、兼容镜像 27 个文件均通过。两个 Editor 镜像、Editor 版本记录及嵌入来源记录与该生产基线逐字节一致。
