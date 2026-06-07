# 视频抓取与本地下载工具 V1 Design

## 1. 文档目标
本文档用于沉淀 V1 的技术架构实现方案，作为后续开发、联调和维护的基线设计。文档与 [PRD](/Users/licaixin/Desktop/demo/51cg-video/docs/prd.md) 配套使用，重点回答“如何实现”。

## 2. 设计原则
- 稳定优先：先保证常见页面可用，再逐步扩展复杂站点兼容性。
- 本地优先：所有抓取、登录态、下载和历史记录默认保存在本机。
- 可观察：任务状态、失败原因、下载进度必须可见。
- 易维护：前后端分层清晰，UI 使用 `Tailwind CSS` 统一样式约束，便于后续迭代。
- 可降级：直链下载优先，复杂流媒体由专门下载器兜底。

## 3. 技术选型

### 3.1 前端
- 框架：`React`
- 构建工具：`Vite`
- 语言：`TypeScript`
- 样式方案：`Tailwind CSS`
- 数据通信：`REST API + Server-Sent Events (SSE)`

选择理由：
- React 适合管理任务队列、资源列表、日志面板和状态更新。
- Vite 启动快，适合本地工具开发。
- Tailwind CSS 便于快速维护和统一视觉规则，后续新增页面或状态样式成本更低。

### 3.2 后端
- 运行时：`Node.js 22`
- 框架：`Express` 或 `Fastify`
- 语言：`TypeScript`
- 浏览器自动化：`Playwright`
- 下载能力：
  - 直链下载：Node 原生 `fetch` + stream
  - HLS / 复杂流媒体：`yt-dlp` 兜底
- 持久化：
  - 推荐：`SQLite`
  - 简化备选：JSON 文件

说明：
- 当前环境已确认存在 `Node`、`Google Chrome`、`yt-dlp`。
- 当前环境未检测到 `ffmpeg`，V1 设计优先使用 `yt-dlp` 处理 `m3u8`。

## 4. 系统架构

### 4.1 总体结构
- 前端控制台：负责 URL 输入、任务列表、资源选择、下载控制和日志展示。
- 本地 API 服务：负责任务调度、浏览器控制、资源识别、下载执行和状态推送。
- 受控浏览器会话：由 Playwright 启动本机 Chrome，供用户登录或手动触发播放。
- 本地存储：保存任务历史、用户设置、登录态和输出文件路径。

### 4.2 架构分层
- UI 层：React 页面、状态面板、资源表格、设置面板。
- 应用层：任务队列、任务状态机、下载调度、重试逻辑。
- 集成层：Playwright、yt-dlp、文件系统、数据库。
- 基础设施层：本地目录、Chrome 用户数据目录、日志输出、SSE 通道。

## 5. 关键模块设计

### 5.1 Task Queue
职责：
- 接收一个或多个 URL 并生成任务。
- 维护任务状态流转。
- 控制并发执行和重试。
- 关联每个任务的检测结果、下载结果和错误信息。

建议状态机：
- `pending`
- `running`
- `needs_login`
- `detected`
- `downloading`
- `completed`
- `failed`

### 5.2 Browser Manager
职责：
- 启动和复用 Playwright persistent context。
- 使用本机 Chrome 作为受控浏览器。
- 以域名粒度复用登录态。
- 在需要时打开浏览器窗口供用户手动登录或点播。

建议实现：
- 每个域名共享一个持久化 profile 目录。
- 前端不嵌入浏览器内核，而是控制独立 Chrome 窗口。
- 当前任务与当前页面上下文建立映射，便于用户恢复识别流程。

### 5.3 Video Detector
职责：
- 监听页面网络请求和响应。
- 扫描 DOM 中的 `video` / `source` 标签。
- 识别候选视频资源并去重。
- 提取下载需要的请求头和上下文。

识别规则：
- 文件后缀命中：`.mp4`、`.webm`、`.m3u8`
- 内容类型命中：`video/*`、`application/vnd.apple.mpegurl`
- 来源补充：页面标题、请求发起时间、关联 URL

输出字段建议：
- `resourceId`
- `taskId`
- `url`
- `format`
- `mimeType`
- `referer`
- `userAgent`
- `cookie`
- `headers`
- `titleHint`
- `sizeHint`

### 5.4 Download Manager
职责：
- 根据资源类型选择下载策略。
- 处理进度、失败重试和落盘。
- 为下载请求补齐 Cookie、Referer 和 User-Agent。

