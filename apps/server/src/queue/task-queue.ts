import {
  getResourceDownloadStatusLabel,
  type AppSettings,
  type DetectedResource,
  type ResourceDownloadStatus,
  type TaskRecord,
  type TaskStatus,
  type ServerEvent
} from "@video/shared";

import type { AppStore } from "../persistence/app-store.js";
import type { DownloadResult } from "../downloads/download-manager.js";

export interface BrowserSessionLike {
  page: unknown;
  close(): Promise<void>;
  profileDirectory?: string;
}

export interface BrowserManagerLike {
  openSession(options: { siteHost: string; url?: string }): Promise<BrowserSessionLike>;
}

export interface DetectionResult {
  status: "detected" | "failed" | "needs_login";
  resources: DetectedResource[];
  message?: string;
}

export interface TaskQueueDependencies {
  store: AppStore;
  browserManager: BrowserManagerLike;
  detectResources: (context: {
    task: TaskRecord;
    page: unknown;
  }) => Promise<DetectionResult>;
  downloadResource: (
    resource: DetectedResource,
    options?: {
      onProgress?(progress: {
        downloadedBytes: number;
        totalBytes: number | null;
        speedBytesPerSecond: number | null;
      }): void;
      onStatusChange?(snapshot: {
        status: ActiveDownloadStatus;
        outputFilePath: string | null;
      }): void;
    }
  ) => Promise<DownloadResult>;
  autoDownload?: boolean | (() => boolean);
  settings?: Pick<AppSettings, "maxConcurrentDownloads">;
  publishEvent?: (event: ServerEvent) => void;
}

type ActiveDownloadStatus = Exclude<
  ResourceDownloadStatus,
  "idle" | "completed" | "failed"
>;

export interface TaskQueue {
  submit(urls: string[]): Promise<TaskRecord[]>;
  retry(taskId: string): Promise<TaskRecord>;
  downloadTask(taskId: string, resourceIds?: string[]): Promise<TaskRecord>;
  deleteTask(taskId: string): Promise<void>;
}

export function createTaskQueue(dependencies: TaskQueueDependencies): TaskQueue {
  return {
    async submit(urls) {
      const tasks = dependencies.store.createTasks(urls);
      for (const task of tasks) {
        await processTask(dependencies, task);
      }
      return tasks.map((task) => dependencies.store.getTaskDetail(task.id).task);
    },
    async retry(taskId) {
      const current = dependencies.store.getTaskDetail(taskId).task;
      dependencies.store.updateTaskStatus(taskId, "pending");
      await processTask(dependencies, current);
      return dependencies.store.getTaskDetail(taskId).task;
    },
    async downloadTask(taskId, resourceIds) {
      await downloadSelectedResources(dependencies, taskId, resourceIds);
      return dependencies.store.getTaskDetail(taskId).task;
    },
    async deleteTask(taskId) {
      dependencies.store.deleteTask(taskId);
      dependencies.publishEvent?.({
        type: "task:deleted",
        taskId
      });
    }
  };
}

