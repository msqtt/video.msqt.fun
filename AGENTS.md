# AGENTS.md

## 项目约定

- 纯前端站，无后端、无框架（原生 TS + Vite），UI 为 neobrutalism 风格（粗黑边框 + 硬阴影 + 高饱和色块）。
- 视频处理逻辑放 `src/ops.ts`（8 方法）+ `src/ffmpeg.ts`（引擎：互斥队列/懒加载/心跳进度/terminate 取消）；UI 与 WTOP provider 方法共用同一实现。心跳须覆盖 load 下载+编译静默期与队列排队期（5s），否则 HOST 30s watchdog 判 TOOL_CRASHED。
- ffmpeg.wasm：必须 ESM core（unpkg @ffmpeg/core@0.12.9/dist/esm，jsdelivr 备选）；classWorkerURL 用 `@ffmpeg/ffmpeg/worker?worker&url`（**不可 ?url**：原样拷贝源码致生产相对依赖 404、load 永久挂起）；`optimizeDeps.exclude` 两包；CSP 需 script-src blob: + worker-src blob: + connect-src https: + media-src blob: data:（netlify.toml 与 vite.config.ts 两处同步）。
- 注册到 HOST 须 allow-same-origin（opaque origin 下 new Worker 被拒）；官方预置已默认勾选。
- 取消 = terminate() + 懒重载；exec 的 abort 只 reject 不停 wasm。输出必须 new Blob([Uint8Array])，FS 临时文件 finally 必删。
- 新增/修改 WTOP 方法时，`public/.well-known/wtop-manifest.json` 的 input/output JSON Schema 必须与 `ops.ts` 参数同步。
- 文件字段 schema `{"type":"string","format":"wtop-file"}`；输出返回真实 Blob，不返回裸 ArrayBuffer / FileRef。
- SDK 依赖走 `vendor/wtop`（`pnpm sync-sdk` 从 `../wtop-sdk` 同步），vendor 的 dist 必须提交（Netlify 全新克隆构建）。`.gitignore` 用 `/dist/` 而非 `dist/`。
- `pnpm-workspace.yaml` 同时保留 `allowBuilds`（pnpm 12 本地）与 `onlyBuiltDependencies`（pnpm 10 Netlify）两种 esbuild 构建许可写法。
- 开发端口 5183（strictPort）；host 编排站本地端口 5173。
- 提交信息用中文；推送 `git -c credential.helper='!gh auth git-credential' push origin main`。
- 验证方式：Chrome（playwright 驱动，`/home/bob/Projects/duckdaw-e2e/node_modules/playwright`）实测 UI 与 host 集成，通过后才推送。

## 部署链路

GitHub public 仓库 → GitHub Actions（push main：pnpm 10 / node 22 构建）→ `scripts/netlify-deploy.mjs` Netlify API 直传发布 → Cloudflare CNAME `video` → `video-msqt-fun.netlify.app`（proxied=false，TLS 由 Netlify 签发）。netlify.toml 随部署上传，redirects/headers 生效。