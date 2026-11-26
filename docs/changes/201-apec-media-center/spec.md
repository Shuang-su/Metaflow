# MF-201 · APEC 媒体中心发布规格

[实时 Issue](https://github.com/Shuang-su/Metaflow/issues/201)

Viewer 5.26.1 为深圳媒体中心新增 /shenzhen/APECMediaCenter，资源标识 apec-media-center-2026。资源使用当前 Viewer 运行和索引协议。

## 体验与数据契约

- 开场使用正式母版的作者机位。场馆标注按旧 Studio 作者目录的 37 个原锚点与独立展示机位映射，保持位置、朝向、视角、同名项目身份和原文。
- 地图使用整站 CAD，区域、标注、碰撞和场景统一转换到 Viewer 坐标。2 号馆经服务通道可连至 3 号馆。保留实测楼层和台阶。
- 场景根路径为 data/Shenzhen/apec-media-center-2026-v1/。使用部署包内 streamed/lod-meta.json 与实际依赖。公开索引保留旧条目原序。
- 起点为实际 Viewer 5.26.0 产品 3fa19fdb314f5b726403b0912228842f433c00b2 和正式构建记录 2a0758bb5d63f78336aa5c96a2d07379f67d8f2e。Editor 1.4.0 保留当前正式版本。

## 验收

使用冻结的资源清单核对隔离候选。按真实 UI 比对原 Studio 标注机位，验证大地图和两馆步行边界。在 [MF-201](https://github.com/Shuang-su/Metaflow/issues/201) 记录现场、源码、隔离部署和生产切换各自的证据。

## SP 标注目录

APEC 使用 Studio A–F 的双语分区、编码及原作机位。顶部下拉、左右切换和实景热点共用目录编码。手机与桌面共用同一顶部栏；手机 Logo 向下避让，展开的菜单在 Logo 上方。区域自动更新保持相机和已打开的详情。

目录和顶栏采用 SuperSplat Viewer 自带的设置面板材质。走近 2 号馆馆界时自动扩大地图全览，手动地图优先。两馆之间以原图、实测地坪和实际步行复核开放通道及闭门。
