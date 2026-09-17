# MF-75 实施与验证

2026-09-17，实验状态。基于 b87fe91d / PR #74，分支 `codex/xr-hands-dwell`；联合 MF-76 验收。唯一 Plan 见同目录 Spec，不复制用户全文。

## 已实现与本地验证

- 真实 local-floor 高度为默认；旧 posture 保留但不再隐式增高。显式增高、校准、回起点和退出需独立确认。参考空间 reset 取消输入并暂停地面移动。
- 三页面板、主手切换、掌心入口、单手保底、自动输入接管、浏览器捏合优先与瞬态输入正常结束。
- 悬停 200ms 稳定等待、0.8/1/1.5s 总时长、100ms 边缘暂停、200ms 移开重新启用；独立确认区域、距离角尺寸检查、直接确认抢占和跨页失效。进度线复用缓冲，不上传整张纹理。
- 追踪丢失回归发现能力记录被删除会阻止掌心恢复；现保留源能力记录、有效位姿恢复后重新核验，并只在丢失的状态转换计数。
- `node --test tests/xr-behavior.test.mjs`：60/60，通过真实高度、输入所有权、悬停、掌心迟滞、异步选点及原有轮盘/弧线/碰撞回归。
- `npm run type:check`、`npm run lint`、`npm run build`：通过。Node v22.22.1；未更改主机默认环境。npm 原缓存 EACCES 后使用 `/tmp/mf75-npm-cache` 安装成功，锁文件不变。
- `npm run e2e:build`：20/20。Chromium WebGL 1440×900、390×844；实际辅助面板悬停只提交一次，等待期间文字纹理未重传；独立世界射线实际命中 fixture 高斯，不改变头部相机。窗口回归通过，不等同 XR 硬件验证。
- Playwright 中文 1280×960 截图人工检查：辅助页、独立确认页，无文字裁切、白屏或错误覆盖；pageerror 为零。交互为输入与辅助→悬停时长确认→1s 变为1.5s，持续指向不重复；增高进入确认页。
- Browser plugin not available，使用项目 Playwright。截图保留在工作机 `/tmp/metaflow-mf75-artifacts/{auxiliary,menu-text,confirmation}.png`，不提交生成工件。

## 未通过与未完成

- 全量 `MCL_SMALL_FIXTURES=1 npm test`：运行时 144项，124通过/20失败（最后补充的追踪恢复测试另行通过，定向总数60）。18项因稀疏检出未包含 data/supabase/editor/reference 文件；2项为基线测试与已发布 README、历史55ced0a提交记录规则不一致。这些相关测试及历史文件与 b87fe91d 无差异；没有把全量测试报告为通过，也没有为实验改动提升版本。命令原日志 `/tmp/mf75-all.log`。
- Vision Pro 模拟器：Apple Vision Pro / visionOS26.2 / BD8078F8-A862-4E79-A7EF-4378F4798D7A，尝试 Safari 打开本地4174 fixture后窗口白屏；未完成实际选择、退出/重入验收。自动化瞬态选择源正常移除测试不能替代模拟器与真机。
- PICO adb 可连接但 `mWakefulness=Asleep`，已请求用户佩戴，尚无本轮结果。掌心法线/捏合事件、接管、真实坐下/起身/下蹲/重定中心、双眼标记、三场景各10分钟录屏和帧时间均待验；直接/悬停各30次、95%成功率和零意外位移未宣称达标。
- WebGPU XR 与 GPU 查询在真实 XR 中的恢复和耗时未验；本轮不变更渲染后端或自动画质。

## 边界、审查与回退

自主 Spec 对照和代码质量检查，非 independent review。远端 main 仍为 a871786；用户指定基线为其上的 MF-70/MF-73 改动，PR应堆叠在 codex/xr-wheel-arc，不覆盖发布线。无资源格式、引擎版本、碰撞生成、普通Viewer飞行改动，无合并/升版/生产部署。撤销本轮依赖提交即可回到 b87fe91d；本机旧偏好忽略新增字段。
