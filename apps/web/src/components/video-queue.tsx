import { useState } from "react";
import {
  getResourceDownloadStatusLabel,
  isActiveResourceDownloadStatus,
  type ManagedVideoItem
} from "@video/shared";
import { cn } from "./ui/cn";
import { Panel } from "./ui/panel";
import { Button } from "./ui/button";

function formatBytes(value: number): string {
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${value} B`;
}

function formatSpeed(value: number | null): string {
  return value ? `${formatBytes(value)}/s` : "未知";
}

function progressPercent(resource: ManagedVideoItem): number {
  if (resource.downloadStatus === "completed") return 100;
  if (!resource.totalBytes || resource.totalBytes <= 0) {
    return isActiveResourceDownloadStatus(resource.downloadStatus) ? 35 : 0;
  }
  return Math.max(
    0,
    Math.min(100, Math.round((resource.downloadedBytes / resource.totalBytes) * 100))
  );
}

function progressLabel(resource: ManagedVideoItem): string {
  if (!resource.totalBytes || resource.totalBytes <= 0) {
    return `${formatBytes(resource.downloadedBytes)} / 未知`;
  }
  return `${Math.round((resource.downloadedBytes / resource.totalBytes) * 100)}%`;
}

function statusLabel(resource: ManagedVideoItem): string {
  return getResourceDownloadStatusLabel(resource.downloadStatus);
}

function CollapsibleLink({
  label,
  href,
  accent = false
}: {
  label: string;
  href: string;
  accent?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={cn(
        "rounded-2xl border px-3.5 py-3",
        accent
          ? "border-[rgba(23,23,23,0.08)] bg-[rgba(250,250,250,0.92)]"
          : "border-stone-200/80 bg-white/75"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <span
            className={cn(
              "text-[11px] font-medium",
              accent ? "text-zinc-500" : "text-stone-500"
            )}
          >
            {label}
          </span>
          <a
            className={cn(
              "mt-1 block text-sm leading-6",
              expanded ? "break-all" : "truncate",
              accent ? "text-zinc-700" : "text-stone-700"
            )}
            href={href}
            rel="noreferrer"
            target="_blank"
            title={href}
          >
            {href}
          </a>
        </div>
        <button
          type="button"
          className={cn(
            "shrink-0 pt-0.5 text-[11px] font-semibold transition hover:opacity-80",
            accent ? "text-zinc-600" : "text-stone-700"
          )}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "收起" : "完整链接"}
        </button>
      </div>
    </div>
  );
}

export function VideoQueue({
  resources,
  busyIds,
  onDownload,
  onDelete,
  onOpenSource,
  onPreviewDownload
}: {
  resources: ManagedVideoItem[];
  busyIds: Set<string>;
  onDownload(resource: ManagedVideoItem): void;
  onDelete(resource: ManagedVideoItem): void;
  onOpenSource(resource: ManagedVideoItem): void;
  onPreviewDownload(resource: ManagedVideoItem): void;
}) {
  return (
    <Panel className="overflow-hidden p-0">
      <header className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
        <div>
          <p className="font-display text-xl font-semibold text-stone-900">视频队列</p>
          <p className="mt-1 text-sm text-stone-700">
            链接只负责抓取，真正进入队列的是抓出来的视频资源。
          </p>
        </div>
        <span className="font-mono text-xs uppercase tracking-[0.22em] text-stone-600">
          {resources.length} video(s)
        </span>
      </header>

      <div className="max-h-[44rem] overflow-auto">
        {resources.length === 0 ? (
          <div className="px-5 py-10 text-sm text-stone-700">
            还没有抓到任何视频资源。创建链接任务后，识别成功的视频会直接出现在这里。
          </div>
        ) : (
          <ul className="space-y-4 px-4 py-4">
            {resources.map((resource, index) => {
              const isBusy = busyIds.has(resource.id) || busyIds.has(resource.taskId);
              const isCompleted = resource.downloadStatus === "completed";
              const hasPreview = isCompleted && Boolean(resource.outputFilePath);
              return (
                <li
                  key={resource.id}
                  className={cn(
                    "rounded-[1.6rem] border px-5 py-5",
                    isCompleted
                      ? "border-[rgba(23,23,23,0.08)] bg-[rgba(255,255,255,0.96)] shadow-[0_10px_24px_rgba(15,23,42,0.035)]"
                      : "border-[rgba(23,23,23,0.08)] bg-[rgba(250,250,250,0.92)] shadow-[0_8px_18px_rgba(15,23,42,0.025)]"
                  )}
                >
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1 space-y-3">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="rounded-full border border-stone-200 bg-stone-100 px-2 py-1 font-mono text-[11px] uppercase tracking-[0.22em] text-stone-500">
                            {resource.format}
                          </span>
                          <span
                            className={cn(
                              "rounded-full px-2.5 py-1 text-xs font-semibold",
                              isCompleted
                                ? "border border-[rgba(23,23,23,0.1)] bg-[rgba(244,244,245,0.9)] text-zinc-700"
                                : "text-stone-900"
                            )}
                          >
                            {statusLabel(resource)}
                          </span>
                        </div>

                        <div className="space-y-2">
                          <div className="flex flex-wrap items-end gap-x-3 gap-y-1 border-b border-[rgba(23,23,23,0.06)] pb-2">
                            <p className="text-[1.65rem] font-semibold leading-none text-[color:var(--ink-strong)]">
                              视频 {index + 1}
                            </p>
                            <span className="pb-0.5 font-mono text-[11px] uppercase tracking-[0.22em] text-[color:var(--ink-soft)]">
                              {resource.siteHost}
                            </span>
                          </div>
                          {resource.titleHint ? (
                            <p className="text-sm leading-6 text-[color:var(--ink-body)]">
                              {resource.titleHint}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-2.5 lg:grid-cols-2">
                      <CollapsibleLink
                        accent={isCompleted}
                        href={resource.url}
                        label="下载链接"
                      />
                      <CollapsibleLink
                        accent={isCompleted}
                        href={resource.sourceUrl}
                        label="来源页面"
                      />
                    </div>

                    <div
                      className={cn(
                        "rounded-2xl p-3",
                        isCompleted
                          ? "border border-[rgba(23,23,23,0.08)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(246,246,247,0.96))] shadow-[0_8px_20px_rgba(15,23,42,0.03)]"
                          : "ui-panel-muted"
                      )}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className={cn("text-xs", isCompleted ? "text-zinc-700" : "text-stone-700")}>
                          {progressLabel(resource)}
                        </span>
                        <span className={cn("text-xs", isCompleted ? "text-zinc-700" : "text-stone-700")}>
                          速度：{formatSpeed(resource.speedBytesPerSecond)}
                        </span>
                      </div>
                      <div
                        className={cn(
                          "mt-2 h-2 overflow-hidden rounded-full",
                          isCompleted ? "bg-zinc-200" : "bg-stone-200"
                        )}
                      >
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            isCompleted ? "bg-zinc-700" : "bg-stone-900"
                          )}
                          style={{ width: `${progressPercent(resource)}%` }}
                        />
                      </div>
                      {isCompleted ? (
                        <div className="mt-3 rounded-2xl border border-[rgba(23,23,23,0.08)] bg-[rgba(250,250,250,0.92)] px-3 py-2">
                          <p className="text-sm font-semibold text-zinc-800">
                            下载成功，文件已保存到本地
                          </p>
                          <p className="mt-1 break-all text-xs text-zinc-600">
                            {resource.outputFilePath || "路径暂不可用"}
                          </p>
                        </div>
                      ) : null}
                      <div
                        className={cn(
                          "mt-2 flex flex-wrap gap-3 text-[11px]",
                          isCompleted ? "text-zinc-600" : "text-stone-600"
                        )}
                      >
                        <span>输出：{resource.outputFilePath || "未生成"}</span>
                        <span>抓取状态：{resource.taskStatus}</span>
                      </div>
                      {resource.errorMessage ? (
                        <p className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                          {resource.errorMessage}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[rgba(23,23,23,0.06)] pt-3">
                      <Button
                        className="px-4 text-[13px]"
                        disabled={isBusy}
                        onClick={() => onDownload(resource)}
                        variant="primary"
                      >
                        {resource.downloadStatus === "completed" ? "重新下载" : "下载"}
                      </Button>
                      <Button
                        className="px-4 text-[13px]"
                        disabled={isBusy}
                        onClick={() => onOpenSource(resource)}
                      >
                        打开来源
                      </Button>
                      {hasPreview ? (
                        <Button
                          className="px-4 text-[13px]"
                          disabled={isBusy}
                          onClick={() => onPreviewDownload(resource)}
                          variant="ghost"
                        >
                          查看下载内容
                        </Button>
                      ) : null}
                      <Button
                        className="px-4 text-[13px]"
                        disabled={isBusy}
                        onClick={() => onDelete(resource)}
                        variant="danger"
                      >
                        删除
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Panel>
  );
}
