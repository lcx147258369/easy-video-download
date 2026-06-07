import type { DetectedResource } from "./resource.js";
import type { TaskRecord, TaskStatus } from "./task.js";

export interface TaskStateChangedEvent {
  type: "task:state-changed";
  task: TaskRecord;
  previousStatus: TaskStatus;
}

export interface TaskResourceDetectedEvent {
  type: "task:resource-detected";
  taskId: string;
  resource: DetectedResource;
}

export interface TaskDownloadProgressEvent {
  type: "task:download-progress";
  taskId: string;
  resourceId: string;
  downloadStatus: DetectedResource["downloadStatus"];
  downloadedBytes: number;
  totalBytes: number | null;
  speedBytesPerSecond: number | null;
  outputFilePath: string | null;
  errorMessage: string | null;
}

export interface TaskLogEvent {
  type: "task:log";
  taskId: string;
  level: "info" | "warn" | "error";
  message: string;
}

export interface AppReadyEvent {
  type: "app:ready";
  ts: string;
}

export interface TaskDeletedEvent {
  type: "task:deleted";
  taskId: string;
}

export interface ResourceDeletedEvent {
  type: "resource:deleted";
  resourceId: string;
  taskId: string;
}

export type ServerEvent =
  | AppReadyEvent
  | ResourceDeletedEvent
  | TaskDeletedEvent
  | TaskStateChangedEvent
  | TaskResourceDetectedEvent
  | TaskDownloadProgressEvent
  | TaskLogEvent;
