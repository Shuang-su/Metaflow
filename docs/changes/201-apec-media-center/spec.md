# MF-201 · APEC 媒体中心发布规格

[实时 Issue](https://github.com/Shuang-su/Metaflow/issues/201)

在 Viewer 5.25.2 发布新的深圳媒体中心资源入口。入口路径为 `/shenzhen/APECMediaCenter`，资源标识为 `apec-media-center-2026`。资源使用现有 Viewer 运行和索引协议，本次为兼容资源发布。

## 体验与数据契约

- 开场使用正式母版的作者机位。区域图、地图、碰撞和场景在同一 Viewer 世界中配准。
- 站点提供 2 号馆、馆间服务通道、3 号馆及入口实地复核。步行入口使用可验证落脚点，其他区域保留环视。已测高差和台阶保留其各自高度。
- 场景根路径为 `data/Shenzhen/apec-media-center-2026-v1/`。使用部署包内 `streamed/lod-meta.json` 与实际存在的依赖。公开索引只记录部署资源路径与公开版本。
- 旧生产以 5.25.1 的产品构建 `59fac5306f0eddae69caa0c87624a68a5034ac2b` 为准。其发行登记为 `96705d8dc795a2a943cf069ac7832dfef35ffc45`。新候选从该登记继续开发。
- 用与产品源码提交绑定的资源清单验证隔离构建。切换生产前先比对旧 deploy、其路径大小写及文件清单，再由有授权的发布人决定是否切换。

## 验收

完成的真实产品提交、分支、资源清单与本地及隔离环境验证写入 [MF-201](https://github.com/Shuang-su/Metaflow/issues/201) 对应产品 PR。步行检查覆盖已测楼层与越界保护。完整上下楼路线、实地设备验收与生产结果分别报告。
