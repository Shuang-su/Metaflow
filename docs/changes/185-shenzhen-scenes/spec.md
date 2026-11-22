# MF-185 深圳场景发布规格

[Issue #185](https://github.com/Shuang-su/Metaflow/issues/185) 记录名称、地址与验收。深圳分类新增以下四项。

| 场景 | 英文显示名 | /shenzhen 下的正式路径 | 同目录别名 |
| --- | --- | --- | --- |
| 南海意库3栋 | Nanhai E-Cool | nanhai-e-cool-building-3 | |
| 深圳大学粤海校区 | Shenzhen University (Yuehai Campus) | shenzhen-university-yuehai-campus | szu、shenzhendaxue、shenzhendaxueyuehai |
| 前海冰雪世界（华发冰雪世界） | Huafa Ice and Snow World | huafa-ice-and-snow-world | qianhaibingxueshijie、huafabingxueshijie |
| 深圳市民中心 | Shenzhen Civic Center | shenzhen-civic-center | shiminzhongxin |

每个别名传递查询参数，包括轨道、书签和渲染后端。三个 SP 场景保留各自环境、相机动画、复合场景变换、碰撞和交互。市民中心以运行中的融合模型及外围视频层为依据。

南海意库使用同一主体 SH3 母版独立生成每一粗层，保留首个实际点数低于 150 万的层。所有主体块使用 SOG v3、262144 项上限的 SH 码本和 10 次迭代。环境独立加载。单张小地图取自去顶正交重建，使用现场示意图配准，显示当前支撑楼层、位置和朝向。局部补面具有实际高度和边界，可开关复核。验收包括外部台阶往返与重叠区域上下分别通行。

预览和生产均验证模型身份、实际绘制帧、粗细切换、WebGPU 和 WebGL2，抽查大运与笔架山。实体移动设备的结果单独记录。

小地图采用用户圈定的连续场地，按原图旋转 180°，以原始 SH3 颜色做正交重建。后翼红框使用灰底、可证实的隔墙和楼梯线稿；平面补绘只参与显示。Viewer 工具栏的地图按钮控制同一张底图。地图沿用 SP 浮窗布局、拖动、缩放和地图相机，面板仅提供「跟随」「全览」两种视图，省去北向标记与地图全屏入口。
