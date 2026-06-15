# 本地运行说明

## 1. 目标

这份文档说明如何在本机启动 Easy Video Download，并验证最小工作流是否可用。

## 2. 依赖

- Node.js 22
- Google Chrome
- `pnpm`
- `yt-dlp`

可选：

- `ffmpeg`

## 3. 安装与构建

安装依赖：

```bash
pnpm install
```

构建：

```bash
pnpm build
```

## 4. 启动方式

### 方式 A：单端口运行

先构建，再只启动后端：

```bash
pnpm --filter @video/server dev
```

访问：

```text
http://localhost:4318
```

说明：
- 后端会优先提供 API
- 当 `apps/web/dist` 存在时，后端也会托管前端静态资源

### 方式 B：前后端分开运行

后端：

```bash
pnpm --filter @video/server dev
```

前端：

```bash
pnpm --filter @video/web dev
```

访问：

```text
http://localhost:4173
```

## 5. 首次验证

1. 打开控制台页面
2. 检查是否能看到：
   - “本地视频抓取控制台”
   - “任务输入”
   - “任务队列”
3. 输入一个公开视频页面 URL
4. 创建任务
5. 查看是否生成候选资源
6. 选择资源并触发下载

## 6. 环境变量

若 Chrome 不在默认路径，可设置：

```bash
export CHROME_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

若想临时强制无头运行，可设置：

```bash
export CHROME_HEADLESS=true
```

## 7. 故障排查

### `yt-dlp` 不存在

现象：
- `m3u8` 下载失败

处理：
- 安装 `yt-dlp`
- 确认命令行里可直接执行 `yt-dlp --version`

### Chrome 路径不正确

现象：
- 打开浏览器失败

处理：
- 检查本机 Chrome 路径
- 设置 `CHROME_EXECUTABLE_PATH`

### Chrome 进程异常退出

现象：
- 开发时频繁弹出 Chrome “异常退出”
- 后端重启后，站点 profile 再打开会提示恢复页面

处理建议：
- 优先开启设置里的“无头模式运行浏览器”
- 或在启动前设置 `CHROME_HEADLESS=true`
- 尽量用 `Ctrl+C` 正常停止服务，避免直接杀掉 `node` 进程
- 如果某个站点一直复现，清理项目内对应的 `data/profiles/<siteHost>` 后再试

说明：
- 当前项目会为每个站点维护独立 Chrome profile
- 异常提示更常见于浏览器上下文未被优雅关闭，不一定是本机进程数量太多

### `vite` / `vitest` 启动时出现 `rollup` / `rolldown` native binding 错误

现象：
- `vite`
- `vitest`
- `pnpm test`
- `pnpm --filter @video/web build`
  在某些环境中直接失败

处理建议：
- 优先在用户自己的系统终端中执行，而不是受限宿主进程
- 重新执行 `pnpm install`
- 若仍失败，清理 `node_modules` 后重装

说明：
- 这是当前环境相关问题，不一定代表业务代码本身有误

### 浏览器烟测里出现 `ERR_INSUFFICIENT_RESOURCES` / `Failed to fetch`

现象：
- Headless 浏览器验证时大量报错

处理建议：
- 优先以真实桌面浏览器手工验证页面
- 把浏览器验收与单元测试分开看待
- 先确认 API 本身能用，再判断是否属于浏览器运行时限制
