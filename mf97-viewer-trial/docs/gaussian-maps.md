# MF-97 分层高斯俯视底图

地图由独立 PlayCanvas 2.22.4 app 离线生成，使用原高斯数据、完整模型变换和正交俯视相机。它不启动原 Viewer 的输入、碰撞或粒子开场，也不修改主视角相机或材质。`gsplat` 的 work-buffer modifier 在模型变换之后按 world Y 过滤高斯中心，过滤改变高斯 scale/alpha；相机 near/far 不代替楼层剖切。

`frame:ready` 的 `ready=true && loading=0` 用于等待实际 LOD、工作缓冲和排序。必须观察到加载或高斯帧，且连续三次有效 ready；已由源空间索引证明没有相交数据的空瓦片单独允许空帧。每次相机移动、切层都重新等待。资产错误、HTTP 错误和着色器错误不能输出完整覆盖。没有查询时限；中断后保留已完成瓦片，下一次先核验哈希再恢复。

## 本次真实生成

| 场景 | 楼层显示切片 | 已生成 / 计划瓦片 | WebP 大小 | 固定源 LOD |
| --- | --- | --- | --- | --- |
| 媒体峰会 | 展览层，world Y −0.8 至 2.5 m | 54 / 54 | 832,974 bytes | 0 |
| 毕业设计展 | 展览层，world Y −1.12 至 2.0 m | 28 / 28 | 237,168 bytes | 0 |

范围覆盖当前原始碰撞元数据的全部 X/Z 已知范围，包含建筑外围没有高斯的空白部分。媒体峰会源只有一个 LOD，毕业展同样只有 LOD 0；这里没有生成或宣称新的低 LOD。源高斯点数分别为 16,386,341 和 14,886,712。首次瓦片准备分别约 10.09 s 和 5.71 s，包含流式资源与排序；后续瓦片通常至少五个有效帧。WebP 为视觉底图，不能当成碰撞、支撑面或多层连通证据。

媒体峰会用户已说明未采集多层。本次只生成两场已知展览层；supportRange 是入口支撑高度附近的地图显示建议，尚未用这些范围自动定义全场导航楼层。大运的多层候选仍须独立核验；华发冰雪世界的 LCC 文件不按可用的 Gaussian/voxel 输入处理。

所有产物位于 `/Volumes/Prism/Metaflow/.codex-work/cache/mf97-navigation/`。地图 manifest 绑定固定 LOD 的全部源文件 SHA-256 清单、碰撞 JSON/bin 哈希、16 元模型变换、显示切片、世界 bounds、分块尺寸及图像哈希。82 个瓦片均由真实浏览器渲染，不是体素地图着色。原始高斯、原始体素和用户标点均只读。

## 复跑

在 MF-97 工作树的 `mf97-viewer-trial/` 内执行；先启动该目录的 Vite preview（默认 5185）。资源只读路由分别为 `/scene-assets/`、`/repository-data/`，旧地图只读路由为 `/mf97-maps/`；续作输出为 `/mf97-continuation-maps/`。新job/maps默认写 continuation-20261002，原82块底图不覆盖。

```sh
node_modules/.bin/tsx scripts/prepare-gaussian-map-job.ts --scene apms-2026 --scenes ../mf79-viewer-trial/scene-exhibitions.json --layers /Volumes/Prism/Metaflow/.codex-work/cache/mf97-navigation/jobs/apms-2026-layers.json
node_modules/.bin/tsx scripts/generate-gaussian-map.ts --job /Volumes/Prism/Metaflow/.codex-work/cache/mf97-navigation/continuation-20261002/jobs/apms-2026.json --origin http://127.0.0.1:5185 --browser '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
node_modules/.bin/tsx scripts/prepare-gaussian-map-job.ts --scene sdi-2026 --scenes ../mf79-viewer-trial/scene-exhibitions.json --layers /Volumes/Prism/Metaflow/.codex-work/cache/mf97-navigation/jobs/sdi-2026-layers.json
node_modules/.bin/tsx scripts/generate-gaussian-map.ts --job /Volumes/Prism/Metaflow/.codex-work/cache/mf97-navigation/continuation-20261002/jobs/sdi-2026.json --origin http://127.0.0.1:5185 --browser '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
node_modules/.bin/tsx --test tests/maps.test.ts
```

更换切片、模型变换、源文件或生成像素尺寸时，准备新 job 并使用新的 output 目录；不能覆盖 fingerprint 不一致的旧缓存。代码不自动安装 Chromium。准备脚本流式计算源哈希，生成串行执行，本轮写盘前保留 5 GiB 空闲（用户授权的MF97续作边界）、Node 进程 RSS 不超过 1.5 GiB。浏览器 GPU 内存尚未得到可靠的跨平台估算，本次未将 Node RSS 当成总 GPU 内存证明。

## Viewer 载入

内部配置 `navigationMapUrl` 或导航 manifest 的 `mapsUrl` 指向地图 manifest。`GaussianMapAssets` 校验源身份、楼层矩形的完整无重叠覆盖、每张图的 SHA-256 和解码尺寸。最多保留 64 MiB 解码图片，切场景/销毁释放 ImageBitmap。地图加载、缺块、资源错误与路线状态独立。

`suggestLayer()` 只给出显示建议；重叠高度范围没有唯一关联时返回 `null`，不能据此吸附人物、切换导航楼层或触发到达。使用方应优先提供已经确认的稳定表面身份，手选地图层只改变所查看的底图。

## 2026-10-03 来源与恢复收紧

地图准备/生成、ground生成共用外置资源策略。新的single/tiled collision provenance绑定sourceHash；分块源不要求一个不存在的总BIN。Gaussian源逐文件流式SHA核验，精确核对有序inventory哈希；拒绝路径逃逸、symlink别名、同大小同mtime的替换以及核验中变化。完成前再次核对全部输入。

地图逐瓦片prepared/binary/manifest中断恢复测试通过；repeat核验后不重渲染、不写入。生成器同样支持独立高斯侧剖面审查。大运新图只能按经过实景核验的局部表面范围生成，不能将长坡高差或半米分桶直接称为建筑楼层。地图和实际导航验收分列，当前进展见唯一实施报告。


本轮大运已实际完成五个局部LOD0视角的来源和解码核对，不等于新底图生成。重叠低位可见室内地面，上位铺装面身份未明；高差连接A/B/中部高斯过于稀疏。未生成或发布未经确认的楼层图。两展原82图像素继续保留；微修正版仅生成独立manifest，绑定新的碰撞版本并记录原map manifest hash与`gaussianUnchanged: true`，复用原图像。
