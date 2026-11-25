# 视频工坊 · video.msqt.fun

纯前端 ffmpeg.wasm 视频处理 WTOP 节点站：探测 / 剪辑 / 转码 / 压缩 / 抽帧 / GIF / 提取音频 / 变速（8 个 headless 方法）。

- 首次运行从 CDN 下载 ~31MB ffmpeg 引擎（浏览器缓存）；视频不出浏览器。
- 独立访问：选视频 → 方法 tab → 执行（进度条 + ffmpeg 日志）→ 预览 / 下载 / 取消。
- WTOP 接入：在 [可回收编排站](https://recycle.msqt.fun) 注册本站即可编排调用；**注册须勾选 allow-same-origin**（ffmpeg Worker 需真实 origin；官方预置已默认勾选）。

开发：`pnpm install && pnpm dev`（端口 5183）。设计文档见 kit.msqt.fun `wtop-media-data-sites-design.md`。
