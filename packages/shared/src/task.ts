export const TASK_STATUSES = [
  "pending",
  "running",
  "needs_login",
  "detected",
  "downloading",
  "completed",
  "failed"
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TERMINAL_TASK_STATUSES = ["completed", "failed"] as const;

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pending: "排队中",
  running: "抓取中",
  needs_login: "等待登录",
  detected: "已抓到资源",
  downloading: "下载中",
  completed: "已完成",
  failed: "失败"
};

export interface TaskRecord {
  id: string;
  sourceUrl: string;
  status: TaskStatus;
  title?: string;
  siteHost: string;
  createdAt: string;
  updatedAt: string;
  errorMessage?: string;
}

export interface TaskLogEntry {
  id: string;
  taskId: string;
  level: "info" | "warn" | "error";
  message: string;
  createdAt: string;
}

export function getTaskStatusLabel(status: TaskStatus): string {
  return TASK_STATUS_LABELS[status];
}

export function isTerminalTaskStatus(status: TaskStatus): boolean {
  return TERMINAL_TASK_STATUSES.includes(status as (typeof TERMINAL_TASK_STATUSES)[number]);
}