下载策略：
- `mp4` / `webm`：后端直接流式下载到本地文件。
- `m3u8`：调用 `yt-dlp` 完成下载与合并。
- 若后续环境补齐 `ffmpeg`，可在后续版本增强 HLS 兼容性。

### 5.5 History Store
职责：
- 保存任务历史、设置、输出路径和失败原因。
- 提供后续统计和问题排查数据。

建议存储内容：
- 任务基础信息
- 任务状态变更时间
- 资源识别结果
- 下载产物路径
- 错误消息和原始日志

## 6. API 设计建议

### 6.1 REST API
- `POST /api/tasks`
  - 创建一个或多个任务
- `GET /api/tasks`
  - 查询任务列表
- `GET /api/tasks/:id`
  - 查询任务详情
- `POST /api/tasks/:id/retry`
  - 重试失败任务
- `POST /api/tasks/:id/browser/open`
  - 打开该任务关联的受控浏览器
- `POST /api/tasks/:id/detect/resume`
  - 用户完成登录或手动操作后恢复识别
- `POST /api/tasks/:id/download`
  - 下载指定资源或全部已识别资源
- `GET /api/settings`
  - 读取下载目录、并发数等设置
- `POST /api/settings`
  - 保存设置

### 6.2 实时事件
- `GET /api/events`
  - 使用 SSE 推送任务状态变化、检测结果、下载进度和错误事件

## 7. 前端界面设计约束

### 7.1 页面结构
- 任务输入区：粘贴 URL、批量导入、开始任务。
- 任务队列区：展示任务状态、域名、失败原因和操作按钮。
- 资源详情区：展示识别出的候选视频资源，支持多选下载。
- 浏览器辅助区：提示用户是否需要登录或手动触发播放。
- 历史记录区：查看已完成任务和本地输出路径。

### 7.2 Tailwind CSS 使用规范
- 所有页面样式优先使用 Tailwind utility class。
- 公共色板、间距、阴影和圆角统一在 `tailwind.config` 中扩展。
- 状态色统一映射：
  - `pending`：中性色
  - `running`：信息色
  - `needs_login`：警示色
  - `detected`：强调色
  - `downloading`：品牌色
  - `completed`：成功色
  - `failed`：错误色
- 对重复的 UI 片段抽成 React 组件，不堆砌超长 class 字符串。

### 7.3 推荐 UI 风格
- 整体定位：本地控制台式工具界面。
- 重点强调状态清晰、信息密度适中、错误可追踪。
- 不追求营销型视觉，更重“任务控制台”的清晰度和维护性。

## 8. 目录结构建议
```text
.
├─ docs/
│  ├─ prd.md
│  └─ design.md
├─ apps/
│  ├─ web/
│  └─ server/
├─ packages/
│  ├─ shared/
│  └─ ui/
└─ data/
   ├─ profiles/
   ├─ downloads/
   └─ app.db
```

说明：
- `apps/web`：React + Vite + Tailwind CSS 前端控制台
- `apps/server`：Node + Playwright + 下载能力
- `packages/shared`：共享类型、状态枚举、接口定义
- `packages/ui`：可复用的基础 UI 组件

## 9. 风险与边界
- DRM 内容不支持，应明确提示并终止下载流程。
- 某些站点会使用复杂鉴权、短时签名或反自动化机制，V1 不承诺全站点高成功率。
- `m3u8` 的兼容性会受站点实现和本机下载依赖影响。
- 用户若未完成登录或未触发真实播放，请求层可能拿不到最终视频地址。

## 10. 验证方案

### 10.1 单元测试
- 文件名清洗
- URL 类型识别
- 资源去重
- 任务状态流转
- 请求头组装

### 10.2 集成测试
- 公开 `mp4` 测试页
- 需要登录的测试页
- `m3u8` 测试页
- 多 URL 批量任务

### 10.3 端到端验证
- 用户输入 URL 后可看到任务创建成功
- 用户完成登录后可恢复识别流程
- 识别到多个资源时可进行选择下载
- 下载完成后本地文件可定位、可播放

## 11. 当前结论
- V1 采用“本地 Web 控制台 + 受控 Chrome + 本地下载器”方案。
- 前端明确采用 `React + TypeScript + Tailwind CSS`。
- `m3u8` 首版依赖 `yt-dlp` 兜底，不强依赖 `ffmpeg`。
- 后续实现应优先搭建任务队列、浏览器管理和资源识别三条主链路。
