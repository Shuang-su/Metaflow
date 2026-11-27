# 5.28.0 首帧加载验收

5.27.0 的 APEC 冷启动曾在 94% 停留约 52 秒，这段时间仍接收约 56.7 MB。5.28.0 以首帧需要的流式分块作为计量范围，已知大小使用压缩字节，旧包的估算总量带「≈」。传输结束后另行显示解码和排序，提交可展示的首帧后才显示 100%。测试覆盖独立 SOG 分块、散文件纹理、缓存、重试、取消和失败。

## 同机位对照

Mac Chrome 手机视口 390 × 844，WebGL2，网络限速下行 4 MB/s、往返延迟设置 45 ms。每组使用独立浏览器上下文，时间从页面导航计至首帧提交。传输量为浏览器记录的流式资源传输字节，包含响应头。

| APEC 开场 | 首帧 | 传输量 | 首帧高斯数 |
| --- | ---: | ---: | ---: |
| 原调度，逐层细化 | 23.46 s | 70.93 MB | 1,974,083 |
| 自动选择首视野所需层级 | 22.86 s | 67.53 MB | 1,974,083 |

两次首帧的相机位置、朝向、85° 视场和动画时间 0 均一致。自动选择少请求了一个 3,399,497 字节的中间分块。以上时间各来自一次受控测量，真实访问耗时随网络、设备和缓存变化。南海意库桌面强制对照首帧均为 3,977,096 点；手机限速强制对照首帧点数有变化，因此正式配置沿用原调度。深圳大学粤海校区的原生环绕轨迹在桌面和手机视口强制传入目标层参数时仍按原顺序加载。

## 上线与回退

生产部署为 `6b0925ac0483790e1aeae289`，构建提交为 `e4caec8e8a798b7dba36a43dfadf9ee5cd035cb2`。58,109 个站点文件中更新了 Viewer、构建标识、公开索引和版本记录。发布时核验了完整文件清单，并从正式域名重新读取这四个文件和 APEC 入口。数据锁另包含 57,939 个数据文件。Viewer 自动测试通过 216 项，大运数据依赖使用仓库的小型测试夹具。移动端证据来自 Chrome 手机视口与触控模拟。

APEC 桌面 WebGPU 在待发布地址完整走完 20 秒八字并成功手动接管。实际浏览记录见 [Issue #205](https://github.com/Shuang-su/Metaflow/issues/205)。可在正式入口单独切回逐层加载，也可以恢复上一份已核验的部署。 [正式入口](https://metaflow.shuang-su.com/shenzhen/APECMediaCenter/) · [逐层加载对照](https://metaflow.shuang-su.com/shenzhen/APECMediaCenter/?openingStrategy=coarse) · [上一部署 5.27.0](https://6b08b2e3966942054cc16160--charming-salamander-fc1af0.netlify.app/shenzhen/APECMediaCenter/)

早期方案和术语参考 [项目 LCC 开场研究](https://github.com/Shuang-su/Metaflow/issues/50)、[画质预算研究](https://github.com/Shuang-su/Metaflow/issues/54) 及 [LCC Web SDK 性能指南](https://docs.xgrids.com/en-us/07-plugin-sdk/03-web/v0.6.6/002-performance-guide.html)。此次调度使用 PlayCanvas 根据当前镜头和预算求出的近细远粗分块集合。
