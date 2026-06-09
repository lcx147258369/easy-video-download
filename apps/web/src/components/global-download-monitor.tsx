import {
  getResourceDownloadStatusLabel,
  isActiveResourceDownloadStatus,
  type ManagedVideoItem
} from "@video/shared";

import { Button } from "./ui/button";
import { Panel } from "./ui/panel";
import { cn } from "./ui/cn";

const STATUS_PRIORITY: Record<ManagedVideoItem["downloadStatus"], number> = {
  downloading: 0,
  merging: 1,
  remuxing: 2,
  failed: 3,
  completed: 4,
  idle: 5
};

export function GlobalDownloadMonitor({
  resources,
  busyIds,
  onFocusTask,
  onPreviewDownload,
  onRetryDownload,
  onRevealDownload
}: {
  resources: ManagedVideoItem[];
  busyIds: Set<string>;
  onFocusTask(taskId: string): void;
  onPreviewDownload(resource: ManagedVideoItem): void;
  onRetryDownload(resource: ManagedVideoItem): void;
  onRevealDownload(resource: ManagedVideoItem): void;
}) {
  const visibleResources = [...resources]
    .filter((resource) => resource.downloadStatus !== "idle")
    .sort((left, right) => {
      const priorityDiff =
        STATUS_PRIORITY[left.downloadStatus] - STATUS_PRIORITY[right.downloadStatus];
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      return right.taskUpdatedAt.localeCompare(left.taskUpdatedAt);
    })
    .slice(0, 6);

  const activeCount = resources.filter((resource) =>
    isActiveResourceDownloadStatus(resource.downloadStatus)
  ).length;

  return (
    <Panel className="border-stone-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,247,246,0.96))]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-stone-900">
            后台下载看板
          </h2>
          <p className="mt-1 text-sm text-stone-700">
            切换页面任务不会影响这里的下载状态，正在下载的资源会持续更新。
          </p>
        </div>
        <div className="rounded-[1rem] border border-stone-200 bg-white/85 px-4 py-3">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-stone-500">
            处理中
          </p>
          <p className="mt-1 font-display text-2xl font-semibold text-stone-900">
            {activeCount}
          </p>
        </div>
      </div>

      {visibleResources.length > 0 ? (
        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          {visibleResources.map((resource) => {
            const isBusy = busyIds.has(resource.id) || busyIds.has(resource.taskId);
            const canPreview =
              resource.downloadStatus === "completed" && Boolean(resource.outputFilePath);

            return (
              <article
                key={resource.id}
                className="rounded-[1.25rem] border border-stone-200 bg-white/90 p-4 shadow-[0_8px_18px_rgba(15,23,42,0.03)]"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex min-h-8 items-center rounded-[0.95rem] border border-zinc-200 bg-stone-50 px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
                      {resource.format}
                    </span>
                    <StatusText status={resource.downloadStatus} />
                  </div>
                  <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-stone-500">
                    {resource.siteHost}
                  </span>
                </div>

                <p className="mt-3 line-clamp-2 break-all text-sm leading-6 text-stone-900">
                  {resource.titleHint || resource.url}
                </p>

                <div className="mt-3 space-y-2 rounded-[1rem] border border-stone-200 bg-stone-50/80 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-600">
                    <span>{formatProgress(resource.downloadedBytes, resource.totalBytes)}</span>
                    <span>速度：{formatSpeed(resource.speedBytesPerSecond)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-stone-200">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        resource.downloadStatus === "failed"
                          ? "bg-rose-500"
                          : resource.downloadStatus === "completed"
                            ? "bg-emerald-600"
                            : resource.downloadStatus === "remuxing"
                              ? "bg-violet-600"
                              : resource.downloadStatus === "merging"
                                ? "bg-amber-500"
                            : "bg-stone-900"
                      )}
                      style={{
                        width: `${calculateProgressPercent(
                          resource.downloadedBytes,
                          resource.totalBytes,
                          resource.downloadStatus
                        )}%`
                      }}
                    />
                  </div>
                  <div className="flex flex-wrap gap-3 text-[11px] leading-5 text-stone-500">
                    <span className="break-all">来源页面：{resource.sourceUrl}</span>
                    <span className="break-all">输出：{resource.outputFilePath || "未生成"}</span>
                  </div>
                  {resource.errorMessage ? (
                    <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                      {resource.errorMessage}
                    </p>
                  ) : null}
                </div>

                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <Button
                    className="px-3 py-1.5 text-xs"
                    disabled={isBusy}
                    onClick={() => onFocusTask(resource.taskId)}
                    type="button"
                  >
                    定位页面任务
                  </Button>
                  {resource.downloadStatus === "failed" ? (
                    <Button
                      className="px-3 py-1.5 text-xs"
                      disabled={isBusy}
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
                      disabled={isBusy}
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
                      disabled={isBusy}
                      onClick={() => onPreviewDownload(resource)}
                      type="button"
                      variant="ghost"
                    >
                      查看下载内容
                    </Button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="mt-4 text-sm text-stone-600">
          当前还没有后台下载中的资源。生成下载任务后，这里会持续显示它们的进度。
        </p>
      )}
    </Panel>
  );
}

function calculateProgressPercent(
  downloadedBytes: number,
  totalBytes: number | null,
  status: ManagedVideoItem["downloadStatus"]
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

function StatusText({ status }: { status: ManagedVideoItem["downloadStatus"] }) {
  const tone = {
    downloading: { dot: "bg-blue-500", text: "text-blue-700" },
    merging: { dot: "bg-amber-500", text: "text-amber-700" },
    remuxing: { dot: "bg-violet-500", text: "text-violet-700" },
    completed: { dot: "bg-emerald-500", text: "text-emerald-700" },
    failed: { dot: "bg-rose-500", text: "text-rose-700" },
    idle: { dot: "bg-zinc-400", text: "text-zinc-600" }
  } as const;

  const currentTone = tone[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em]",
        currentTone.text
      )}
    >
      <span className={cn("h-2 w-2 rounded-full", currentTone.dot)} />
      {getResourceDownloadStatusLabel(status)}
    </span>
  );
}
