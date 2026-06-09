import type { TaskStatus } from "./task.js";

export const RESOURCE_DOWNLOAD_STATUSES = [
  "idle",
  "downloading",
  "merging",
  "remuxing",
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

export function getResourceDownloadStatusLabel(
  status: ResourceDownloadStatus
): string {
  if (status === "downloading") return "下载中";
  if (status === "merging") return "合并中";
  if (status === "remuxing") return "转 MP4 中";
  if (status === "completed") return "下载完成";
  if (status === "failed") return "下载失败";
  return "等待下载";
}

export function isActiveResourceDownloadStatus(
  status: ResourceDownloadStatus
): boolean {
  return (
    status === "downloading" ||
    status === "merging" ||
    status === "remuxing"
  );
}
