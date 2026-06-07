import {
  type AppSettings,
  type DetectedResource,
  type ManagedVideoItem,
  parseTaskUrlInput,
  type ServerEvent,
  type TaskDetailResponse,
  type TaskRecord
} from "@video/shared";
import { startTransition, useEffect, useEffectEvent, useState } from "react";

import { ResourceSummaryStrip } from "./components/resource-summary-strip";
import { SettingsPanel } from "./components/settings-panel";
import { TaskComposer } from "./components/task-composer";
import { TaskDetail } from "./components/task-detail";
import { TaskTable } from "./components/task-table";
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
    try {
      const response = await api.listTasks();
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
    try {
      const response = await api.listResources();
      startTransition(() => {
        setResources(response.resources);
      });
    } catch {
      setConnectionLabel((current) => (current === "live" ? "degraded" : current));
    }
  });

  const refreshTaskDetail = useEffectEvent(async (taskId?: string | null) => {
    const nextTaskId = taskId ?? selectedTaskId;
    if (!nextTaskId) {
      startTransition(() => {
        setSelectedTaskDetail(null);
        setSelectedResourceIds([]);
      });
      return;
    }

    try {
      const response = await api.getTask(nextTaskId);
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
      if (event.task.id === selectedTaskId) {
        void refreshTaskDetail(event.task.id);
      }
      return;
    }

    if (event.type === "task:download-progress") {
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

    setSubmittingTasks(true);
    try {
      const response = await api.createTasks(urls);
      startTransition(() => {
        setComposerValue("");
        setTasks((current) => [...response.tasks, ...current]);
        setSelectedTaskId(response.tasks[0]?.id ?? null);
      });
      await refreshResources();
    } finally {
      setSubmittingTasks(false);
    }
  }

  async function runTaskAction(id: string, action: () => Promise<void>) {
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

  return (
    <>
      <main className="min-h-screen bg-transparent px-4 py-5 text-stone-900 md:px-6 xl:px-8">
        <div className="mx-auto max-w-[1680px] space-y-4">
          <Panel className="ui-hero-panel overflow-hidden border-[rgba(23,23,23,0.08)] px-5 py-5">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div className="max-w-4xl space-y-2">
                <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-stone-600">
                  51cg Video Console
                </p>
                <h1 className="font-display text-[2.15rem] font-semibold tracking-tight text-[color:var(--ink-strong)] md:text-[2.6rem]">
                  视频抓取工作台
                </h1>
                <p className="max-w-3xl text-sm leading-7 text-[color:var(--ink-body)] md:text-[15px]">
                  按真实流程工作：先创建页面任务，再筛选识别出的资源，最后生成和查看下载任务。
                </p>
              </div>

              <div className="ui-panel-muted min-w-[132px] rounded-[1rem] px-4 py-3">
                <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-stone-600">
                  SSE 状态
                </p>
                <p className="mt-1.5 font-display text-2xl font-semibold text-[color:var(--ink-strong)]">
                  {connectionLabel}
                </p>
              </div>
            </div>
          </Panel>

          <ResourceSummaryStrip resources={resources} />

          <div className="grid gap-4 xl:grid-cols-[320px_420px_minmax(0,1fr)] xl:items-start">
            <div className="space-y-4 xl:sticky xl:top-5 xl:self-start">
              <Panel>
                <TaskComposer
                  busy={submittingTasks}
                  onChange={setComposerValue}
                  onSubmit={() => void handleSubmitTasks()}
                  value={composerValue}
                />
              </Panel>

              <SettingsPanel
                busy={savingSettings}
                onSave={(nextSettings) => void handleSaveSettings(nextSettings)}
                settings={settings}
              />
            </div>

            <div className="min-w-0 space-y-4">
              <TaskTable
                onDeleteSelected={() => {
                  void handleDeleteSelectedTasks();
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
                onDelete={() => {
                  if (!selectedTask) return;
                  void runTaskAction(selectedTask.id, async () => {
                    await api.deleteTask(selectedTask.id);
                  });
                }}
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
                onOpenBrowser={() => {
                  if (!selectedTask) return;
                  void runTaskAction(selectedTask.id, async () => {
                    await api.openTaskBrowser(selectedTask.id);
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
                onResume={() => {
                  if (!selectedTask) return;
                  void runTaskAction(selectedTask.id, async () => {
                    await api.resumeTaskDetection(selectedTask.id);
                  });
                }}
                onRetry={() => {
                  if (!selectedTask) return;
                  void runTaskAction(selectedTask.id, async () => {
                    await api.retryTask(selectedTask.id);
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
