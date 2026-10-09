# Director 光学诊断（本地）

此目录是 MF-106／MF-62 的因果验收入口，不是公开摄影 UI，也不加入 Vite 的发布入口。它使用产品 `CandidateSession`、固定 SuperSplat 3.4.2 来源及摄影补丁；参考站源文件不在本目录或发布包中。

- `fixture.ts` 生成七点深度排序场景和单白点场景，不读取原资产。七点包括间距 0.003 的前绿后红高斯和 100000 单位远点；它能区分范围量化造成的排序错误与同深度稳定性。
- `optical.ts` 固定机位、背景、孔径及只读模型 URL，保存清晰、Fast、4—512 孔径阶段。同源 CPU Float64 求和检查 GPU 累积；它不是独立光学真值，也不是不含读回的性能基准。
- `thin-lens-reference.py` 使用独立 Cartesian 圆孔径求积及圆盘边缘分布的解析积分，检查受控不透明／0.5 透明平面。它不调用高斯加载、GPU 排序、产品孔径序列或绘制。模型内叠加高斯的透明度与物理表面参数不等价，不能将其当作扫描人物的逐像素真值。

开发服务准备好只读 `/data/` 以及 `/fixture/depth-ramp.ply`、`/fixture/depth-layers.ply` 后，打开 `/director/diagnostics/index.html`（开发 base 为 `/director/`）。页面将诊断方法公开为 `window.__opticalParity`，供当前页面的开发者工具取证；生产入口没有此对象。先后运行各场景，不同时占用 GPU。

独立参照运行方式：

```sh
python3 metaflow-director/diagnostics/thin-lens-reference.py \
  --output .codex-work/downloads/director-thin-lens
```

需要 NumPy 和 Pillow。只输出局部图、参数与误差统计，不保存整套浮点样本或复制大模型。模型哈希、来源构建哈希、原始录帧、当前 Spark 对照、中文说明和公开附件索引见 MF-106 的唯一验证记录；历史来源与当前结果分别标识。
