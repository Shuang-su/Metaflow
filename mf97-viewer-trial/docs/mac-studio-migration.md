# MF-97 Mac Studio 轻量续作

代码用 Git；已有高斯/碰撞保持原位；派生缓存按清单迁移。无需展开 `data` 或复制 `node_modules`。本阶段不发布，不部署；大运楼层和真实上下连接尚未完成。

用户确认使用 Codex 已连接的 Mac Studio，SSH 不是前提。初始化命令须由绑定该设备的任务执行；本机任务的命令不会因侧边栏显示远端项目而自动改在远端运行。已核验的远端项目 `splat-transform` 位于 `/Users/szmg/Documents/splat-transform`，仅用作设备入口；先检查独立 Metaflow 目录，不修改 splat-transform 或 Livecho。设备连接可用、仓库安装成功、资源匹配和实景通过分别记录。

## 取得必要代码与 Node

在 Mac Studio 选择一个不存在的新目录，保留现有 Livecho。需要 Git、Git LFS、curl 与 macOS arm64。现有目录不要覆盖，先检查分支、upstream 和未提交状态。

从本分支下载并检查 `scripts/mf97/bootstrap.sh`，执行：

```sh
sh /path/to/mf97-bootstrap.sh /Users/szmg/Documents/Metaflow
```

脚本使用 `--filter=blob:none --no-checkout --single-branch --no-tags`，仓库本地 LFS skip-smudge，稀疏展开 `metaflow-viewer mf79-viewer-trial mf97-viewer-trial supersplat-v2.32.5 docs metadata scripts analytics`。`analytics`仅包含Viewer编译所需的tracking-plan.json，来自全新构建的实际依赖检查。不浅克隆、不全量 LFS 拉取；保持历史可用。可设置 `MF97_EXPECT_COMMIT` 核对交付 SHA。默认保留20GiB空闲及2GiB依赖估算；只在本机验证时使用 `MF97_BOOTSTRAP_PROFILE=local`。

Node22.23.3 官方 arm64 tar.gz SHA-256 固定为 `23b25245dcfb9af7262f8ff142e9e2e0af025368117329e7a7458a51e5922f53`，同时比对官方 SHASUMS256。Node、下载和 npm 缓存均在新项目 `.codex-work`。四目录正常执行 `npm ci`，不禁用安装脚本；两试用目录已补 lockfile、固定直接依赖及 TypeScript/Node 类型依赖。

MF97通过明确的MF79 `recast-runtime`入口复用同一WASM实例。不能在MF97目录另行初始化第二份Recast后交给MF79构建器；四目录仍需全部安装，各自不使用外部node_modules链接。生成脚本指纹变化时，旧瓦片任务应保留并使用新任务ID重建，不改旧manifest来绕过resume校验。

```sh
cd /Users/szmg/Documents/Metaflow
export PATH="$PWD/.codex-work/tools/mf97/node-v22.23.3-darwin-arm64/bin:$PATH"
node --version
git status --short --branch
git rev-parse HEAD
git config --get remote.origin.promisor
git sparse-checkout list
git ls-files --deleted
```

