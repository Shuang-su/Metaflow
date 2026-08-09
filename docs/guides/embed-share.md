# 嵌入与分享

稳定分享优先使用资源 route；只有临时验证或尚未进入 index 的资源才使用 `content` / `settings` 查询参数。

## 稳定链接

```text
https://metaflow.shuang-su.com/acg/yzx/yzx
```

route 来自 `data/index.json`，可以额外声明 `aliases` 兼容短链或旧链接。不要把服务器上的真实文件夹名当成公开 URL 契约。

## 临时直链

```text
https://metaflow.shuang-su.com/?content=%2Fdata%2Fpath%2Fmodel.sog&settings=%2Fdata%2Fpath%2Fsettings.json
```

参数值应使用 URL 编码。需要环境或封面时追加 `environment`、`poster`；完整列表见 [Viewer URL 与 settings](../reference/viewer-url-settings.md)。

## iframe 嵌入

```html
<iframe
  src="https://metaflow.shuang-su.com/acg/yzx/yzx?noui&noanim"
  title="3D 场景"
  loading="lazy"
  allow="fullscreen; xr-spatial-tracking"
  allowfullscreen>
</iframe>
```

- `noui` 适合外部页面自行提供控件；
- `noanim` 只禁止默认动画自动播放；
- WebXR 需要浏览器、设备、HTTPS 与权限策略同时满足；
- 嵌入页面仍需为键盘和触控用户提供明确标题与退出方式。

## 分享前检查

1. 使用无痕窗口打开，避免本机 cache 掩盖缺失文件。
2. 在桌面与移动端验证首屏和交互。
3. 检查 route，而不是只检查带 cache-busting 参数的 URL。
4. 确认公开链接没有 token、内部 endpoint 或本机文件路径。
5. `noui` 嵌入仍要有加载失败的外层提示或替代链接。

## Cache 与更新

`/data/index.json` 使用重新验证策略，资源文件通常使用长期 immutable cache。替换同路径内容时容易让旧客户端继续看到缓存；优先使用不可变资源名或按发布规则调整路径，并保留稳定 route 指向新文件。
