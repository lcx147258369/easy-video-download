import {
  getTaskStatusLabel,
  isActiveResourceDownloadStatus,
  type ManagedVideoItem,
  type TaskRecord
} from "@video/shared";

import { Button } from "./ui/button";
import { cn } from "./ui/cn";
import { Panel } from "./ui/panel";
import { StatusBadge } from "./ui/status-badge";

export function TaskTable({
  tasks,
  selectedTaskId,
  resources,
  selectedTaskIds,
  busyTaskIds,
  onSelect,
  onToggleTask,
  onToggleAll,
  onDeleteSelected,
  onOpenTaskBrowser,
  onRetryTask,
  onResumeTask,
  onDeleteTask
}: {
  tasks: TaskRecord[];
  selectedTaskId: string | null;
  resources: ManagedVideoItem[];
  selectedTaskIds: Set<string>;
  busyTaskIds: Set<string>;
  onSelect(taskId: string): void;
  onToggleTask(taskId: string): void;
  onToggleAll(): void;
  onDeleteSelected(): void;
  onOpenTaskBrowser(taskId: string): void;
  onRetryTask(taskId: string): void;
  onResumeTask(taskId: string): void;
  onDeleteTask(taskId: string): void;
}) {
  const allSelected = tasks.length > 0 && tasks.every((task) => selectedTaskIds.has(task.id));
  const selectedCount = tasks.filter((task) => selectedTaskIds.has(task.id)).length;

  return (
    <Panel className="overflow-hidden p-0">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 px-4 py-3">
        <div className="flex items-center gap-3">
          <p className="font-display text-[18px] font-semibold text-stone-900">页面任务</p>
          <span className="text-[11px] text-stone-400">已选 {selectedCount}</span>
        </div>

        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-2 text-xs text-stone-600">
            <input
              checked={allSelected}
              className="h-3.5 w-3.5 rounded border-stone-300 bg-white"
              onChange={onToggleAll}
              style={{ accentColor: "var(--accent-strong)" }}
              type="checkbox"
            />
            全选
          </label>
          <Button
            className="min-h-7 rounded-full px-3 py-1 text-[11px]"
            disabled={selectedCount === 0}
            onClick={onDeleteSelected}
            type="button"
            variant="danger"
          >
            删除已选
          </Button>
        </div>
      </header>

      <div className="max-h-[36rem] overflow-y-auto overflow-x-hidden xl:max-h-[calc(100vh-12.5rem)]">
        {tasks.length === 0 ? (
          <div className="px-5 py-10 text-sm text-stone-700">
            还没有页面任务。先在左侧输入 URL 创建第一批任务。
          </div>
        ) : (
          <ul className="space-y-3 px-3 py-3">
            {tasks.map((task, index) => {
              const taskResources = resources.filter((resource) => resource.taskId === task.id);
              const completedCount = taskResources.filter(
                (resource) => resource.downloadStatus === "completed"
              ).length;
              const failedCount = taskResources.filter(
                (resource) => resource.downloadStatus === "failed"
              ).length;
              const activeCount = taskResources.filter((resource) =>
                isActiveResourceDownloadStatus(resource.downloadStatus)
              ).length;
              const title = task.title?.trim();
              const showSourceUrl = !title || title === task.sourceUrl;
              const progressLabel = getTaskProgressLabel({
                resourceCount: taskResources.length,
                completedCount,
                failedCount,
                activeCount
              });
              const progressTone = getTaskProgressTone({
                resourceCount: taskResources.length,
                completedCount,
                failedCount,
                activeCount
              });
              const selected = selectedTaskId === task.id;
              const primaryAction = getPrimaryTaskAction({
                status: task.status,
                resourceCount: taskResources.length
              });
              const taskCode = formatTaskCode(index);

              return (
                <li
                  key={task.id}
                  className={cn(
                    "group relative overflow-hidden rounded-[1.3rem] border px-4 py-3 transition duration-200",
                    selected
                      ? "ui-panel border-[rgba(23,23,23,0.12)] shadow-[0_16px_30px_rgba(15,23,42,0.07)] ring-1 ring-[rgba(23,23,23,0.05)]"
                      : "ui-panel-muted border-[rgba(23,23,23,0.08)] shadow-[0_8px_18px_rgba(15,23,42,0.028)] hover:-translate-y-0.5 hover:border-[rgba(23,23,23,0.14)] hover:shadow-[0_12px_24px_rgba(15,23,42,0.045)]"
                  )}
                >
                  <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),transparent_50%)]" />

                  {selected ? (
                    <span className="absolute inset-y-4 left-0 w-[3px] rounded-r-full bg-stone-900/75" />
                  ) : null}

                  <div className="relative flex items-start gap-3">
                    <input
                      checked={selectedTaskIds.has(task.id)}
                      className="mt-1 h-4 w-4 shrink-0 rounded border-stone-300 bg-white"
                      onChange={() => onToggleTask(task.id)}
                      onClick={(event) => event.stopPropagation()}
                      style={{ accentColor: "var(--accent-strong)" }}
                      type="checkbox"
                    />

                    <div className="min-w-0 flex-1 space-y-3">
                      <button
                        className="min-w-0 w-full space-y-3 text-left"
                        onClick={() => onSelect(task.id)}
                        type="button"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1 space-y-2.5">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                              <StatusBadge
                                status={task.status}
                                label={getTaskStatusLabel(task.status)}
                              />
                              <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-stone-500">
                                {task.siteHost}
                              </span>
                            </div>

                            <div className="space-y-1">
                              <p className="line-clamp-1 break-all text-[15px] font-semibold leading-6 text-stone-900 [overflow-wrap:anywhere]">
                                {title || task.sourceUrl}
                              </p>
                              {showSourceUrl ? null : (
                                <p className="line-clamp-1 break-all text-xs leading-5 text-stone-500 [overflow-wrap:anywhere]">
                                  {task.sourceUrl}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex shrink-0 items-start pt-0.5">
                            <span className="font-mono text-[9px] uppercase tracking-[0.26em] text-stone-400">
                              {taskCode}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12px] text-stone-500">
                          <InlineMeta label={`资源 ${taskResources.length}`} />
                          <span className="text-stone-300">/</span>
                          <InlineMeta
                            label={completedCount > 0 ? `已完成 ${completedCount}` : progressLabel}
                            tone={progressTone}
                          />
                          <span className="text-stone-300">/</span>
                          <InlineMeta label={`更新于 ${formatTime(task.updatedAt)}`} />
                        </div>

                        {task.errorMessage ? (
                          <p className="line-clamp-1 text-xs text-red-700">{task.errorMessage}</p>
                        ) : null}
                      </button>

                      {selected ? (
                        <div className="flex flex-wrap items-center gap-1.5 border-t border-stone-200/80 pt-2">
                          <Button
                            className="min-h-7 rounded-full px-3 py-1 text-[11px]"
                            disabled={busyTaskIds.has(task.id)}
                            onClick={() => {
                              onSelect(task.id);
                              runTaskActionByKind(primaryAction.kind, task.id, {
                                onOpenTaskBrowser,
                                onRetryTask,
                                onResumeTask
                              });
                            }}
                            type="button"
                            variant="secondary"
                          >
                            {primaryAction.label}
                          </Button>
                          <Button
                            className="min-h-7 rounded-full px-3 py-1 text-[11px]"
                            disabled={busyTaskIds.has(task.id)}
                            onClick={() => {
                              onSelect(task.id);
                              onDeleteTask(task.id);
                            }}
                            type="button"
                            variant="ghost"
                          >
                            删除任务
                          </Button>
                        </div>
                      ) : null}
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

function formatTime(value: string): string {
  const date = new Date(value);
  return date.toLocaleString();
}

function InlineMeta({
  label,
  tone = "neutral"
}: {
  label: string;
  tone?: "neutral" | "success" | "info" | "warning";
}) {
  const toneClasses = {
    neutral: "text-stone-500",
    success: "text-emerald-700",
    info: "text-sky-700",
    warning: "text-amber-700"
  } as const;

  return (
    <span className={cn("inline-flex items-center gap-1.5 leading-5", toneClasses[tone])}>
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          tone === "success"
            ? "bg-emerald-500"
            : tone === "info"
              ? "bg-sky-500"
              : tone === "warning"
                ? "bg-amber-500"
                : "bg-stone-300"
        )}
      />
      {label}
    </span>
  );
}

function getPrimaryTaskAction(input: {
  status: TaskRecord["status"];
  resourceCount: number;
}): {
  kind: "resume" | "retry" | "browser";
  label: string;
} {
  if (input.status === "needs_login") {
    return { kind: "browser", label: "打开浏览器继续" };
  }
  if (input.status === "failed" && input.resourceCount === 0) {
    return { kind: "retry", label: "重试页面任务" };
  }
  return { kind: "resume", label: "继续抓取" };
}

function getSecondaryTaskActions(input: {
  status: TaskRecord["status"];
  primaryKind: "resume" | "retry" | "browser";
}): Array<{
  kind: "resume" | "retry" | "browser" | "delete";
  label: string;
}> {
  const actions: Array<{
    kind: "resume" | "retry" | "browser" | "delete";
    label: string;
  }> = [];

  if (input.primaryKind !== "resume") {
    actions.push({ kind: "resume", label: "继续抓取" });
  }
  if (input.primaryKind !== "browser") {
    actions.push({
      kind: "browser",
      label: input.status === "needs_login" ? "打开浏览器" : "打开浏览器辅助识别"
    });
  }
  if (input.primaryKind !== "retry") {
    actions.push({ kind: "retry", label: "重试页面任务" });
  }
  actions.push({ kind: "delete", label: "删除页面任务" });

  return actions;
}

function runTaskActionByKind(
  kind: "resume" | "retry" | "browser",
  taskId: string,
  handlers: {
    onOpenTaskBrowser(taskId: string): void;
    onRetryTask(taskId: string): void;
    onResumeTask(taskId: string): void;
  }
) {
  if (kind === "browser") {
    handlers.onOpenTaskBrowser(taskId);
    return;
  }
  if (kind === "retry") {
    handlers.onRetryTask(taskId);
    return;
  }
  handlers.onResumeTask(taskId);
}

function getTaskProgressLabel(input: {
  resourceCount: number;
  completedCount: number;
  failedCount: number;
  activeCount: number;
}): string {
  if (input.resourceCount === 0) {
    return "未生成下载任务";
  }
  if (input.activeCount > 0) {
    return `处理中 ${input.activeCount}`;
  }
  if (input.failedCount > 0) {
    return `失败 ${input.failedCount}`;
  }
  if (input.completedCount === input.resourceCount) {
    return `已完成 ${input.completedCount}`;
  }
  return `已完成 ${input.completedCount}`;
}

function getTaskProgressTone(input: {
  resourceCount: number;
  completedCount: number;
  failedCount: number;
  activeCount: number;
}): "neutral" | "success" | "info" | "warning" {
  if (input.resourceCount === 0) {
    return "neutral";
  }
  if (input.activeCount > 0) {
    return "info";
  }
  if (input.failedCount > 0) {
    return "warning";
  }
  return input.completedCount > 0 ? "success" : "neutral";
}

function formatTaskCode(index: number): string {
  return `TASK ${String(index + 1).padStart(2, "0")}`;
}
