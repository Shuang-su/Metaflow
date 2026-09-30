# MF-97 Plan — 已批准实施计划

唯一 Spec：[spec.md](./spec.md)。来源为本次 Codex 会话中的用户批准计划及后续“大运/华发、本地未上线”修正。当前分支 codex/mf97-navigation，隔离工作树 /Users/shuangsu/.codex/worktrees/mf97-navigation/Metaflow。以实际验证更新报告，不套用旧审计模板。

1. **@Nav 与 UI**：迁入 MF-79，冻结原始输入；实现共享资格 helper、Studio toggle 和不可变 extras 合并；明确 67 点 trial 副本。顶部原生样式列表、独立开关、固定2m、附近3个、键盘/触控/普通内容不移动相机。配置纯测试、Studio roundtrip/undo、真实桌面窄屏交互。
2. **层身份与高斯底图**：核验大运真实 LFS 数据、体素坐标转换；华发仅本地格式/多层审查。独立 app 分层 worldY shader过滤、稳定流式捕获与WebP分块；manifest源/层/变换/覆盖哈希，Viewer loader 生命周期/失配/缺块诊断。先完成两展览图，再验证多层样本，完整覆盖不能以样本代替。
3. **地面候选与审查**：Open3D0.19最小本地环境预算审查；8m+1.04mhalo多span分析，保护结构、残差≤8cm、unknown完整列出。生成稀疏候选和accept/reject/revert，不自动应用未经核验patch；真实全场和合成保护夹具分别统计。
4. **同源重建与跨层**：原生回放检验批准的patch，再生成trial collider和同源Recast；层/表面/连接稳定ID。大运楼梯双向/坡道/断点区分，媒体峰会缺采上层排除跨层声称，华发无现成walkable资料不能宣称导航通过。
5. **统一回归与交付**：固定20/旧7/67点、重点21/27/4/13/31/38/41/35/42、原版运动开关一致性、30/60/120Hz/jitter、一次到达、无超时/重试上限、连续游览资源。浏览器完整试走与自动跟随结果分列；UI可用不能替代多层/地面通过。独立审查Spec符合性和代码质量，原子本地checkpoint、Issue回填并readback，不push/发布/部署。

资源：重资产写 /Volumes/Prism/Metaflow/.codex-work/cache/mf97-navigation；复用只读原模型与依赖，不装LCC SDK；生成串行。开始时Prism约12GiB、内部盘5.4GiB、源盘8.9GiB，Prism10GiB reserve后实际新预算约1.7GiB。每个生成任务预算检查，保存恢复信息，不删目标/静默缩场景。

当前证据：已迁入4个MF79提交，Viewer保留5.20.1；原始数据未修改。大运293 tiles均可读、有多高度净空表面但未证明楼梯连通；华发PLY有多个高度带，Z-up仅为几何推断，尚未确认配准，未提供现成体素/navigation。阶段测试与未运行项见报告。