应是Node22.23.3、目标SHA一致、promisor=true、data未展开且没有data删除。部分克隆限制历史内容传输，sparse限制工作目录，LFS配置限制自动下载；三者各自生效。[Git clone](https://git-scm.com/docs/git-clone)、[sparse checkout](https://git-scm.com/docs/git-sparse-checkout)、[LFS配置](https://github.com/git-lfs/git-lfs/blob/main/docs/man/git-lfs-config.adoc)。

## 指向机器已有资源

默认配置为 `.codex-work/config/assets.local.json`，用仓库本地 exclude 忽略。`MF_ASSET_CONFIG` 可以指向另一份忽略配置。不要把 `.env`、令牌或私钥写入该配置或迁移包。

以下路径是占位参数，应替换为 Mac Studio 实际已有目录，不是已经核验的远端路径：

```sh
node scripts/mf97/configure-assets.mjs \
  --apms /existing/apms-derived \
  --sdi /existing/sdi-derived \
  --dayun /existing/dayun
```

两展参数指向同时包含 `streamed/lod-meta.json` 与 `voxel/walk.voxel.json/.bin` 的派生根；大运参数指向含 `tiled-voxel/voxel-tiles.json` 和流式场景的原场景根。每个 URL 前缀可挂不同目录，所以不要求新机器复刻旧磁盘名、用户名或资料层级。不把场景链接进 Git 的 `data`，也不改浏览器资源 URL。只有原高斯或不同转换版本时，先生成独立版本；doctor 会将旧缓存标为不匹配，不能套用原成绩。

## 按需迁移派生缓存

在原电脑项目根目录执行；输出使用独立缓存目录且不能与源缓存/模型重叠：

```sh
node mf97-viewer-trial/node_modules/tsx/dist/cli.mjs mf97-viewer-trial/scripts/cache-transfer.ts \
  inventory --output /external/cache/mf97-transfer.json
node mf97-viewer-trial/node_modules/tsx/dist/cli.mjs mf97-viewer-trial/scripts/cache-transfer.ts \
  export --manifest /external/cache/mf97-transfer.json --output /external/cache/mf97-pack
```

可用 `--groups navigation,maps,mapJobs,groundReports,continuation` 只选需要的分组。清单是逐文件哈希与大小，不含模型/依赖/截图；pack按内容哈希去重。源改变、symlink、损坏或资源不足明确停止，已完成对象可续写。`continuation`只收接受副本、同源导航、试用包、地面报告、JSON证明与大运续作数据，工具环境不复制。

只把pack目录送到Mac Studio，不必搬整个项目。Codex 远端任务不能直接读取原机的 `/Volumes/Prism` 文件；远端代码初始化可先进行，缓存须通过另行可用的文件传输或外置盘送达并核验。没有传输清单和 receipt 时，不能声称缓存已迁移。接收后：

```sh
node mf97-viewer-trial/node_modules/tsx/dist/cli.mjs mf97-viewer-trial/scripts/cache-transfer.ts \
  import --pack /received/mf97-pack --output "$PWD/.codex-work/cache/mf97-import"
export MF_ASSET_CONFIG="$PWD/.codex-work/cache/mf97-import/assets.imported.local.json"
```

先核验全部唯一对象再写目的地；每次写入再次核对哈希。已有相同字节可重试，不替换不同文件。导出的配置保留目标机器场景挂载/Python，仅把派生缓存定位到新根，不覆盖原配置。receipt明示 `runtimeRevalidation: pending`。

旧包不改写；`trial-relocation.json`记录旧包哈希、原ID与新文件定位。`recordedRoots`仅用于I/O查找，原证明中的路径和身份保持原样。移机后重新验证原生/GPU/回放并使用prepare-trial-bundle生成新ID；服务器拒绝直接用旧绝对导航路径加载搬迁包。

旧地面报告保留。此次I/O适配改变了分析脚本指纹，审查前需在匹配的源上重新重筛，输出新目录：

```sh
node mf97-viewer-trial/node_modules/tsx/dist/cli.mjs mf97-viewer-trial/scripts/ground-migrate-reviews.ts \
  --output ground-portable-v1
export MF97_GROUND_ROOT=/configured/continuation/ground-portable-v1
```

`/configured/continuation`取导入配置的`roots.continuation`。不覆盖旧`ground-v2`，不增加旧报告外的修改。旧接受决定与试用证明不自动升为新版本接受记录。

## 独立 Python、预算与 transform

准备已有原生arm64 Python3.11–3.12（建议3.12），再执行：

```sh
sh scripts/mf97/setup-python.sh /absolute/python3.12
```

在项目tools中建立全新venv并按requirements安装Open3D0.19.0；不复制旧机环境或修改旧链接。脚本登记新Python到忽略配置；如果已导入配置，保持同一个`MF_ASSET_CONFIG`。恢复后的旧工具只用于本机对照，不能当作远端安装已完成。

Open3D0.19提供Python3.12的macOS universal2 wheel，当前固定scikit-learn1.9.1要求Python≥3.11，故整套环境不使用3.10或3.13。[Open3D发行文件](https://pypi.org/project/open3d/0.19.0/)、[scikit-learn元数据](https://pypi.org/project/scikit-learn/1.9.1/)。

离线重任务使用：

```sh
node scripts/mf97/run-job.mjs mf97-viewer-trial/node_modules/tsx/dist/cli.mjs \
  mf97-viewer-trial/scripts/dayun-generate.ts --job /reviewed/dayun-job.json
```

Mac Studio profile以实际RAM限制预算：单任务、heap≤32GiB、整个子进程树RSS≤64GiB且不超过一半内存；每秒监测并保留结束/中断记录。原子瓦片和resume身份核验保留。新产物额度初始8GiB，每个输出根记账；批次合计仍须核对，不能通过新建多个根放大授权额度。远端卷至少预留20GiB，本机local为5GiB/1.5GiB。full Dayun先估算产物，不因512GB内存省略几何核验。

大运第一批可复用已经审查的40.96m分析窗口，创建新任务，不覆盖旧任务。配置大运并通过源检查、导入缓存后，在项目根目录执行：

```sh
node --input-type=module <<'JS'
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {loadAssetConfig} from './scripts/mf97/asset-config.mjs';
const root = loadAssetConfig().roots.continuation;
const job = JSON.parse(readFileSync(resolve(root, 'dayun/jobs/x16-z8-overlap-recast-v1.json'), 'utf8'));
job.id = 'mac-studio-pilot-v1';
job.collisionSourceFile = resolve(root, 'dayun/collision-source.json');
const file = resolve(root, 'dayun/jobs/mac-studio-pilot-v1.json');
writeFileSync(file, JSON.stringify(job, null, 2) + '\n', {flag: 'wx'});
console.log(file);
JS
```

把输出路径作为launcher的`--job`参数；再次执行同一job即验证四块hash后续跑。任务仅用于离线分析，原同XZ上下两端仍为partial，不是已完成跨层路线。全场扩大另行估算并确认覆盖。

transform继续使用具体作业已固定的工具版本、输入和参数；不要通过全局npm升级改变已有转换链。该launcher可启动已安装的transform Node入口，版本/输入/参数随作业保存。worker和viewer使用同样配置。页面/服务器默认仅`127.0.0.1:5185`，该地址属于 Mac Studio 本机；由远端任务核验服务，在 Mac Studio 浏览器验收。原机访问需实际可用的端口转发能力，不能仅因 Codex 设备在线就将原机 localhost 指向远端，也不为预览默认开放公网监听。

## 检查、构建与续作

```sh
npm --prefix mf97-viewer-trial run doctor
npm --prefix mf97-viewer-trial test
npm --prefix mf79-viewer-trial test
node metaflow-viewer/node_modules/typescript/bin/tsc --noEmit -p metaflow-viewer/tsconfig.json
node metaflow-viewer/node_modules/typescript/bin/tsc --noEmit -p mf97-viewer-trial/tsconfig.json
node metaflow-viewer/node_modules/typescript/bin/tsc --noEmit -p mf97-viewer-trial/tsconfig.tools.json
node --test supersplat-v2.32.5/tests/studio-contract.test.mjs
```

doctor只读、不下载、不修改原件；全检查校验两展碰撞/流式清单全部引用、导航BIN、82张地图、地面算法、大运293块元数据与BIN。`--quick`仅为定位检查，不能当哈希匹配。缺失、版本不同和需重验证会非零退出。

Studio构建：

```sh
studio_output=$(node --input-type=module -e 'import {loadAssetConfig} from "./scripts/mf97/asset-config.mjs"; console.log(loadAssetConfig().roots.studioBuild)')
(cd supersplat-v2.32.5 && STUDIO_BUILD=1 STUDIO_OUTPUT_DIR="$studio_output" npm run build:studio)
npm --prefix mf97-viewer-trial run dev
```

浏览器为`http://127.0.0.1:5185/?scene=apms-2026`，SDI及大运原资料查看继续可选，Studio为`/studio/`。导航和修正版缺少验证时不得宣布就绪。回归输出新目录，不覆盖旧证据：

```sh
MF97_REGRESSION_OUTPUT=validation/mac-studio-original-v1 \
  node mf97-viewer-trial/node_modules/tsx/dist/cli.mjs mf97-viewer-trial/scripts/regression.ts
```

断开旧电脑后再检查加载、查询、原生行走、切换/取消和修正版成套切回；完整67点/固定20/旧7及实际大运瓦片、detector都需重跑。代码一致、数据一致、生成可恢复、行为通过分别记录。迁移成功之后才继续确认真实楼层、双向上下通道和分层地图，不能把机器配置完成等同多层导航完成。
