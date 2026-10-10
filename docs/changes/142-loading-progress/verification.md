# MF-142 初始 LOD 读取进度与缇宝加载图

唯一轻量计划：[Issue #142](https://github.com/Shuang-su/Metaflow/issues/142)。目标 Viewer 5.21.11，基线 5.21.10、100 项资源、schema 1.2。

## 实际行为

按本实例 octree 文件列表订阅引擎 progress/load，初始每分块一单位，读取量/总量转换成单位内比例；总量不可用不伪造比例。重试重置该分块、不重复完成，取消不当成完成；百分比单调、上限 99，场景就绪才 100。就绪/销毁移除全部监听，不产生新请求或缓存场景内容。保留百分比上方、LOD 分阶段下方、透明无边框及九语言。

缇宝原 4096² 无损封面 11,514,166 字节，已生成且线上可访问。用户纠正后撤回 1024 方案，以 cwebp -q 82 -m 6 生成保持 4096² 的压缩编码静态 WebP，既有 thumbnail 字段改指 cover-4096-q82.webp；按用户要求本次正式包移除旧无损 cover-4096.webp，历史 tag 与源素材不改。新文件名避免旧 immutable 缓存。同镜头素材，模型/settings/环境/体素/路线不变，其他 99 项资源对象不改。

## 验证与限制

4 项定向行为单测通过：分块未完成读取推进、未知总量、重试/调度/取消、实例范围与无 UI 清理。受控慢速 Chromium 大运在未完成分块期间推进 1–46% 的多个整数值。类型、lint 和构建通过；完整版本检查、资产、其他浏览器及发布回读随后追加。

引擎 loose SOG 的 progress 合并纹理进度；待全部纹理长度可用前总量会变化，因此整体是初始分块工作进度，不宣称精确全场景总字节下载百分比。无 iOS/iPadOS 真机或用户真实弱网验收。回退采用已核验 5.21.10 生产部署 6ac9f5892bf0719ac8c32a8b。

新 4K 文件 361,112 字节，SHA256 c5d55c4c1626b9636b0ab4b4b335733b2e3b774362e802b55adf7ad2f46d1376；编码有损 q82，尺寸保持 4096×4096，同初始镜头。

## 图片与 UI 顺序

恢复既有设计：pending 时隐藏其他 UI，图片可显示并经过帧回调后显示；cached/错误/10秒超时/提前场景首帧/销毁/初始化失败有定向断言。图片失败/未就绪时透明提示继续加载场景，不修改首帧等待逻辑；九语言、无额外背景边框。4 项 poster 行为测试通过。原生Safari的 W3C click 未投递已在 MF-139 单列，实际场景加载与DOM按钮状态分开，不假定是产品问题。

并入 MF-139 发布记录时 Ledger 出现单文件追加冲突，早期提交保留了冲突标记；通过后续前向修复保留两批完整记录，重新检查 diff/Markdown 与版本，不改写已推送历史。

## 最终本地验收

- 168 单测通过；8 项新增行为覆盖分块读取与 poster 顺序/失败/超时/提前首帧/清理。类型、lint、格式、生产构建与 npm tarball 的 publint 通过。最初 publint 在系统临时目录 ENOSPC，使用项目目录 npm pack --pack-destination 与同一 tarball 验证后通过；未清理用户系统数据。LFS pointer 的 sparse 单测模式与实体完整性分开。
- Chromium/WebKit 大运受控慢纹理读取连续推进；原生 Safari 18.5 在仍剩14分块时出现0–10%多个值，之后继续至46%、场景就绪100%，首帧加载与飞行按钮通过。原生 Safari 三场景加载、4K新图请求和显示通过；Chromium/WebKit延迟图片时 chrome 隐藏、图片就绪显示，404继续场景加载通过。
- 新封面实际4096×4096，静态WebP q82，361,112字节，可解码且视觉保留原构图。只改变缇宝thumbnail/大小/updatedIn；其他99项对象完全一致。完整staging validate_data.py --check-files通过，10GB级文件使用已验证硬链接，避免复制。
- 受控本地网络不代表用户真实弱网；无iOS/iPadOS实体设备。未新增全链路请求重试。原生W3C输入限制见MF-139，未改既有相机行为。公开资源仍100项/schema1.2，Editor/Director未改。

证据：项目.codex-work/online-diagnostic-20261010/ 下 fine-browser.json、fine-native-samples-safari.json、fine-native-safari.json、poster-browser.json、最终168单测/类型/lint/格式/构建/包日志和截图。候选及生产发布后追加实际SHA/部署/线上回读/观察。


官方品牌调整：ui.html 展开内容复用原 metaflow_word.svg 路径并内联到所有 Viewer 构建入口，无额外资产请求，无新背景或边框。桌面／触屏／键盘交互和正式部署复查后追加结果。CI38040250845 缺少 trace.pullRequest，已补齐 PR144 并重跑；Viewer 本体验收通过不代替完整 CI。
