import { getTaskStatusLabel, type ManagedVideoItem, type TaskRecord } from "@video/shared";

import { Button } from "./ui/button";
import { cn } from "./ui/cn";
import { Panel } from "./ui/panel";
import { StatusBadge } from "./ui/status-badge";

export function TaskTable({
  tasks,
  selectedTaskId,
  resources,
  selectedTaskIds,
  onSelect,
  onToggleTask,
  onToggleAll,
  onDeleteSelected
}: {
  tasks: TaskRecord[];
  selectedTaskId: string | null;
  resources: ManagedVideoItem[];
  selectedTaskIds: Set<string>;
  onSelect(taskId: string): void;
  onToggleTask(taskId: string): void;
  onToggleAll(): void;
  onDeleteSelected(): void;
}) {
  const allSelected = tasks.length > 0 && tasks.every((task) => selectedTaskIds.has(task.id));
  const selectedCount = tasks.filter((task) => selectedTaskIds.has(task.id)).length;

  return (
    <Panel className="overflow-hidden p-0">
      <header className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
        <div>
          <p className="font-display text-xl font-semibold text-stone-900">页面任务</p>
          <p className="mt-1 text-sm text-stone-700">
            这里只保留页面任务概览。点选一项后，右侧显示该页面下的下载资源子任务。
          </p>
        </div>
        <span className="font-mono text-xs uppercase tracking-[0.22em] text-stone-600">
          {tasks.length} task(s)
        </span>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 px-5 py-3">
        <label className="inline-flex items-center gap-2 text-sm text-stone-700">
          <input
            checked={allSelected}
            className="h-4 w-4 rounded border-stone-300 bg-white"
            onChange={onToggleAll}
            style={{ accentColor: "var(--accent-strong)" }}
            type="checkbox"
          />
          全选页面任务
        </label>

        <div className="flex items-center gap-3">
          <span className="text-xs text-stone-500">已选 {selectedCount} 项</span>
          <Button
            disabled={selectedCount === 0}
            onClick={onDeleteSelected}
            type="button"
            variant="danger"
          >
            删除已选
          </Button>
        </div>
      </div>

      <div className="max-h-[36rem] overflow-y-auto overflow-x-hidden xl:max-h-[calc(100vh-12.5rem)]">
        {tasks.length === 0 ? (
          <div className="px-5 py-10 text-sm text-stone-700">
            还没有页面任务。先在左侧输入 URL 创建第一批任务。
          </div>
        ) : (
          <ul className="space-y-3 px-3 py-3">
            {tasks.map((task) => {
              const taskResources = resources.filter((resource) => resource.taskId === task.id);
              const completedCount = taskResources.filter(
                (resource) => resource.downloadStatus === "completed"
              ).length;
              const downloadingCount = taskResources.filter(
                (resource) => resource.downloadStatus === "downloading"
              ).length;
              const title = task.title?.trim();
              const showSourceUrl = !title || title === task.sourceUrl;

              return (
                <li
                  key={task.id}
                  className={cn(
                    "relative overflow-hidden rounded-[1.35rem] border px-4 py-4 transition",
                    selectedTaskId === task.id
                      ? "ui-panel border-[rgba(23,23,23,0.12)] shadow-[0_14px_28px_rgba(15,23,42,0.06)] ring-1 ring-[rgba(23,23,23,0.05)]"
                      : "ui-panel-muted border-[rgba(23,23,23,0.08)] shadow-[0_8px_18px_rgba(15,23,42,0.025)] hover:border-[rgba(23,23,23,0.12)]"
                  )}
                >
                  {selectedTaskId === task.id ? (
                    <span className="absolute inset-y-4 left-0 w-[3px] rounded-r-full bg-stone-900/75" />
                  ) : null}

                  <div className="flex items-start gap-3">
                    <input
                      checked={selectedTaskIds.has(task.id)}
                      className="mt-1 h-4 w-4 shrink-0 rounded border-stone-300 bg-white"
                      onChange={() => onToggleTask(task.id)}
                      onClick={(event) => event.stopPropagation()}
                      style={{ accentColor: "var(--accent-strong)" }}
                      type="checkbox"
                    />

                    <button
                      className="grid w-full gap-3 text-left"
                      onClick={() => onSelect(task.id)}
                      type="button"
                    >
                      <div className="flex flex-wrap items-center gap-2.5">
                        <StatusBadge
                          status={task.status}
                          label={getTaskStatusLabel(task.status)}
                        />
                        <span className="font-mono text-xs uppercase tracking-[0.18em] text-stone-600">
                          {task.siteHost}
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        <p className="break-all text-[15px] font-semibold leading-6 text-stone-900 [overflow-wrap:anywhere]">
                          {title || task.sourceUrl}
                        </p>
                        {showSourceUrl ? null : (
                          <p className="break-all text-xs leading-5 text-stone-500 [overflow-wrap:anywhere]">
                            {task.sourceUrl}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] text-stone-600">
                        <InlineMeta tone="neutral" label={`资源 ${taskResources.length}`} />
                        <InlineMeta tone="success" label={`已完成 ${completedCount}`} />
                        {downloadingCount > 0 ? (
                          <InlineMeta tone="info" label={`下载中 ${downloadingCount}`} />
                        ) : null}
                        <InlineMeta
                          tone="muted"
                          label={`更新于 ${formatTime(task.updatedAt)}`}
                        />
                      </div>

                      {task.errorMessage ? (
                        <p className="text-xs text-red-700">{task.errorMessage}</p>
                      ) : null}
                    </button>
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
  tone
}: {
  label: string;
  tone: "neutral" | "success" | "info" | "muted";
}) {
  const toneClasses = {
    neutral: { dot: "bg-zinc-400", text: "text-zinc-600" },
    success: { dot: "bg-emerald-500", text: "text-emerald-700" },
    info: { dot: "bg-sky-500", text: "text-sky-700" },
    muted: { dot: "bg-stone-300", text: "text-stone-500" }
  } as const;

  const currentTone = toneClasses[tone];

  return (
    <span className={`inline-flex items-center gap-2 font-medium ${currentTone.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${currentTone.dot}`} />
      {label}
    </span>
  );
}
