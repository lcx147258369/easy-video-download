import {
  getResourceDownloadStatusLabel,
  getTaskStatusLabel,
  isActiveResourceDownloadStatus,
  type DetectedResource,
  type TaskDetailResponse,
  type TaskRecord
} from "@video/shared";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { Panel } from "./ui/panel";
import { StatusBadge } from "./ui/status-badge";

export function TaskDetail({
  task,
  detail,
  selectedResourceIds,
  busy,
  onToggleResource,
  onDownloadSelected,
  onRetryDownload,
  onPreviewDownload,
  onRevealDownload
}: {
  task: TaskRecord | null;
  detail: TaskDetailResponse | null;
  selectedResourceIds: string[];
  busy: boolean;
  onToggleResource(resourceId: string): void;
  onDownloadSelected(): void;
  onRetryDownload(resource: DetectedResource): void;
  onPreviewDownload(resource: DetectedResource): void;
  onRevealDownload(resource: DetectedResource): void;
}) {
  const [showLogs, setShowLogs] = useState(false);

  useEffect(() => {
    setShowLogs(task?.status === "failed");
  }, [task?.id, task?.status]);

  const resourceCount = detail?.resources.length ?? 0;
  const selectedCount = selectedResourceIds.length;
  const completedCount =
    detail?.resources.filter((resource) => resource.downloadStatus === "completed").length ?? 0;
  const failedCount =
    detail?.resources.filter((resource) => resource.downloadStatus === "failed").length ?? 0;
  const nextStep = getTaskNextStep({
    status: task?.status ?? "pending",
    resourceCount,
    selectedCount,
    failedCount
  });

  if (!task) {
    return (
      <Panel className="flex min-h-[26rem] items-center justify-center">
        <p className="max-w-sm text-center text-sm leading-7 text-stone-600">
          从上面的页面任务里选中一项后，这里会显示抓到的资源、下载任务和详细日志。
        </p>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <Panel className="border-stone-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,247,246,0.96))]">
        <div className="space-y-4">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <StatusBadge
                  status={task.status}
                  label={getTaskStatusLabel(task.status)}
                />
                <span className="font-mono text-xs uppercase tracking-[0.22em] text-stone-600">
                  {task.siteHost}
                </span>
              </div>
              <div>
                <h2 className="font-display text-2xl font-semibold text-stone-900">
                  当前页面任务
                </h2>
                <p className="mt-2 break-all text-sm text-stone-700">{task.sourceUrl}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 text-[11px] text-stone-600">
              <HeaderMeta label={`已抓资源 ${resourceCount}`} tone="neutral" />
              <HeaderMeta label={`已选下载 ${selectedCount}`} tone="info" />
              <HeaderMeta label={`已完成 ${completedCount}`} tone="success" />
              {failedCount > 0 ? (
                <HeaderMeta label={`失败 ${failedCount}`} tone="warning" />
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {resourceCount > 0 ? (
                <Button
                  disabled={busy || selectedCount === 0}
                  onClick={onDownloadSelected}
                  variant="primary"
                >
                  生成所选下载任务
                </Button>
              ) : null}
              <p className="text-xs text-stone-500">
                页面任务操作已经收进左侧卡片，可直接在对应任务上继续抓取、打开浏览器或删除。
              </p>
            </div>

          <div className="rounded-[1rem] border border-stone-200/80 bg-white/60 px-3.5 py-3 text-sm text-stone-600">
            <span className="font-medium text-stone-900">下一步：</span>
            {nextStep.title}。{nextStep.description}
          </div>
        </div>
      </Panel>

      <Panel className="border-stone-200 bg-[linear-gradient(180deg,rgba(252,252,251,0.94),rgba(255,255,255,0.98))]">
        <header className="mb-4">
          <h3 className="font-display text-xl font-semibold text-stone-900">
            第 3 步：资源下载任务
          </h3>
        </header>
        {detail && detail.resources.length > 0 ? (
          <div className="space-y-3">
            {detail.resources.map((resource) => {
              const checked = selectedResourceIds.includes(resource.id);
              const primaryText = resource.titleHint?.trim() || resource.url;
              const showSecondaryUrl = Boolean(resource.titleHint?.trim());
              const canPreview =
                resource.downloadStatus === "completed" && Boolean(resource.outputFilePath);
              const canRetry = resource.downloadStatus === "failed";
              return (
                <label
                  key={resource.id}
                  className={cn(
                    "flex cursor-pointer gap-3 rounded-[1.2rem] border p-3.5 transition",
                    checked
                      ? "ui-panel-muted border-[rgba(23,23,23,0.12)] shadow-[0_10px_24px_rgba(15,23,42,0.05)] ring-1 ring-[rgba(23,23,23,0.04)]"
                      : "border-stone-200 bg-white/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] hover:border-stone-300"
                  )}
                >
                  <input
                    checked={checked}
                    className="mt-1 h-4 w-4 rounded border-stone-300 bg-white"
                    style={{ accentColor: "var(--accent-strong)" }}
                    onChange={() => onToggleResource(resource.id)}
                    type="checkbox"
                  />
                  <div className="min-w-0 flex-1 space-y-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex min-h-8 items-center rounded-[0.95rem] border border-zinc-200 bg-[linear-gradient(180deg,rgba(250,250,250,0.98),rgba(241,241,241,0.94))] px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                        {resource.format}
                      </span>
                      <DownloadBadge status={resource.downloadStatus} />
                      {resource.mimeType ? (
                        <span className="text-xs text-stone-500">{resource.mimeType}</span>
                      ) : null}
                    </div>
                    <div className="space-y-1.5">
                      <p className="line-clamp-2 break-all text-sm leading-6 text-stone-900">
                        {primaryText}
                      </p>
                      {showSecondaryUrl ? (
                        <p className="line-clamp-1 break-all text-xs leading-5 text-stone-500">
                          {resource.url}
                        </p>
                      ) : null}
                    </div>
                    <div className="rounded-[1.1rem] border border-stone-200 bg-[rgba(250,250,250,0.88)] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] leading-5 text-stone-600">
                        <span>{formatProgress(resource.downloadedBytes, resource.totalBytes)}</span>
                        <span>速度：{formatSpeed(resource.speedBytesPerSecond)}</span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-200">
                        <div
                          className="h-full rounded-full bg-stone-900 transition-all"
                          style={{
                            width: `${calculateProgressPercent(
                              resource.downloadedBytes,
                              resource.totalBytes,
                              resource.downloadStatus
                            )}%`
                          }}
                        />
                      </div>
                      <div className="mt-2 flex flex-wrap gap-3 text-[11px] leading-5 text-stone-500">
                        {resource.titleHint ? <span>标题线索：{resource.titleHint}</span> : null}
                        {resource.outputFilePath ? (
                          <span className="break-all">路径：{resource.outputFilePath}</span>
                        ) : null}
                        {!resource.outputFilePath && resource.referer ? (
                          <span className="break-all">来源页面：{resource.referer}</span>
                        ) : null}
                      </div>
                      {canPreview || canRetry ? (
                        <div className="mt-3 flex flex-wrap justify-end gap-2">
                          {canRetry ? (
                            <Button
                              className="px-3 py-1.5 text-xs"
                              onClick={() => onRetryDownload(resource)}
                              type="button"
                              variant="primary"
                            >
                              重试下载
                            </Button>
                          ) : null}
                          {canPreview ? (
                            <Button
                              className="px-3 py-1.5 text-xs"
                              onClick={() => onRevealDownload(resource)}
                              type="button"
                              variant="ghost"
                            >
                              查看下载文件位置
                            </Button>
                          ) : null}
                          {canPreview ? (
                            <Button
                              className="px-3 py-1.5 text-xs"
                              onClick={() => onPreviewDownload(resource)}
                              type="button"
                              variant="ghost"
                            >
                              查看下载内容
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                      {resource.errorMessage ? (
                        <p className="mt-2 rounded-xl border border-signal-danger/30 bg-signal-danger/10 px-3 py-2 text-xs text-[#ffc8d0]">
                          {resource.errorMessage}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-stone-600">
            还没有抓到资源。等待识别，或者先打开浏览器手动登录/播放后再继续抓取。
          </p>
        )}
      </Panel>

      <Panel className="border-stone-200 bg-white/95">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-xl font-semibold text-stone-900">任务日志</h3>
            <p className="mt-1 text-sm text-stone-700">
              这里会保留页面任务的状态变更、抓取结果和失败原因，便于排查问题。
            </p>
          </div>
          <Button onClick={() => setShowLogs((current) => !current)} variant="ghost">
            {showLogs ? "收起日志" : "展开日志"}
          </Button>
        </header>
        {showLogs ? detail && detail.logs.length > 0 ? (
          <ul className="space-y-3">
            {detail.logs.map((log) => {
              const presentation = classifyLogMessage(log.message, log.level);
              return (
                <li
                  key={log.id}
                  className={cn(
                    "rounded-[1.05rem] border px-4 py-3 transition",
                    presentation.containerClassName
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                    <span className="font-mono uppercase tracking-[0.18em]">
                      {log.level}
                    </span>
                    {presentation.badgeLabel ? (
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full border px-2 py-0.5 font-semibold uppercase tracking-[0.12em]",
                          presentation.badgeClassName
                        )}
                      >
                        {presentation.badgeLabel}
                      </span>
                    ) : null}
                    <span>{new Date(log.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="mt-2 text-sm text-stone-900">{log.message}</p>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-stone-600">当前任务还没有日志。</p>
        ) : (
          <p className="mt-4 text-sm text-stone-600">
            日志默认收起，只有排查失败或异常时再展开查看。
          </p>
        )}
      </Panel>
    </div>
  );
}

function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

function calculateProgressPercent(
  downloadedBytes: number,
  totalBytes: number | null,
  status: TaskDetailResponse["resources"][number]["downloadStatus"]
): number {
  if (status === "completed") {
    return 100;
  }
  if (!totalBytes || totalBytes <= 0) {
    return isActiveResourceDownloadStatus(status) ? 35 : 0;
  }
  return Math.max(0, Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)));
}

function formatProgress(downloadedBytes: number, totalBytes: number | null): string {
  if (!totalBytes || totalBytes <= 0) {
    return `${formatBytes(downloadedBytes)} / 未知`;
  }
  return `${Math.round((downloadedBytes / totalBytes) * 100)}%`;
}

function formatBytes(value: number): string {
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${value} B`;
}

function formatSpeed(value: number | null): string {
  if (!value) {
    return "未知";
  }
  return `${formatBytes(value)}/s`;
}

function HeaderMeta({
  label,
  tone
}: {
  label: string;
  tone: "neutral" | "info" | "success" | "warning";
}) {
  const toneClasses = {
    neutral: "border-stone-200 bg-stone-100/80 text-stone-700",
    info: "border-sky-200 bg-sky-50 text-sky-700",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warning: "border-amber-200 bg-amber-50 text-amber-700"
  } as const;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 font-medium",
        toneClasses[tone]
      )}
    >
      {label}
    </span>
  );
}

function getTaskNextStep(input: {
  status: TaskRecord["status"];
  resourceCount: number;
  selectedCount: number;
  failedCount: number;
}): { title: string; description: string } {
  if (input.status === "needs_login") {
    return {
      title: "先登录或手动播放页面",
      description: "打开浏览器补登录、播放视频后，再继续抓取真实媒体资源。"
    };
  }

  if (input.status === "failed" && input.resourceCount === 0) {
    return {
      title: "页面任务还没抓到可下载资源",
      description: "可以直接重试页面任务，或者打开浏览器确认页面是否需要登录、播放或切换线路。"
    };
  }

  if (input.resourceCount > 0 && input.selectedCount === 0) {
    return {
      title: "先勾选你要下载的资源",
      description: "资源已经抓到，勾选目标资源后，再生成对应的下载任务。"
    };
  }

  if (input.resourceCount > 0 && input.selectedCount > 0) {
    return {
      title: "可以开始生成下载任务了",
      description: "当前已经有可下载资源，也已经完成选择，下一步直接生成下载任务即可。"
    };
  }

  if (input.failedCount > 0) {
    return {
      title: "先处理失败资源",
      description: "右侧资源列表里会显示失败项，优先重试失败资源，再继续批量下载。"
    };
  }

  return {
    title: "继续抓取页面资源",
    description: "如果页面还没出流，可以继续抓取；需要手动操作时，也可以先打开浏览器辅助识别。"
  };
}

type ResourceDownloadStatus = TaskDetailResponse["resources"][number]["downloadStatus"];

function getDownloadLabel(status: ResourceDownloadStatus): string {
  return getResourceDownloadStatusLabel(status);
}

function DownloadBadge({ status }: { status: ResourceDownloadStatus }) {
  const tone = {
    idle: { dot: "bg-zinc-400", text: "text-zinc-600" },
    downloading: { dot: "bg-blue-500", text: "text-blue-700" },
    merging: { dot: "bg-amber-500", text: "text-amber-700" },
    remuxing: { dot: "bg-violet-500", text: "text-violet-700" },
    completed: { dot: "bg-emerald-500", text: "text-emerald-700" },
    failed: { dot: "bg-rose-500", text: "text-rose-700" }
  } satisfies Record<ResourceDownloadStatus, { dot: string; text: string }>;

  const currentTone = tone[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.12em] uppercase",
        currentTone.text
      )}
    >
      <span className={cn("h-2 w-2 rounded-full", currentTone.dot)} />
      {getDownloadLabel(status)}
    </span>
  );
}

function classifyLogMessage(
  message: string,
  level: "info" | "warn" | "error"
): {
  badgeLabel: string | null;
  badgeClassName: string;
  containerClassName: string;
} {
  if (message.includes("开始转 MP4")) {
    return {
      badgeLabel: "转 MP4",
      badgeClassName: "border-violet-200 bg-violet-50 text-violet-700",
      containerClassName: "border-violet-200 bg-violet-50/70"
    };
  }

  if (message.includes("开始合并 m3u8 分片")) {
    return {
      badgeLabel: "合并中",
      badgeClassName: "border-amber-200 bg-amber-50 text-amber-700",
      containerClassName: "border-amber-200 bg-amber-50/70"
    };
  }

  if (message.includes("下载完成")) {
    return {
      badgeLabel: "已完成",
      badgeClassName: "border-emerald-200 bg-emerald-50 text-emerald-700",
      containerClassName: "border-emerald-200 bg-emerald-50/70"
    };
  }

  if (message.includes("开始下载")) {
    return {
      badgeLabel: "下载中",
      badgeClassName: "border-sky-200 bg-sky-50 text-sky-700",
      containerClassName: "border-sky-200 bg-sky-50/70"
    };
  }

  if (message.includes("下载失败") || level === "error") {
    return {
      badgeLabel: "失败",
      badgeClassName: "border-rose-200 bg-rose-50 text-rose-700",
      containerClassName: "border-rose-200 bg-rose-50/70"
    };
  }

  return {
    badgeLabel: null,
    badgeClassName: "",
    containerClassName: "border-stone-200 bg-stone-50/90"
  };
}