async function processTask(
  dependencies: TaskQueueDependencies,
  task: TaskRecord
): Promise<TaskRecord> {
  let session: BrowserSessionLike | null = null;

  try {
    transitionTaskStatus(dependencies, task.id, "running");
    emitTaskLog(dependencies, task.id, "info", "task started");

    session = await dependencies.browserManager.openSession({
      siteHost: task.siteHost
    });

    const detection = await dependencies.detectResources({
      task: dependencies.store.getTaskDetail(task.id).task,
      page: session.page
    });

    if (detection.status === "needs_login") {
      transitionTaskStatus(dependencies, task.id, "needs_login", detection.message ?? null);
      emitTaskLog(
        dependencies,
        task.id,
        "warn",
        detection.message ?? "task requires login"
      );
      return dependencies.store.getTaskDetail(task.id).task;
    }

    if (detection.status === "failed") {
      transitionTaskStatus(dependencies, task.id, "failed", detection.message ?? null);
      emitTaskLog(
        dependencies,
        task.id,
        "error",
        detection.message ?? "task detection failed"
      );
      return dependencies.store.getTaskDetail(task.id).task;
    }

    const manageableResources = detection.resources.filter(isQueueableResource);
    dependencies.store.clearTaskResources(task.id);

    if (manageableResources.length === 0) {
      const message =
        detection.resources.length > 0
          ? "detected resources are not supported for download"
          : detection.message ?? "no video resources detected";
      transitionTaskStatus(dependencies, task.id, "failed", message);
      emitTaskLog(dependencies, task.id, "error", message);
      return dependencies.store.getTaskDetail(task.id).task;
    }

    const storedResources = manageableResources.map((resource) =>
      dependencies.store.addResource(task.id, {
        url: resource.url,
        format: resource.format,
        mimeType: resource.mimeType,
        referer: resource.referer || task.sourceUrl,
        userAgent: resource.userAgent,
        cookie: resource.cookie,
        headers: resource.headers,
        titleHint: resource.titleHint,
        sizeHint: resource.sizeHint,
        selected: isAutoDownloadEnabled(dependencies) ? true : resource.selected
      })
    );

    transitionTaskStatus(dependencies, task.id, "detected");
    emitTaskLog(dependencies, task.id, "info", `${storedResources.length} resource(s) detected`);
    for (const resource of storedResources) {
      dependencies.publishEvent?.({
        type: "task:resource-detected",
        taskId: task.id,
        resource
      });
    }

    if (!isAutoDownloadEnabled(dependencies)) {
      return dependencies.store.getTaskDetail(task.id).task;
    }

    const selectedResources = storedResources.filter((resource) => resource.selected);
    if (selectedResources.length === 0) {
      transitionTaskStatus(dependencies, task.id, "detected");
      return dependencies.store.getTaskDetail(task.id).task;
    }

    await closeSession(session);
    session = null;
    await downloadSelectedResources(dependencies, task.id);
  } catch (error) {
    transitionTaskStatus(
      dependencies,
      task.id,
      "failed",
      error instanceof Error ? error.message : "unknown failure"
    );
    emitTaskLog(
      dependencies,
      task.id,
      "error",
      error instanceof Error ? error.message : "unknown failure"
    );
  } finally {
    await closeSession(session);
  }

  return dependencies.store.getTaskDetail(task.id).task;
}

async function closeSession(session: BrowserSessionLike | null): Promise<void> {
  await session?.close().catch(() => undefined);
}

function isAutoDownloadEnabled(dependencies: TaskQueueDependencies): boolean {
  return typeof dependencies.autoDownload === "function"
    ? dependencies.autoDownload()
    : Boolean(dependencies.autoDownload);
}

