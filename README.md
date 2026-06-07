# 51cg Video

本地视频抓取与下载工具。给定一个或多个页面 URL，系统会打开受控浏览器会话，识别页面中的视频资源，并把可下载的视频保存到本地目录。

## 当前能力

- 批量创建页面抓取任务
- 受控 Chrome 会话与同站点登录态复用
- 网络请求与 DOM 双通道视频识别
- `mp4` / `webm` 直链下载
- `m3u8` 走 `yt-dlp`
- SQLite 持久化任务、资源、日志与设置
- React + Tailwind CSS 本地控制台
- REST API + SSE 状态推送

## 运行前提

- Node.js 22
- Google Chrome
- `pnpm`
- `yt-dlp`
- `ffmpeg` 可选

说明：
- 当前实现默认使用本机 Chrome 路径 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
- 若 Chrome 路径不同，可在启动后端前设置 `CHROME_EXECUTABLE_PATH`

## 快速开始

安装依赖：

```bash
pnpm install
```

构建前后端：

```bash
pnpm build
```

启动后端开发服务：

```bash
pnpm --filter @video/server dev
```

启动后端后，访问：

```text
http://localhost:4318
```

后端会在构建产物存在时直接托管 `apps/web/dist`，因此本地使用可以只开一个端口。

如果你要分开跑前后端：

```bash
pnpm --filter @video/server dev
pnpm --filter @video/web dev
```

- 前端：`http://localhost:4173`
- 后端：`http://localhost:4318`

## 常用命令

```bash
pnpm build
pnpm typecheck
pnpm --filter @video/server dev
pnpm --filter @video/web dev
pnpm test
```

## 目录结构

```text
apps/server   后端 API、队列、持久化、浏览器控制、下载
apps/web      React + Tailwind 控制台
packages/shared  前后端共享类型与接口契约
packages/ui      预留的可复用 UI 包
docs/            PRD、设计文档、任务跟踪与运行说明
data/            SQLite、下载目录、日志目录、浏览器 profile
```

## 已知限制

- 仅支持非 DRM 内容
- 某些强反自动化站点不保证成功率
- 当前项目在部分受限运行环境里，`rollup/rolldown` 的原生绑定可能导致 `vite` / `vitest` 启动失败
- 浏览器与 HTTP 集成验证在受限沙箱中可能需要提权运行

更多运行方式、排障建议和验收步骤见：

- [docs/run-local.md](/Users/licaixin/Desktop/demo/51cg-video/docs/run-local.md)
- [docs/acceptance-checklist.md](/Users/licaixin/Desktop/demo/51cg-video/docs/acceptance-checklist.md)
