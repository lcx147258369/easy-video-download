import type { TaskStatus } from "./task.js";

export const RESOURCE_DOWNLOAD_STATUSES = [
  "idle",
  "downloading",
  "completed",
  "failed"
] as const;

export type ResourceDownloadStatus =
  (typeof RESOURCE_DOWNLOAD_STATUSES)[number];

export interface DetectedResource {
  id: string;
  taskId: string;
  url: string;
  format: "mp4" | "webm" | "m3u8" | "unknown";
  mimeType: string | null;
  referer: string | null;
  userAgent: string | null;
  cookie: string | null;
  headers: Record<string, string>;
  titleHint: string | null;
  sizeHint: number | null;
  selected: boolean;
  downloadStatus: ResourceDownloadStatus;
  downloadedBytes: number;
  totalBytes: number | null;
  speedBytesPerSecond: number | null;
  outputFilePath: string | null;
  errorMessage: string | null;
}

export interface ManagedVideoItem extends DetectedResource {
  sourceUrl: string;
  siteHost: string;
  taskStatus: TaskStatus;
  taskUpdatedAt: string;
  taskErrorMessage: string | null;
}