async function downloadSelectedResources(
  dependencies: TaskQueueDependencies,
  taskId: string,
  resourceIds?: string[]
): Promise<void> {
  const detail = dependencies.store.getTaskDetail(taskId);
  const candidateResources =
    resourceIds && resourceIds.length > 0
      ? detail.resources.filter((resource) => resourceIds.includes(resource.id))
      : detail.resources.filter((resource) => resource.selected);
  const resourcesToDownload =
    candidateResources.length > 0
      ? candidateResources
      : !resourceIds || resourceIds.length === 0
        ? detail.resources
        : [];

  if (resourcesToDownload.length === 0) {
    transitionTaskStatus(dependencies, taskId, "detected");
    return;
  }

  transitionTaskStatus(dependencies, taskId, "downloading");

  const failures: string[] = [];
  for (const resource of resourcesToDownload) {
    emitTaskLog(
      dependencies,
      taskId,
      "info",
      `${describeResource(resource)}：开始下载`
    );

    let currentResource: DetectedResource = {
      ...resource,
      downloadStatus: "downloading",
      downloadedBytes: 0,
      totalBytes: resource.totalBytes,
      speedBytesPerSecond: null,
      outputFilePath: null,
      errorMessage: null
    };
    let lastLoggedStatus: ActiveDownloadStatus | null = "downloading";
    emitResourceProgress(dependencies, currentResource);

    try {
      const result = await dependencies.downloadResource(resource, {
        onStatusChange(snapshot) {
          if (snapshot.status !== lastLoggedStatus) {
            emitTaskLog(
              dependencies,
              taskId,
              "info",
              buildStageLogMessage(resource, snapshot.status)
            );
            lastLoggedStatus = snapshot.status;
          }
          currentResource = {
            ...currentResource,
            downloadStatus: snapshot.status,
            downloadedBytes: currentResource.downloadedBytes,
            totalBytes: currentResource.totalBytes,
            speedBytesPerSecond: null,
            outputFilePath: snapshot.outputFilePath,
            errorMessage: null
          };
          emitResourceProgress(dependencies, currentResource);
        },
        onProgress(progress) {
          currentResource = {
            ...currentResource,
            downloadStatus: "downloading",
            downloadedBytes: progress.downloadedBytes,
            totalBytes: progress.totalBytes,
            speedBytesPerSecond: progress.speedBytesPerSecond,
            outputFilePath: currentResource.outputFilePath,
            errorMessage: null
          };
          emitResourceProgress(dependencies, currentResource);
        }
      });

      currentResource = {
        ...currentResource,
        downloadStatus: "completed",
        downloadedBytes: result.downloadedBytes,
        totalBytes: result.totalBytes,
        speedBytesPerSecond: null,
        outputFilePath: result.filePath,
        errorMessage: null
      };
      emitResourceProgress(dependencies, currentResource);
      emitTaskLog(
        dependencies,
        taskId,
        "info",
        `${describeResource(resource)}：下载完成`
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "unknown download failure";
      failures.push(message);
      currentResource = {
        ...currentResource,
        downloadStatus: "failed",
        downloadedBytes: currentResource.downloadedBytes,
        totalBytes: currentResource.totalBytes,
        speedBytesPerSecond: null,
        outputFilePath: currentResource.outputFilePath,
        errorMessage: message
      };
      emitResourceProgress(dependencies, currentResource);
      emitTaskLog(
        dependencies,
        taskId,
        "error",
        `${describeResource(resource)}：下载失败 - ${message}`
      );
    }
  }

  if (failures.length > 0) {
    transitionTaskStatus(dependencies, taskId, "failed", failures[0]);
    emitTaskLog(dependencies, taskId, "error", failures[0]);
    return;
  }

  transitionTaskStatus(dependencies, taskId, "completed");
  emitTaskLog(dependencies, taskId, "info", "task completed");
}

function transitionTaskStatus(
  dependencies: TaskQueueDependencies,
  taskId: string,
  status: TaskStatus,
  errorMessage?: string | null
): TaskRecord {
  const previous = dependencies.store.getTaskDetail(taskId).task;
  const updated = dependencies.store.updateTaskStatus(taskId, status, errorMessage ?? null);
  dependencies.publishEvent?.({
    type: "task:state-changed",
    task: updated,
    previousStatus: previous.status
  });
  return updated;
}

function emitTaskLog(
  dependencies: TaskQueueDependencies,
  taskId: string,
  level: "info" | "warn" | "error",
  message: string
): void {
  const log = dependencies.store.addTaskLog(taskId, level, message);
  dependencies.publishEvent?.({
    type: "task:log",
    taskId,
    level: log.level,
    message: log.message
  });
}

function emitResourceProgress(
  dependencies: TaskQueueDependencies,
  resource: Pick<
    DetectedResource,
    | "id"
    | "taskId"
    | "downloadStatus"
    | "downloadedBytes"
    | "totalBytes"
    | "speedBytesPerSecond"
    | "outputFilePath"
    | "errorMessage"
  >
): void {
  const updated = dependencies.store.updateResourceDownloadState(resource.id, {
    downloadStatus: resource.downloadStatus,
    downloadedBytes: resource.downloadedBytes,
    totalBytes: resource.totalBytes,
    speedBytesPerSecond: resource.speedBytesPerSecond,
    outputFilePath: resource.outputFilePath,
    errorMessage: resource.errorMessage
  });

  dependencies.publishEvent?.({
    type: "task:download-progress",
    taskId: updated.taskId,
    resourceId: updated.id,
    downloadStatus: updated.downloadStatus,
    downloadedBytes: updated.downloadedBytes,
    totalBytes: updated.totalBytes,
    speedBytesPerSecond: updated.speedBytesPerSecond,
    outputFilePath: updated.outputFilePath,
    errorMessage: updated.errorMessage
  });
}

function isQueueableResource(resource: DetectedResource): boolean {
  if (resource.url.startsWith("blob:")) {
    return false;
  }

  if (resource.format === "unknown") {
    return /^https?:\/\//i.test(resource.url);
  }

  return true;
}

function buildStageLogMessage(
  resource: Pick<DetectedResource, "format" | "titleHint" | "url">,
  status: ActiveDownloadStatus
): string {
  if (status === "merging") {
    return `${describeResource(resource)}：开始合并 m3u8 分片`;
  }
  if (status === "remuxing") {
    return `${describeResource(resource)}：开始转 MP4`;
  }
  return `${describeResource(resource)}：${getResourceDownloadStatusLabel(status)}`;
}

function describeResource(
  resource: Pick<DetectedResource, "titleHint" | "url">
): string {
  return resource.titleHint?.trim() || resource.url;
}
