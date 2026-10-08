# Metaflow Director · ACG 实验入口

本发布包对应 [MF-106](https://github.com/Shuang-su/Metaflow/issues/106)，从 MF-62 已提交候选 `209cd56c` 提取。仅通过已发布 ACG 单文件 SOG/PLY 路径追加 `/director` 使用；已声明环境与主体一起加载。没有 Studio、工程、素材库、在线服务、Frame 或设备装饰入口。

## 构建与运行

需要 Node 20.19+、支持 WebGPU 和浮点渲染的浏览器。无需启动旧实验服务。

```sh
npm --prefix metaflow-director ci
npm --prefix metaflow-director run prepare:source
npm --prefix metaflow-director run type:check
npm --prefix metaflow-director test
npm --prefix metaflow-director run build
npm --prefix metaflow-viewer ci
npm --prefix metaflow-viewer run build
node metaflow-director/preview.mjs
```

预览默认 `http://127.0.0.1:5207/acg/szcaf15/honkai_star_rail-tribbie/director`。`METAFLOW_DATA_ROOT` 可指向只读的现有资源目录；生产始终读取同站 `/data/`，不接受任意模型 URL。发布暂存使用 `node scripts/stage-director-site.mjs`，只包含 Git 登记资源，遇到未物化的 LFS 指针即失败。

相机交接是站内临时状态：Viewer 实际显示的 position/target 按变化节流写入同标签 sessionStorage，30 分钟内且资源及文件引用吻合才使用，否则复用现有 JSON 解析器。交接不改变 Director 自身投影、光圈和画幅。页面内视频镜头仅驻留当前页面，刷新不会恢复工程。

## 来源与许可

- [SuperSplat 3.4.2](https://github.com/playcanvas/supersplat/tree/f76e67633f21b298846c29eceab48ae20579fb4e)，MIT；`upstream/source-lock.json` 固定源码归档及每个源文件 SHA256，首次构建下载并核验，后续核验缓存。上游源不原位修改。
- PlayCanvas 2.22.4、splat-transform 3.6.4，MIT，依赖通过 lockfile 固定；WebP codec 包含 libwebp BSD 许可，保存在 `upstream/licenses/`。没有声称已知其二进制使用的 libwebp 版本。
- 高精度投影、稳定排序、画布分离适配通过 `upstream/*-patch.mjs` 在打包边界应用。`upstream/port-manifest.json` 记录原候选文件来源；产品 UI、资源解析与生命周期在本目录独立维护。
- React、Motion 等许可随构建生成 `/director/THIRD_PARTY_NOTICES.txt`；图标使用 Lucide ISC。摄影条与 Operator 沿用 MF-62 候选 `209cd56c` 的自有 React 组件和动画状态，按本入口范围裁剪；不以通用浮窗替代内联展开。未包含 ui.camera 原始 CSS、专有 SVG 或设备 GLB。
- Open Runde 字体来自 [官方上游](https://github.com/lauridskern/open-runde/tree/3e7ed7f3cdfa5523766db7e430066472615fc935)，固定提交并核验字节，使用 SIL OFL 1.1；`src/assets/open-runde/source.json` 保存来源及哈希，完整许可随第三方声明分发。Metaflow Logo 与字标直接引用现有 Viewer 正式 SVG。
- Mediabunny 1.55.2，MPL-2.0，未修改库源码。构建随包提供 `/director/licenses/mediabunny-1.55.2-source.tar.gz`，内容来自锁定 npm 包的完整 `src`、LICENSE、README 和 package.json。

## 渲染与边界

一个 WebGPU 设备加载主体及环境。32 位投影缓存、场景与累积缓冲；按2026-10-09用户修订，正在调整相机、光圈或焦距时显示高精度 Fast 高斯扩散，状态为“调整预览”。松手后回到四样本圆孔径起步，停止120ms后继续至128/256/512。Fast按圆孔径二阶矩补偿投影与透明度，仍是不同焦外核，不宣称与最终圆孔径逐像素相同；不写入孔径累积或最终缓存。照片和视频强制完整圆孔径、选定采样，视频时间为N/fps，关闭随机Alpha与运动剔除。最终编码的8位输出不代表中间累积精度。

原图对照是独立的预览状态，不改写光圈、机位或视频关键帧。会话最多保留两张完整RGBA32F画面，合计上限128MiB；相机、焦点、光圈、时间、场景修订、尺寸或采样目标改变后不能命中旧状态。降低采样目标时仅恢复该目标的缓存，没有缓存则重建对应前缀，不把高采样平均图误标为低采样。光圈和手动距离拖动中的红色离焦参考使用单独的清晰几何辅助通道，按逆深度离焦量着色，只用于预览合成；不写入孔径缓冲、照片或视频。引擎辅助帧使用内部离屏表面，最终合成器负责可见画布。

该路径可能需要较长的收敛和导出时间，尤其是大模型和 4K。能力不足报错并提供返回 Viewer，不静默降低质量。发丝、透明层、强遮挡和扫描残影仍按 MF-62 独立跟踪；入口和输出验证不等于严格光学验证。
