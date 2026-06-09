import {
  type AppSettings,
  type DetectedResource,
  type ManagedVideoItem,
  parseTaskUrlInput,
  type ServerEvent,
  type TaskDetailResponse,
  type TaskRecord
} from "@video/shared";
import type { ReactNode } from "react";
import { startTransition, useEffect, useEffectEvent, useRef, useState } from "react";

import { SettingsPanel } from "./components/settings-panel";
import { TaskComposer } from "./components/task-composer";
import { TaskDetail } from "./components/task-detail";
import { TaskTable } from "./components/task-table";
import { GlobalDownloadMonitor } from "./components/global-download-monitor";
import { Button } from "./components/ui/button";
import { Panel } from "./components/ui/panel";
import { api } from "./lib/api";

type PreviewResource = Pick<
  DetectedResource,
  "id" | "titleHint" | "url" | "outputFilePath"
>;

export function App() {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [resources, setResources] = useState<ManagedVideoItem[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [selectedTaskDetail, setSelectedTaskDetail] = useState<TaskDetailResponse | null>(null);
  const [selectedResourceIds, setSelectedResourceIds] = useState<string[]>([]);
  const [composerValue, setComposerValue] = useState("");
  const [busyIds, setBusyIds] = useState<string[]>([]);
  const [savingSettings, setSavingSettings] = useState(false);
  const [submittingTasks, setSubmittingTasks] = useState(false);
  const [connectionLabel, setConnectionLabel] = useState("connecting");
  const [previewingResource, setPreviewingResource] = useState<PreviewResource | null>(null);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [showDownloadCenter, setShowDownloadCenter] = useState(false);
  const pendingCreatedTaskUrlsRef = useRef<string[]>([]);
  const selectedTaskIdRef = useRef<string | null>(null);
  const taskDetailRequestIdRef = useRef(0);
  const taskStateEpochRef = useRef(0);
  const resourceStateEpochRef = useRef(0);

  useEffect(() => {
    selectedTaskIdRef.current = selectedTaskId;
  }, [selectedTaskId]);

  const refreshSettings = useEffectEvent(async () => {
    try {
      const response = await api.getSettings();
      startTransition(() => {
        setSettings(response.settings);
      });
    } catch {
      setConnectionLabel((current) => (current === "live" ? "degraded" : current));
    }
  });

  const refreshTasks = useEffectEvent(async () => {
    const epochAtStart = taskStateEpochRef.current;
    try {
      const response = await api.listTasks();
      if (taskStateEpochRef.current !== epochAtStart) {
        return;
      }
      startTransition(() => {
        setTasks(response.tasks);
        setSelectedTaskId((current) => {
          if (current && response.tasks.some((task) => task.id === current)) {
            return current;
          }
          return response.tasks[0]?.id ?? null;
        });
        setSelectedTaskIds((current) =>
          current.filter((taskId) => response.tasks.some((task) => task.id === taskId))
        );
      });
    } catch {
      setConnectionLabel((current) => (current === "live" ? "degraded" : current));
    }
  });

  const refreshResources = useEffectEvent(async () => {
    const epochAtStart = resourceStateEpochRef.current;
    try {
      const response = await api.listResources();
      if (resourceStateEpochRef.current !== epochAtStart) {
        return;
      }
      startTransition(() => {
        setResources(response.resources);
      });
    } catch {
      setConnectionLabel((current) => (current === "live" ? "degraded" : current));
    }
  });

  const refreshTaskDetail = useEffectEvent(async (taskId?: string | null) => {
    const nextTaskId = taskId ?? selectedTaskIdRef.current;
    if (!nextTaskId) {
      startTransition(() => {
        setSelectedTaskDetail(null);
        setSelectedResourceIds([]);
      });
      return;
    }

    const requestId = ++taskDetailRequestIdRef.current;

    try {
      const response = await api.getTask(nextTaskId);
      if (
        taskDetailRequestIdRef.current !== requestId ||
        selectedTaskIdRef.current !== nextTaskId
      ) {
        return;
      }
      mergeTask(response.task);
      startTransition(() => {
        setSelectedTaskDetail(response);
        setSelectedResourceIds((current) => {
          const available = new Set(response.resources.map((resource) => resource.id));
          const kept = current.filter((resourceId) => available.has(resourceId));
          if (kept.length > 0) {
            return kept;
          }
          return response.resources
            .filter((resource) => resource.selected)
            .map((resource) => resource.id);
        });
      });
    } catch {
      setConnectionLabel((current) => (current === "live" ? "degraded" : current));
    }
  });

  const mergeTask = useEffectEvent((task: TaskRecord) => {
    taskStateEpochRef.current += 1;
    startTransition(() => {
      setTasks((current) => {
        const index = current.findIndex((item) => item.id === task.id);
        if (index === -1) {
          return [task, ...current];
        }
        const next = [...current];
        next[index] = task;
        return next;
      });
      setResources((current) =>
        current.map((resource) =>
          resource.taskId === task.id
            ? {
                ...resource,
                taskStatus: task.status,
                taskUpdatedAt: task.updatedAt,
                taskErrorMessage: task.errorMessage ?? null
              }
            : resource
        )
      );
    });
  });

  const removeTask = useEffectEvent((taskId: string) => {
    taskStateEpochRef.current += 1;
    resourceStateEpochRef.current += 1;
    startTransition(() => {
      setTasks((current) => current.filter((task) => task.id !== taskId));
      setResources((current) => current.filter((resource) => resource.taskId !== taskId));
      setSelectedTaskId((current) => (current === taskId ? null : current));
      setSelectedTaskDetail((current) =>
        current?.task.id === taskId ? null : current
      );
      setSelectedTaskIds((current) => current.filter((id) => id !== taskId));
      setSelectedResourceIds([]);
    });
  });

  const removeResource = useEffectEvent((resourceId: string) => {
    resourceStateEpochRef.current += 1;
    startTransition(() => {
      setResources((current) => current.filter((resource) => resource.id !== resourceId));
      setSelectedTaskDetail((current) =>
        current
          ? {
              ...current,
              resources: current.resources.filter((resource) => resource.id !== resourceId)
            }
          : current
      );
      setSelectedResourceIds((current) => current.filter((item) => item !== resourceId));
    });
  });

  useEffect(() => {
    void refreshSettings();
    void refreshTasks();
    void refreshResources();
  }, []);

  useEffect(() => {
    void refreshTaskDetail(selectedTaskId);
  }, [selectedTaskId]);

  useEffect(() => {
    if (tasks.length === 0) {
      return;
    }

    const hasSelectedTask = selectedTaskId
      ? tasks.some((task) => task.id === selectedTaskId)
      : false;

    if (!hasSelectedTask) {
      setSelectedTaskId(tasks[0].id);
    }
  }, [tasks, selectedTaskId]);

  useEffect(() => {
    if (!selectedTaskId) {
      return;
    }

    const selectedTask = tasks.find((task) => task.id === selectedTaskId);
    if (!selectedTask) {
      return;
    }

    setSelectedTaskDetail((current) => {
      if (current?.task.id === selectedTask.id) {
        return current;
      }

      return {
        task: selectedTask,
        resources: [],
        logs: []
      };
    });
    setSelectedResourceIds([]);
  }, [tasks, selectedTaskId]);

  const handleServerEvent = useEffectEvent((event: ServerEvent) => {
    if (event.type === "app:ready") {
      setConnectionLabel("live");
      return;
    }

    if (event.type === "task:deleted") {
      removeTask(event.taskId);
      return;
    }

    if (event.type === "resource:deleted") {
      removeResource(event.resourceId);
      return;
    }

    if (event.type === "task:state-changed") {
      mergeTask(event.task);
      if (
        pendingCreatedTaskUrlsRef.current.includes(event.task.sourceUrl) &&
        !tasks.some((task) => task.id === event.task.id)
      ) {
        startTransition(() => {
          setSelectedTaskId(event.task.id);
          setSelectedTaskDetail({
            task: event.task,
            resources: [],
            logs: []
          });
          setSelectedResourceIds([]);
        });
        pendingCreatedTaskUrlsRef.current = pendingCreatedTaskUrlsRef.current.filter(
          (url) => url !== event.task.sourceUrl
        );
        void refreshTaskDetail(event.task.id);
        return;
      }
      if (event.task.id === selectedTaskId) {
        void refreshTaskDetail(event.task.id);
      }
      return;
    }

    if (event.type === "task:download-progress") {
      startTransition(() => {
        setResources((current) =>
          current.map((resource) =>
            resource.id === event.resourceId
              ? {
                  ...resource,
                  downloadStatus: event.downloadStatus,
                  downloadedBytes: event.downloadedBytes,
                  totalBytes: event.totalBytes,
                  speedBytesPerSecond: event.speedBytesPerSecond,
                  outputFilePath: event.outputFilePath,
                  errorMessage: event.errorMessage
                }
              : resource
          )
        );
        setSelectedTaskDetail((current) =>
          current && current.task.id === event.taskId
            ? {
                ...current,
                resources: current.resources.map((resource) =>
                  resource.id === event.resourceId
                    ? {
                        ...resource,
                        downloadStatus: event.downloadStatus,
                        downloadedBytes: event.downloadedBytes,
                        totalBytes: event.totalBytes,
                        speedBytesPerSecond: event.speedBytesPerSecond,
                        outputFilePath: event.outputFilePath,
                        errorMessage: event.errorMessage
                      }
                    : resource
                )
              }
            : current
        );
      });
      if (event.taskId === selectedTaskId) {
        void refreshTaskDetail(event.taskId);
      }
      return;
    }

    if (event.type === "task:resource-detected") {
      void refreshResources();
      if (event.taskId === selectedTaskId) {
        void refreshTaskDetail(event.taskId);
      }
      return;
    }

    if (event.type === "task:log" && event.taskId === selectedTaskId) {
      void refreshTaskDetail(event.taskId);
    }
  });

  useEffect(() => {
    const source = api.createEventSource();
    const onReady = (rawEvent: MessageEvent<string>) => {
      handleServerEvent(JSON.parse(rawEvent.data) as ServerEvent);
    };
    const onTaskStateChanged = (rawEvent: MessageEvent<string>) => {
      handleServerEvent(JSON.parse(rawEvent.data) as ServerEvent);
    };
    const onTaskResource = (rawEvent: MessageEvent<string>) => {
      handleServerEvent(JSON.parse(rawEvent.data) as ServerEvent);
    };
    const onTaskLog = (rawEvent: MessageEvent<string>) => {
      handleServerEvent(JSON.parse(rawEvent.data) as ServerEvent);
    };
    const onTaskDeleted = (rawEvent: MessageEvent<string>) => {
      handleServerEvent(JSON.parse(rawEvent.data) as ServerEvent);
    };
    const onTaskDownloadProgress = (rawEvent: MessageEvent<string>) => {
      handleServerEvent(JSON.parse(rawEvent.data) as ServerEvent);
    };
    const onResourceDeleted = (rawEvent: MessageEvent<string>) => {
      handleServerEvent(JSON.parse(rawEvent.data) as ServerEvent);
    };

    source.addEventListener("app:ready", onReady as EventListener);
    source.addEventListener("task:state-changed", onTaskStateChanged as EventListener);
    source.addEventListener("task:resource-detected", onTaskResource as EventListener);
    source.addEventListener("task:log", onTaskLog as EventListener);
    source.addEventListener("task:deleted", onTaskDeleted as EventListener);
    source.addEventListener(
      "task:download-progress",
      onTaskDownloadProgress as EventListener
    );
    source.addEventListener("resource:deleted", onResourceDeleted as EventListener);
    source.onerror = () => setConnectionLabel("reconnecting");

    return () => {
      source.removeEventListener("app:ready", onReady as EventListener);
      source.removeEventListener("task:state-changed", onTaskStateChanged as EventListener);
      source.removeEventListener("task:resource-detected", onTaskResource as EventListener);
      source.removeEventListener("task:log", onTaskLog as EventListener);
      source.removeEventListener("task:deleted", onTaskDeleted as EventListener);
      source.removeEventListener(
        "task:download-progress",
        onTaskDownloadProgress as EventListener
      );
      source.removeEventListener("resource:deleted", onResourceDeleted as EventListener);
      source.close();
    };
  }, []);

  async function handleSubmitTasks() {
    const urls = parseTaskUrlInput(composerValue);
    if (urls.length === 0) {
      return;
    }

    pendingCreatedTaskUrlsRef.current = urls;
    taskStateEpochRef.current += 1;
    setSubmittingTasks(true);
    try {
      const response = await api.createTasks(urls);
      startTransition(() => {
        setComposerValue("");
        setTasks((current) => mergeTaskRecords(response.tasks, current));
        setSelectedTaskId(response.tasks[0]?.id ?? null);
        setSelectedTaskDetail(
          response.tasks[0]
            ? {
                task: response.tasks[0],
                resources: [],
                logs: []
              }
            : null
        );
        setSelectedResourceIds([]);
      });
      pendingCreatedTaskUrlsRef.current = [];
      await refreshTaskDetail(response.tasks[0]?.id ?? null);
      await refreshResources();
    } finally {
      pendingCreatedTaskUrlsRef.current = [];
      setSubmittingTasks(false);
    }
  }

  async function runTaskAction(id: string, action: () => Promise<void>) {
    taskStateEpochRef.current += 1;
    resourceStateEpochRef.current += 1;
    setBusyIds((current) => [...current, id]);
    try {
      await action();
      await refreshTasks();
      await refreshResources();
      await refreshTaskDetail();
    } finally {
      setBusyIds((current) => current.filter((item) => item !== id));
    }
  }

  async function handleSaveSettings(nextSettings: AppSettings) {
    setSavingSettings(true);
    try {
      const response = await api.saveSettings(nextSettings);
      setSettings(response.settings);
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleDeleteSelectedTasks() {
    const taskIds = selectedTaskIds;
    if (taskIds.length === 0) {
      return;
    }

    setBusyIds((current) => [...current, ...taskIds]);
    try {
      for (const taskId of taskIds) {
        await api.deleteTask(taskId);
      }
      await refreshTasks();
      await refreshResources();
      await refreshTaskDetail();
      startTransition(() => {
        setSelectedTaskIds([]);
      });
    } finally {
      setBusyIds((current) => current.filter((item) => !taskIds.includes(item)));
    }
  }

  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;
  const activeDownloadCount = resources.filter((resource) =>
    ["downloading", "merging", "remuxing"].includes(resource.downloadStatus)
  ).length;
  const completedDownloadCount = resources.filter(
    (resource) => resource.downloadStatus === "completed"
  ).length;

  return (
    <>
      <main className="min-h-screen bg-transparent px-4 py-5 text-stone-900 md:px-6 xl:px-8">
        <div className="mx-auto max-w-[1680px] space-y-4">
          <Panel className="ui-hero-panel overflow-hidden border-[rgba(23,23,23,0.08)] px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1 space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-stone-600">
                    51cg Video Console
                  </p>
                  <span className="inline-flex items-center rounded-full border border-stone-200 bg-white/80 px-3 py-1 text-[11px] font-medium text-stone-600">
                    URL {"->"} 页面任务 {"->"} 资源任务
                  </span>
                </div>
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div className="min-w-0">
                    <h1 className="font-display text-[1.95rem] font-semibold tracking-tight text-[color:var(--ink-strong)] md:text-[2.25rem]">
                      视频抓取工作台
                    </h1>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      onClick={() => setShowDownloadCenter(true)}
                      type="button"
                      variant="secondary"
                    >
                      下载中心
                    </Button>
                    <Button
                      onClick={() => setShowSettingsPanel(true)}
                      type="button"
                      variant="ghost"
                    >
                      运行设置
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 border-t border-[rgba(23,23,23,0.08)] pt-3">
                  <CompactMetric label="页面任务" value={String(tasks.length)} />
                  <CompactMetric label="处理中" value={String(activeDownloadCount)} />
                  <CompactMetric label="已完成" value={String(completedDownloadCount)} />
                  <CompactMetric label="SSE" value={connectionLabel} />
                </div>
              </div>
            </div>
            <div className="mt-4 border-t border-[rgba(23,23,23,0.08)] pt-4">
              <TaskComposer
                busy={submittingTasks}
                onChange={setComposerValue}
                onSubmit={() => void handleSubmitTasks()}
                value={composerValue}
              />
            </div>
          </Panel>

          <div className="grid gap-4 xl:grid-cols-[390px_minmax(0,1fr)] xl:items-start">
            <div className="min-w-0 xl:sticky xl:top-5 xl:self-start">
              <TaskTable
                busyTaskIds={new Set(busyIds)}
                onDeleteSelected={() => {
                  void handleDeleteSelectedTasks();
                }}
                onDeleteTask={(taskId) => {
                  void runTaskAction(taskId, async () => {
                    await api.deleteTask(taskId);
                  });
                }}
                onOpenTaskBrowser={(taskId) => {
                  void runTaskAction(taskId, async () => {
                    await api.openTaskBrowser(taskId);
                  });
                }}
                onResumeTask={(taskId) => {
                  void runTaskAction(taskId, async () => {
                    await api.resumeTaskDetection(taskId);
                  });
                }}
                onRetryTask={(taskId) => {
                  void runTaskAction(taskId, async () => {
                    await api.retryTask(taskId);
                  });
                }}
                onSelect={setSelectedTaskId}
                onToggleAll={() => {
                  setSelectedTaskIds((current) =>
                    current.length === tasks.length ? [] : tasks.map((task) => task.id)
                  );
                }}
                onToggleTask={(taskId) => {
                  setSelectedTaskIds((current) =>
                    current.includes(taskId)
                      ? current.filter((item) => item !== taskId)
                      : [...current, taskId]
                  );
                }}
                resources={resources}
                selectedTaskId={selectedTaskId}
                selectedTaskIds={new Set(selectedTaskIds)}
                tasks={tasks}
              />
            </div>

            <div className="min-w-0">
              <TaskDetail
                busy={selectedTask ? busyIds.includes(selectedTask.id) : false}
                detail={selectedTaskDetail}
                onDownloadSelected={() => {
                  if (!selectedTask || selectedResourceIds.length === 0) {
                    return;
                  }
                  void runTaskAction(selectedTask.id, async () => {
                    await api.downloadTask(selectedTask.id, {
                      resourceIds: selectedResourceIds
                    });
                  });
                }}
                onPreviewDownload={(resource) => {
                  setPreviewingResource({
                    id: resource.id,
                    titleHint: resource.titleHint,
                    url: resource.url,
                    outputFilePath: resource.outputFilePath
                  });
                }}
                onRevealDownload={(resource) => {
                  void api.revealDownloadedFile(resource.id);
                }}
                onRetryDownload={(resource) => {
                  void runTaskAction(resource.taskId, async () => {
                    await api.downloadResource(resource.id);
                  });
                }}
                onToggleResource={(resourceId) => {
                  setSelectedResourceIds((current) =>
                    current.includes(resourceId)
                      ? current.filter((item) => item !== resourceId)
                      : [...current, resourceId]
                  );
                }}
                selectedResourceIds={selectedResourceIds}
                task={selectedTask}
              />
            </div>
          </div>
        </div>
      </main>

      {showSettingsPanel ? (
        <OverlayPanel
          description="这里保留低频配置，避免和首页主操作抢注意力。"
          title="运行设置"
          onClose={() => setShowSettingsPanel(false)}
        >
          <SettingsPanel
            busy={savingSettings}
            onSave={(nextSettings) => void handleSaveSettings(nextSettings)}
            settings={settings}
          />
        </OverlayPanel>
      ) : null}

      {showDownloadCenter ? (
        <OverlayPanel
          description="这里只看全局下载进度，不打断首页的页面任务处理。"
          title="下载中心"
          onClose={() => setShowDownloadCenter(false)}
          wide
        >
          <GlobalDownloadMonitor
            busyIds={new Set(busyIds)}
            onFocusTask={(taskId) => {
              setSelectedTaskId(taskId);
              setShowDownloadCenter(false);
            }}
            onPreviewDownload={(resource) => {
              setPreviewingResource({
                id: resource.id,
                titleHint: resource.titleHint,
                url: resource.url,
                outputFilePath: resource.outputFilePath
              });
            }}
            onRevealDownload={(resource) => {
              void api.revealDownloadedFile(resource.id);
            }}
            onRetryDownload={(resource) => {
              void runTaskAction(resource.taskId, async () => {
                await api.downloadResource(resource.id);
              });
            }}
            resources={resources}
          />
        </OverlayPanel>
      ) : null}

      {previewingResource ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/55 px-4 py-6">
          <div className="w-full max-w-4xl rounded-[1.6rem] border border-[rgba(82,63,43,0.16)] bg-[linear-gradient(180deg,rgba(255,251,245,0.98),rgba(240,232,220,0.95))] p-5 shadow-[0_30px_90px_rgba(28,25,23,0.28)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="font-display text-2xl font-semibold text-[color:var(--ink-strong)]">
                  查看下载内容
                </p>
                <p className="mt-1 text-sm text-[color:var(--ink-body)]">
                  {previewingResource.titleHint || previewingResource.url}
                </p>
                <p className="mt-1 break-all text-xs text-[color:var(--ink-soft)]">
                  {previewingResource.outputFilePath}
                </p>
              </div>
              <Button onClick={() => setPreviewingResource(null)}>关闭</Button>
            </div>

            <div className="mt-5 overflow-hidden rounded-[1.5rem] border border-stone-200 bg-stone-950">
              <video
                className="max-h-[72vh] w-full bg-black"
                controls
                preload="metadata"
                src={api.getResourceContentUrl(previewingResource.id)}
              >
                你的浏览器暂不支持直接预览该下载内容。
              </video>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function mergeTaskRecords(primary: TaskRecord[], secondary: TaskRecord[]): TaskRecord[] {
  const merged = new Map<string, TaskRecord>();

  for (const task of primary) {
    merged.set(task.id, task);
  }

  for (const task of secondary) {
    if (!merged.has(task.id)) {
      merged.set(task.id, task);
    }
  }

  return [...merged.values()];
}

function CompactMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(23,23,23,0.08)] bg-white/72 px-3 py-1.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-stone-500">
        {label}
      </span>
      <span className="line-clamp-1 font-display text-base font-semibold text-stone-900">
        {value}
      </span>
    </div>
  );
}

function OverlayPanel({
  title,
  description,
  wide = false,
  onClose,
  children
}: {
  title: string;
  description: string;
  wide?: boolean;
  onClose(): void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-stone-950/45 px-4 py-6">
      <div
        className={`w-full rounded-[1.6rem] border border-[rgba(82,63,43,0.16)] bg-[linear-gradient(180deg,rgba(255,251,245,0.98),rgba(240,232,220,0.95))] p-5 shadow-[0_30px_90px_rgba(28,25,23,0.28)] ${
          wide ? "max-w-6xl" : "max-w-4xl"
        }`}
      >
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="font-display text-2xl font-semibold text-[color:var(--ink-strong)]">
              {title}
            </p>
            <p className="mt-1 text-sm text-[color:var(--ink-body)]">{description}</p>
          </div>
          <Button onClick={onClose}>关闭</Button>
        </div>
        <div className="max-h-[80vh] overflow-y-auto pr-1">{children}</div>
      </div>
    </div>
  );
}
