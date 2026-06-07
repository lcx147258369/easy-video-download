import type { AppSettings } from "./settings.js";
import type { DetectedResource, ManagedVideoItem } from "./resource.js";
import type { TaskLogEntry, TaskRecord } from "./task.js";

export interface CreateTasksRequest {
  urls: string[];
}

export interface CreateTasksResponse {
  tasks: TaskRecord[];
}

export interface TaskDetailResponse {
  task: TaskRecord;
  resources: DetectedResource[];
  logs: TaskLogEntry[];
}

export interface SettingsResponse {
  settings: AppSettings;
}

export interface DownloadTaskRequest {
  resourceIds?: string[];
}

export interface DeleteTaskResponse {
  deletedTaskId: string;
}

export interface ListResourcesResponse {
  resources: ManagedVideoItem[];
}

export interface DeleteResourceResponse {
  deletedResourceId: string;
}
