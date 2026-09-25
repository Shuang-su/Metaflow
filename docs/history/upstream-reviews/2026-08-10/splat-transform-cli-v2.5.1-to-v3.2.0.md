# Transform CLI 三方审查：v2.5.1 / 当前资产契约 / v3.3.0

> **独立决策：Adopt（只规划版本固定的离线包装器，尚未实现）。** 文件名保留原计划 `...to-v3.2.0` 的稳定入口；执行期间发布的 `v3.3.0` 已扩入真实比较区间，`v3.2.0` 保留为不可变中间快照。Transform 不是 Metaflow 产品，不创建 `metaflow-transform/`，不进入产品 Version History，也不修改 Editor 的库依赖。

## 1. 对象、身份与边界

| 角色 | 对象 | 精确身份 |
|---|---|---|
| B：当前工具基准 | `references/splat-transform-v2.5.1/` | tag `v2.5.1`；commit `ed9162f927fa4af22d2ef18973bc93704aa1b7a0`；tree `983ece31371f480d17e5ada5d31c559d000c86cb`；207 tracked files |
| M：当前 Metaflow 契约 | 现有 SOG、LOD、voxel/collision 资源与未来 Agent 上传需求 | 仓库没有独立 Transform 产品或 active source；M 是输入/输出和运行合同，不是假想目录 |
| N：最新候选 | `references/splat-transform-v3.3.0/` | tag `v3.3.0`；commit `57883c2c7bda5bcfb60a8b402ababacc286e49ae`；tree `52f625a55067939efc733b15cfab57b33d7f2067`；310 tracked files |
| 区间中间快照 | `references/splat-transform-v3.2.0/` | 原计划候选；用于证明 adaptive 默认值在 `v3.2.0` 引入、又在 `v3.3.0` 回切 |

B→N 为 207 files、33,474 insertions、6,480 deletions、53 个上游 commit。N 使用已安装的 Node `22.20.0` 运行；仓库根 `.nvmrc` 继续保持 `20.19.0`。

一次性副本位于 `.codex-work/tmp/splat-transform-review/`。CLI build 在 Git worktree 内的副本会把外层 Metaflow commit 写入版本 banner 的括号 revision；该短 revision **不是** upstream snapshot 身份。tag/commit/tree 以 `metadata/reference-snapshots.json` 为唯一事实源。

## 2. B → N：完整 stable release 区间

