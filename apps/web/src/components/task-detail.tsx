import {
  getTaskStatusLabel,
  type DetectedResource,
  type TaskDetailResponse,
  type TaskRecord
} from "@video/shared";
import { Button } from "./ui/button";
import { Panel } from "./ui/panel";
import { StatusBadge } from "./ui/status-badge";

export function TaskDetail({
  task,
  detail,
  selectedResourceIds,
  busy,
  onDelete,
  onToggleResource,
  onDownloadSelected,
  onRetry,
  onOpenBrowser,
  onResume,
  onPreviewDownload
}: {
  task: TaskRecord | null;
  detail: TaskDetailResponse | null;
  selectedResourceIds: string[];
  busy: boolean;
  onDelete(): void;
  onToggleResource(resourceId: string): void;
  onDownloadSelected(): void;
  onRetry(): void;
  onOpenBrowser(): void;
  onResume(): void;
  onPreviewDownload(resource: DetectedResource): void;
}) {
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
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
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

          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={onOpenBrowser}>
              打开浏览器
            </Button>
            <Button disabled={busy} onClick={onResume}>
              继续抓取
            </Button>
            <Button disabled={busy} onClick={onRetry} variant="ghost">
              重试页面任务
            </Button>
            <Button disabled={busy} onClick={onDelete} variant="danger">
              删除页面任务
            </Button>
            <Button disabled={busy} onClick={onDownloadSelected} variant="primary">
              生成所选下载任务
            </Button>
          </div>
        </div>
      </Panel>

      <Panel className="border-stone-200 bg-[linear-gradient(180deg,rgba(252,252,251,0.94),rgba(255,255,255,0.98))]">
        <header className="mb-4">
          <h3 className="font-display text-xl font-semibold text-stone-900">
            第 3 步：资源下载任务
          </h3>
          <p className="mt-1 text-sm text-stone-700">
            先勾选当前页面里要下载的资源，再生成对应的下载任务。
          </p>
        </header>
        {detail && detail.resources.length > 0 ? (
          <div className="space-y-3">
            {detail.resources.map((resource) => {
              const checked = selectedResourceIds.includes(resource.id);
              return (
                <label
                  key={resource.id}
                  className={cn(
                    "flex cursor-pointer gap-3 rounded-[1.3rem] border p-4 transition",
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
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex min-h-8 items-center rounded-[0.95rem] border border-zinc-200 bg-[linear-gradient(180deg,rgba(250,250,250,0.98),rgba(241,241,241,0.94))] px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                        {resource.format}
                      </span>
                      <DownloadBadge status={resource.downloadStatus} />
                      {resource.mimeType ? (
                        <span className="text-xs text-stone-500">{resource.mimeType}</span>
                      ) : null}
                    </div>
                    <p className="break-all text-sm leading-6 text-stone-900">{resource.url}</p>
                    <div className="flex flex-wrap gap-3 text-xs leading-5 text-stone-500">
                      <span>标题线索：{resource.titleHint || "无"}</span>
                      <span>来源：{resource.referer || "无"}</span>
                    </div>
                    <div className="rounded-[1.2rem] border border-stone-200 bg-[rgba(250,250,250,0.88)] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs text-stone-600">
                          {formatProgress(resource.downloadedBytes, resource.totalBytes)}
                        </span>
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
                        <span>速度：{formatSpeed(resource.speedBytesPerSecond)}</span>
                        <span className="break-all">路径：{resource.outputFilePath || "未生成"}</span>
                      </div>
                      {resource.downloadStatus === "completed" && resource.outputFilePath ? (
                        <div className="mt-3 flex justify-end">
                          <Button
                            className="px-3 py-1.5 text-xs"
                            onClick={() => onPreviewDownload(resource)}
                            type="button"
                            variant="ghost"
                          >
                            查看下载内容
                          </Button>
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
        <header className="mb-4">
          <h3 className="font-display text-xl font-semibold text-stone-900">任务日志</h3>
          <p className="mt-1 text-sm text-stone-700">
            这里会保留页面任务的状态变更、抓取结果和失败原因，便于排查问题。
          </p>
        </header>
        {detail && detail.logs.length > 0 ? (
          <ul className="space-y-3">
            {detail.logs.map((log) => (
              <li
                key={log.id}
                className="rounded-[1.05rem] border border-stone-200 bg-stone-50/90 px-4 py-3"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                  <span className="font-mono uppercase tracking-[0.18em]">
                    {log.level}
                  </span>
                  <span>{new Date(log.createdAt).toLocaleString()}</span>
                </div>
                <p className="mt-2 text-sm text-stone-900">{log.message}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-stone-600">当前任务还没有日志。</p>
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
    return status === "downloading" ? 35 : 0;
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

type ResourceDownloadStatus = TaskDetailResponse["resources"][number]["downloadStatus"];

function getDownloadLabel(status: ResourceDownloadStatus): string {
  if (status === "downloading") return "下载中";
  if (status === "completed") return "下载完成";
  if (status === "failed") return "下载失败";
  return "等待下载";
}

function DownloadBadge({ status }: { status: ResourceDownloadStatus }) {
  const tone = {
    idle: { dot: "bg-zinc-400", text: "text-zinc-600" },
    downloading: { dot: "bg-blue-500", text: "text-blue-700" },
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