| 版本 | Added / Changed | Fixed | Breaking / 迁移影响 |
|---|---|---|---|
| [`v2.5.2`](https://github.com/playcanvas/splat-transform/releases/tag/v2.5.2) | — | 大场景 GPU decimation；不再吞掉 GPU failure | 失败开始显式退出，自动化不能再假设静默成功 |
| [`v2.6.0`](https://github.com/playcanvas/splat-transform/releases/tag/v2.6.0) | LCC2 read；LOD/voxel asset metadata；SOG parallel worker pool；依赖更新 | PC2.19 后黑图；PLY header 空白；LCC2 peak memory 减半 | metadata 增加字段；SOG 执行模型变化 |
| [`v2.7.0`](https://github.com/playcanvas/splat-transform/releases/tag/v2.7.0) | GLB SCALE 改为 KHR_gaussian_splatting 线性空间；`--lod -1` environment | — | GLB 数值语义改变；旧消费者需按规范读取 |
| [`v2.7.1`](https://github.com/playcanvas/splat-transform/releases/tag/v2.7.1) | 依赖更新 | degenerate splat 的 O(N²) KD-tree/hang 与 decimate stall guard | 失败/耗时边界改善 |
| [`v3.0.0`](https://github.com/playcanvas/splat-transform/releases/tag/v3.0.0) | streaming `ChunkSource` 重写；内存按 chunk 而非全 scene；CLI flag rationalization | — | **主要 breaking**：大量短/长参数改名，旧命令不得直传 |
| [`v3.1.0`](https://github.com/playcanvas/splat-transform/releases/tag/v3.1.0) | streamed SOG loading；large voxel optimization | — | SOG/voxel 可扩展性与执行路径变化 |
| [`v3.1.1`](https://github.com/playcanvas/splat-transform/releases/tag/v3.1.1) | 文档输出格式更新 | Float64 block-mask 导致 GPU dilation hang | voxel/GPU 稳定性改善 |
| [`v3.1.2`](https://github.com/playcanvas/splat-transform/releases/tag/v3.1.2) | — | flyaway splat 导致的 decimation 病理慢与 GPU buffer overflow | decimation failure 边界改变 |
| [`v3.1.3`](https://github.com/playcanvas/splat-transform/releases/tag/v3.1.3) | — | flat splat 的 all-null SOG scales codebook | 特殊 scale 资源兼容 |
| [`v3.1.4`](https://github.com/playcanvas/splat-transform/releases/tag/v3.1.4) | `--filter-nan` 也删除 zero-norm quaternion | — | filter 结果点数可能比 v2 少；属于语义变化 |
| [`v3.1.5`](https://github.com/playcanvas/splat-transform/releases/tag/v3.1.5) | `--stats` 增加 fill/overdraw ratio | — | 可用于 Agent 质量/性能预检 |
| [`v3.1.6`](https://github.com/playcanvas/splat-transform/releases/tag/v3.1.6) | HTTP range fallback | range response 没有 size 时继续读取 | remote URL 兼容增强 |
| [`v3.1.7`](https://github.com/playcanvas/splat-transform/releases/tag/v3.1.7) | `--info/--stats` 报 input format 与 extra columns；pre-v1 lod-meta read | — | 正是 Editor `v2.32.3` 使用的库版本，但不等同 CLI Adopt |
| [`v3.2.0`](https://github.com/playcanvas/splat-transform/releases/tag/v3.2.0) | adaptive decimation 成为默认；旧 uniform fork 到 `--decimate-uniform`；读写携带 antialiased/2dgs model | — | 默认算法发生行为变化；裸 `--decimate` 不再等价于 v2 |
| [`v3.3.0`](https://github.com/playcanvas/splat-transform/releases/tag/v3.3.0) | 每叶节点 LOD approximation `errors`；依赖更新；uniform 再次成为默认，adaptive 改为 `--decimate-adaptive` | — | 默认算法再次回切；任何依赖默认值的脚本都不具备跨版本可重复性 |

## 3. v2 → v3 CLI 破坏性映射

包装器必须解析语义并生成新 argv；禁止把旧字符串命令直接转发。尤其是旧短参数在 v3 可能代表另一项合法操作，比“unknown option”更危险。

| v2.5.1 | v3.3.0 | 迁移规则 / 风险 |
|---|---|---|
| `-F, --decimate <n|n%>` | `-d, --decimate`（uniform）；`--decimate-adaptive`（adaptive） | 必须要求 job 显式指定 `algorithm: uniform|adaptive`；旧 `-F` 在 v3 是 filter-floaters，**禁止直传** |
| `-G, --filter-floaters` | `-F, --filter-floaters` | 生成新短参数或只用 long flag |
| `-D, --filter-cluster` | `-C, --filter-cluster` | 旧 `-D` 不复用 |
| `-l, --lod` | `-l, --tag-lod` | long name 改变；environment `-1` 允许 |
| `-m, --summary` | `--stats [text|json]` 或 `--info [text|json]` | 结构信息与数值统计分离；v3 的 `-m` 是 morton-order，**禁止直传** |
| `-M, --morton-order` | `-m, --morton-order` | short flag 交换 |
| `--iterations` / `-i` | `--sh-iterations` / `-i` | long name 改变，short 保留 |
| `--mem` | `--memory` | Agent 必须从 stderr/progress 提取 peak，不解析人类 TTY 控制符 |
| `-L, --list-gpus` | `--list-gpus` | v3 `-L` 是 `--select-lod`，**禁止直传** |
| `-O, --lod-select` | `-L, --select-lod` | 名称和 short 都改变 |
| `-E, --viewer-settings` | `--viewer-settings` | short 移除 |
| `-U, --unbundled` | `--unbundled` | short 移除 |
| `-C, --lod-chunk-count` | `--lod-chunk-count` | v3 `-C` 是 filter-cluster，**禁止直传** |
| `-X, --lod-chunk-extent` | `--lod-chunk-extent` | short 移除 |
| `--voxel-params size,opacity` | `--voxel-size` + `--voxel-opacity` | 拆成两个显式字段，不能拼回旧 tuple |
| `-K, --collision-mesh` | `--collision-mesh` | short 移除 |
| `--camera` / `--look-at` / `--up` / `--fov` / `--near` | `--camera-pos` / `--camera-target` / `--camera-up` / `--camera-fov` / `--camera-near` | camera JSON 字段固定映射，不允许 raw flag |
| `--camera-end` / `--look-at-end` / `--up-end` | `--camera-pos-end` / `--camera-target-end` / `--camera-up-end` | motion blur 字段改名 |

实测旧 `--summary`、`--lod`、`--iterations`、`--camera` 在 v3 非零退出；旧 `-F` 更危险，会进入 floaters filter 而不是 decimation。后续 wrapper 应完全拒绝 `rawArgs`，从 typed job schema 生成 argv。

## 4. B → M 与 M ↔ N：能力处置矩阵

M 不是代码 fork，而是当前资产与自动化需求。`Keep` 表示继续支持现有资产合同；`Port` 表示由 wrapper 映射；`Replace` 表示采用 N 的新语义；`Drop` 表示不再暴露旧 raw CLI；`Conflict` 表示必须显式拒绝或设置 Gate。

| 功能区域 | B 行为 | M 当前/未来需要 | N 行为 | 处置 | 风险 / 工作量 | 验证与未验证 |
|---|---|---|---|---|---|---|
| Gaussian PLY | read/write | 小型转换、Agent 上传基本输入 | streaming read/write、header 更宽容 | **Keep + Replace** reader | 中 / S | 1,476 点 SH3 fixture；转换通过 |
| 普通 mesh PLY | CLI 文件名同为 `.ply`，但 schema 期待 Gaussian columns | 计划曾要求“小型 mesh PLY” | N 仍不是通用 mesh converter | **Conflict**：preflight 检测并明确拒绝；不得伪装支持 | 中 / S | 真实 mesh PLY 在 v2/v3 均报 invalid PLY property/header |
| compressed PLY | 支持 | 现有 Editor/资产互换 | 支持 | **Keep** | 低 / S | N 输出约 59 KB，可读回 |
| SOG | encode/decode | 现有主要资产与 Viewer | streamed read、parallel/inline encode、特殊 scale fixes | **Replace** 底层，Keep Viewer 合同 | 高 / M | 小样本、Top10 现有 SOG、roundtrip 已跑 |
| SPZ | v4 output/read | Agent 轻量交换 | 支持 v3/v4 | **Keep** | 中 / S | N 输出 magic `NGSP`、version 4、1,476 points |
| SPLAT | 可读；output 未在 help 明列但 writer 存在 | legacy exchange | 实测仍可输出/读回，SH 降到0 | **Keep with warning** | 中 / S | N 1,476 points；必须在 manifest 记录 SH loss |
| LOD / streamed SOG | `lod-meta.json`，较旧 schema | 当前 Viewer LOD 与未来生成 | v1 header、counts、stream read；v3.3 每叶 errors | **Replace** generator，Keep required fields | 高 / M | 2-level/16 leaves 实测；见下文 |
| LCC | read | 外部资产可能输入 | 支持 | **Keep** | 中 / S | 静态与上游 tests；本地真实 fixture未跑 |
| LCC2 | B 不支持 | 未来输入 | N 支持并优化 memory | **Keep (N)** | 中 / M | 上游 tests/静态；本地真实 fixture **未验证** |
| HTML | bundled/unbundled | 离线预览/Agent结果 | Viewer bundle 更新 | **Keep** | 中 / S | v2/v3.2/v3.3 浏览器打开；见截图 |
| GLB | KHR_gaussian_splatting | 第三方交换 | SCALE linear-space 修复 | **Replace** | 中 / S | N glTF2 header，有效 GLB |
| CSV | 输出列 | 调试/分析 | 支持 | **Keep** | 低 / S | N 输出约1.1 MB |
| WebP | GPU rasterizer | 可打开性/预览 | render/camera 参数改名，equirect/motion | **Port** camera schema | 高 / M | N 可见 640×360；平台 golden 有2项差异 |
| voxel/collision | v1.0/1.1 metadata、bin、GLB | Xun single、Dayun tiled、Viewer collision | metadata asset、large optimization、schema兼容 | **Keep + Replace** writer | 高 / M | N 输出被当前 Viewer真实 loader 载入并查询 |
| translate/rotate/scale | actions | 上传标准化 | 保留 | **Keep** | 低 / S | v2/v3 同 count/bounds语义；hash可不同 |
| filter | box/sphere/value/harmonics/nan/floaters/cluster | 清理与安全预检 | `filter-nan`增加 zero quaternion；short flags变化 | **Port + Replace** | 中 / M | 基本filter通过；zero quaternion由上游tests覆盖 |
| uniform decimation | B 唯一算法 | 需可重复旧语义 | v3.3再次成为 `--decimate` 默认 | **Replace** flag但显式 `algorithm=uniform` | 高 / M | 与 v3.2 `--decimate-uniform` 字节一致 |
| adaptive decimation | B 无独立选择 | 混合尺度内容需要 | v3.3 `--decimate-adaptive` | **Keep (N)**，显式选择 | 高 / M | 与 v3.2 默认 `--decimate` 字节一致；质量需按资产评估 |
| GPU | SOG/voxel/filter | 本机 Apple M1 Pro 可用 | WebGPU device、显式失败 | **Keep** | 高 / M | SOG/voxel/WebP GPU 成功；GPU故障注入未跑 |
| CPU | 基本转换/decimation，可 `--gpu cpu` | 无GPU环境的预检/SOG fallback | SOG CPU可成功；voxel要求GPU并清晰失败 | **Keep with capability gate** | 中 / S | N CPU SOG code0；CPU voxel code1 `writeVoxel requires...GPU` |
| remote URL | 支持 HTTP(S) | Agent上传/远端对象 | range/stream fallback增强 | **Replace** reader | 高 / M | N 通过本地 HTTP 实际读取并输出33,420-byte SPZ；鉴权URL未验 |
| streaming / scratch spill | B较多 resident路径 | 大文件与Agent隔离 | chunk-bounded source、`--scratch-dir` | **Keep (N)** | 高 / L | 上游tests；真实超内存spill和中断恢复 **未验证** |
| `--info json` | 无 | Agent结构预检 | JSON stdout | **Keep (N)** | 低 / S | code0、纯JSON、格式/LOD/extra columns可读 |
| `--stats json` | `--summary` text | Agent质量、bounds、NaN/Inf/fill | JSON统计 | **Replace** | 中 / S | code0；point count/bounds/SH/fill已比较 |
| exit/stdout/stderr | 人类CLI为主 | 机器可判定 | 成功0，输入/overwrite/unknown非0，error在stderr | **Keep (N)** | 中 / S | missing input、existing output、old option均实测 |
| quiet/no-tty/progress | 有 `quiet/tty` | stdout必须可解析，progress不能污染 | `--quiet`、`--no-tty`、`--memory` | **Port** typed policy | 中 / S | quiet成功无额外stdout；nonquiet含稳定阶段/peak |
| overwrite/repeat | `-w` | 默认保护已有输出、job可重试 | 明确code1与`Use -w`；相同transform repeat可字节一致 | **Keep** | 中 / S | 已实测；压缩类不要求字节一致 |
| raw v2 command strings | 可直接运行 | 旧脚本可能存在 | short flag发生碰撞 | **Drop** 对外raw接口；只接受typed schema并映射 | 极高 / M | 映射表固定，无“实现时再决定” |

## 5. 构建与自动测试

| 对象 | Node | install/lint/build | tests | npm audit / 说明 |
|---|---|---|---|---|
| B `v2.5.1` | `20.19.0` | 通过 | 491：488 pass、3 fail | 8 vulnerabilities；3项均为本机 render golden，生成 tiny/empty 差异，不是格式/CLI failure |
| 中间 `v3.2.0` | `22.20.0` | 通过 | 796：794 pass、2 fail | 6 vulnerabilities；失败为 `mid` byte length 与 `tiny-dof` bytes |
| N `v3.3.0` | `22.20.0` | `npm ci`、lint、build通过 | 811：809 pass、2 fail | 6：1 low、5 high；build约139.97s，最大RSS约1.52GB |

N 的两项失败经定向重跑确认：

- `mid`: actual 227,396 bytes，golden 227,470 bytes；
- `tiny-dof`: byte content 与 golden 不同；
- `tiny` 通过；其余809项通过，包括CLI parser、uniform/adaptive、remote/range、LOD errors、SOG、voxel与GLB conformance。

因此本轮把它们记录为平台渲染 golden 差异，不把全量测试写成“全部通过”，也不忽略其对严格像素回归的风险。

## 6. CLI 与格式实测

### 6.1 Gaussian样本与mesh拒绝

- 真实小型 mesh PLY（含 face list）在B和N都失败，错误为Gaussian PLY property/header不成立。结论：工具的“PLY”是Gaussian/point schema，不是任意三角网格；future Agent preflight必须先区分。
- Gaussian样本：1,476 points、SH3、bounds约 `x[-383.266,479.757]`、`y[-318.852,123.990]`、`z[-514.529,514.690]`，fill `0.456226`，无NaN/Inf。
- translate/rotate/scale/filter后，B与v3保持点数和SH2/几何合同；压缩/重排hash不同，不要求逐字节一致。

### 6.2 uniform 与 adaptive 不能混为一个结论

在同一1,476点、SH2输入上，50%输出均为738点、122,035 bytes：

| 命令 | 算法 | real / max RSS | SHA-256 | fill ratio |
|---|---|---|---|---|
| `v3.2 --decimate 50%` | adaptive（当时默认） | 3.78s / 148.9MB | `80ed34870a539d8736f36323c2946ec8085f247a18b490662264a27a3fac4582` | `1.29699` |
| `v3.2 --decimate-uniform 50%` | uniform | 3.50s / 141.6MB | `2fe6d634e64109e4d1672733b803a856d789493426dbdd4cca14df921c9524c2` | `0.624966` |
| `v3.3 --decimate 50%` | uniform（再次成为默认） | 3.35s / 142.2MB | `2fe6d634e64109e4d1672733b803a856d789493426dbdd4cca14df921c9524c2` | `0.624966` |
| `v3.3 --decimate-adaptive 50%` | adaptive | 3.65s / 156.3MB | `80ed34870a539d8736f36323c2946ec8085f247a18b490662264a27a3fac4582` | `1.29699` |

跨版本字节相等直接证明算法实现延续、默认flag改变。wrapper必须输出明确算法、版本和参数，不能记录成笼统“decimated”。Adaptive更适合mixed-scale内容的上游主张仍需按真实资产做视觉质量验收；本轮没有用fill ratio替代主观/渲染质量。

### 6.3 SOG、LOD、voxel

| 项目 | 实测结果 |
|---|---|
| 小样本SOG | B 75,137 bytes、5.86s、RSS177MB；v3.2 75,064 bytes、2.32s、RSS244MB；同点数/SH/结构但codebook/hash不同。N另对1,476点SH2输出57.7KB并可读回。 |
| 现有Top10 SOG | 输入11,489,463 bytes、969,029 points、SH0、bounds保持；v3.2 roundtrip 11,457,898 bytes、4.34s、RSS555.9MB，点数/bounds/SH不变，fill `56.828→56.830`。N的SOG writer非v3.3变更面，并由N全测与小样本覆盖；没有谎称在N重跑同一大文件。 |
| v3.2单层LOD | schema v1，`asset.generator/count/counts`；1,476 points、1 level。B旧schema缺这些字段。 |
| N双层LOD | counts `[1476,738]`、16 leaf nodes；每个leaf都有2项errors，level0为0，level1范围约`0.6104963..0.9696297`；v3.2同输入没有errors。 |
| voxel/collision v2↔v3.2 | 相同输入的`.voxel.bin`与collision GLB hash一致；v3只增加`asset.generator`。 |
| N voxel | schema1.1、resolution5、grid104×52×88、treeDepth5、leafSize4、nodeStride1；当前M的真实`loadVoxelCollision`成功载入并查询`originFree=true`。 |
| 当前资产兼容 | Xunyangpai v1.0 single voxel与Dayun v1.1 tiled所需字段都存在；Viewer忽略加法`asset`字段。 |

### 6.4 其他输出、GPU/CPU与remote

N对同一小样本实际生成并结构检查：

| 输出/路径 | 结果 |
|---|---|
| compressed PLY | 约59KB，可读回 |
| SPZ | 约33KB，magic `NGSP`、version4、1,476 points、SH2 |
| SPLAT | 约46KB，可读回1,476 points、SH0；报告SH loss |
| GLB | 约228KB，glTF binary v2，KHR_gaussian_splatting数值测试通过 |
| CSV | 约1.1MB，列可读 |
| HTML | 2.9MB；WebGPU打开，title `SuperSplat Viewer`；唯一console error为favicon 404；[N HTML截图](evidence/transform/splat-transform-v3.3.0-html.png) |
| WebP | 640×360、约12.3KB、可见；[N WebP](evidence/transform/splat-transform-v3.3.0-webp.webp) |
| GPU | Apple M1 Pro上SOG、voxel、WebP成功；未做GPU失效注入 |
| CPU | `--gpu cpu`的SOG成功且quiet；voxel明确code1：`writeVoxel requires a createDevice function for GPU voxelization` |
| remote URL | N通过本地HTTP真实读取PLY并输出33,420-byte SPZ；server收到实际GET；带鉴权URL、断点恢复未验证 |

历史v2/v3.2 HTML浏览器截图也保留：[v2](evidence/transform/page-2026-08-10T17-01-51-364Z.png)、[v3.2](evidence/transform/page-2026-08-10T17-02-37-630Z.png)。原始DOM/console见 [`evidence/transform/raw/`](evidence/transform/raw/)。

## 7. Agent自动化合同实测

| 合同 | 结果 |
|---|---|
| `--info=json` | code0；stdout为单一JSON，包含format、numGaussians、numLods、lodCounts、SH bands、model、layers、extraColumns |
| `--stats=json` | code0；在info基础上提供每列min/max/median/mean/stdDev、NaN/Inf、histogram与fillRatio |
| missing input | code1；stdout为空；stderr含清晰ENOENT |
| existing output without overwrite | code1；提示`Use -w`；不覆盖 |
| quiet/no-tty | 成功路径没有进度污染；可把stdout保留给JSON |
| nonquiet/progress/memory | 阶段名称、完成/失败与peak memory可见；wrapper应作为stderr日志而非JSON解析 |
| repeat | 相同transform/filter重复运行可字节一致；SOG/codebook类只要求结构/统计容差，不要求字节一致 |
| old flags | unknown option非零退出；短flag碰撞必须由schema层提前拒绝 |

## 8. 未验证与已知限制

- 真实LCC/LCC2本地fixture、超大streamed URL、断点/range异常：**未验证**。
- `--scratch-dir`在真实内存压力下spill、进程中断清理和磁盘满恢复：**未验证**；仅有上游tests/static证据。
- adaptive/uniform在真实sky、室内、人物、tiled城市资产上的主观质量和Viewer FPS：**未验证**，不能用小样本fill代替。
- GPU OOM/device-lost/error injection：**未验证**。
- authenticated remote URL、SSRF/allowlist、上传隔离和恶意文件资源上限：属于future Agent研究，**未验证**。
- render golden 2项失败已记录；HTML/WebP可打开不等于所有相机/平台像素一致。
- 普通mesh PLY已验证不支持；这是明确拒绝合同，不是待实现隐式功能。

## 9. 决策：Adopt（离线工具）

### 9.1 收益

1. streaming ChunkSource、remote/range、SOG与large voxel改进适合离线大资产；
2. `--info/--stats json`、稳定exit code、quiet/no-tty与显式overwrite可形成Agent机器合同；
3. v3.3 per-leaf LOD errors为未来预算/质量选择提供数据；
4. uniform与adaptive都保留，且本轮已经量化其语义与默认值风险；
5. LCC2、SPZ4、GLB规范修复和filter健壮性扩展输入输出能力。

### 9.2 风险、工作量与回退

- 风险：中高。主要是CLI breaking、Node22隔离、恶意/超大输入、GPU能力、decimation算法显式化与格式数值兼容。
- 估算：版本固定离线wrapper与本地测试4–7个工程人日；Agent上传安全/队列/对象存储是后续独立研究，不包含在此估算。
- 回退：wrapper未成为生产产品，最小回退是停止启用v3 job入口并继续使用当前已知v2.5.1资产命令；任何回退都必须由typed schema重新生成v2 argv，禁止把v3或旧raw命令串互相复用。

## 10. 后续唯一实现 Spec

### 10.1 范围

实现一个版本固定、仅离线调用的CLI wrapper。它不是Viewer/Editor依赖，不部署到生产前端，不产生产品版本，不创建`metaflow-transform/`。允许的tracked范围建议为：

```text
scripts/splat-transform-wrapper.mjs
metadata/toolchains/splat-transform-v3.3.0.json
metadata/schemas/splat-transform-job.schema.json
scripts/tests/splat-transform-wrapper.test.mjs
docs/maintenance/splat-transform-offline.md
```

工具安装、cache、scratch和输出继续写入`.codex-work/cache|tmp|downloads/`，不写references。

### 10.2 可观察需求

| ID | 必须满足的合同 |
|---|---|
| T-01 | toolchain固定tag `v3.3.0`、commit `57883c2...`、tree `52f625a...`、package lock digest和Node `22.20.0`；启动时验证，不满足即失败。 |
| T-02 | 根`.nvmrc`保持`20.19.0`；wrapper显式解析隔离Node22路径，禁止全仓升级或依赖用户当前`node`。 |
| T-03 | 输入只能是typed job JSON；禁止`rawArgs`、shell字符串和未映射v2 flags。argv用`spawn`数组构造。 |
| T-04 | decimation必须指定`algorithm: uniform|adaptive`；manifest记录实际flag、target、版本、输入hash和输出统计。 |
| T-05 | `info`与`stats`以JSON返回；stdout只输出最终机器JSON，progress/warning/error进入stderr，固定`--no-tty`。 |
| T-06 | 默认不overwrite；显式`overwrite:true`才加`--overwrite`；目标必须位于当前job的精确输出目录。 |
| T-07 | scratch使用`.codex-work/tmp/splat-transform/<job-id>/`；启动校验空间，成功/失败都生成状态，清理只针对已解析精确目录。 |
| T-08 | format白名单覆盖Gaussian PLY/compressed PLY/SOG/SPZ/SPLAT/LOD/LCC/LCC2/HTML/GLB/CSV/WebP/voxel；mesh PLY preflight清晰拒绝。 |
| T-09 | GPU capability在执行前检查；voxel/filter GPU-only任务无GPU即受控失败；SOG允许经过验证的CPU fallback。 |
| T-10 | remote URL默认拒绝；研究模式必须显式allowlist scheme/host、限制size/time/range/redirect并禁止内网SSRF。 |
| T-11 | 每个成功job输出manifest：tool identity、Node、input/output SHA-256、format、point/LOD count、bounds、SH/model、size、duration、peak memory、algorithm、warnings。 |
| T-12 | voxel成功后运行schema检查，并用current Viewer loader fixture验证；LOD errors数组长度与lodLevels一致、有限、非负、单调。 |
| T-13 | 压缩输出按统计/结构容差比较，不要求逐字节相同；deterministic transform/filter/decimation fixture仍必须固定hash。 |
| T-14 | wrapper不得改Editor package、Viewer源码、Version History、Ledger、部署或references。 |

### 10.3 非目标

- 不提供在线公开上传API、队列、租户鉴权、对象存储或生产SLA；
- 不把CLI打进浏览器bundle；
- 不为Editor自动升级到transform3；
- 不把普通mesh conversion加入未授权范围；
- 不隐藏上游exit code、stderr或render golden差异。

## 11. 后续唯一实现 Plan

1. **重新查询stable**：从实施时最新`origin/main`新建`codex/splat-transform-offline-v3.3`；若stable高于3.3.0，先更新本报告候选与breaking mapping。
2. **固定toolchain manifest**：记录Node22.20、npm lock、tag/commit/tree与安装目录；安装到`.codex-work/cache/`，运行reference validator确保snapshot未写入。
3. **建立job schema**：定义operation、format、typed inputs、transform/filter、明确decimation algorithm、GPU、limits、overwrite和output；拒绝unknown/raw fields。
4. **实现安全argv映射**：逐项实现第3节v2→v3语义映射，只发long flags；对危险短flag做负面测试。
5. **实现执行/状态层**：no-tty、stdout/stderr分离、timeout/cancel、exit propagation、scratch、空间检查、manifest与精确清理。
6. **格式fixture**：Gaussian PLY、现有SOG、two-level LOD、Xun/Dayun voxel metadata；覆盖所有白名单输出、roundtrip和mesh拒绝。
7. **算法fixture**：uniform/adaptive各自固定hash、统计和质量字段；禁止测试只写“decimate passed”。
8. **GPU/CPU/remote负面测试**：无GPU voxel、CPU SOG、missing input、overwrite、disk full模拟、range缺失、timeout、redirect/host拒绝。
9. **Viewer兼容检查**：current Viewer loader加载candidate voxel/LOD；HTML/WebP保留browser screenshot、console、network。
10. **本地checkpoint**：只提交wrapper/docs/schema/tests，不改产品版本或依赖。无远端授权时停止，不push、不建PR、不部署。
11. **Agent上传研究另开记录**：只有用户另行授权后才研究sandbox、quota、SSRF、job queue、storage与恶意输入；不得因本Adopt自动进入生产。

### 11.1 验证Gate

| Gate | 最低条件 |
|---|---|
| Identity | exact tag/commit/tree/lock/Node验证通过；reference摘要不变 |
| Parser | schema正反测试；所有旧危险短flag被拒绝 |
| Agent contract | stdout单JSON、stderr日志、exit code、quiet/no-tty、overwrite/cancel/retry均可判定 |
| Formats | 白名单每种至少一个结构检查；SOG/LOD/voxel使用现有资产fixture |
| Quality | point/bounds/SH/model/LOD/errors/voxel schema/size/time/memory完整记录；uniform与adaptive分开 |
| Viewer | voxel/LOD/HTML实际可由current Viewer或browser消费；失败可回退且不污染产品 |
| Safety | 输出/scratch精确路径、space/timeout/URL策略；不保存credential或任意`.env` |

本轮Adopt只完成离线工具的选择和decision-complete规划；当前仓库仍没有Transform产品或wrapper实现。
