import type {
  AppSettings,
  CreateTasksResponse,
  DeleteTaskResponse,
  DownloadTaskRequest,
  ListResourcesResponse,
  SettingsResponse,
  TaskDetailResponse,
  TaskRecord
} from "@video/shared";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ??
  `${window.location.protocol}//${window.location.hostname}:4318`;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    },
    ...init
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const rawBody = await response.text();
      if (rawBody) {
        try {
          const body = JSON.parse(rawBody) as { error?: string };
          message = body.error || rawBody;
        } catch {
          message = rawBody;
        }
      }
    } catch {
      message = `Request failed with status ${response.status}`;
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export const api = {
  createTasks(urls: string[]) {
    return request<CreateTasksResponse>("/api/tasks", {
      method: "POST",
      body: JSON.stringify({ urls })
    });
  },
  listTasks() {
    return request<{ tasks: TaskRecord[] }>("/api/tasks");
  },
  listResources() {
    return request<ListResourcesResponse>("/api/resources");
  },
  getTask(taskId: string) {
    return request<TaskDetailResponse>(`/api/tasks/${taskId}`);
  },
  retryTask(taskId: string) {
    return request<{ task: TaskRecord }>(`/api/tasks/${taskId}/retry`, {
      method: "POST"
    });
  },
  deleteTask(taskId: string) {
    return request<DeleteTaskResponse>(`/api/tasks/${taskId}`, {
      method: "DELETE"
    });
  },
  deleteResource(resourceId: string) {
    return request<{ deletedResourceId: string }>(`/api/resources/${resourceId}`, {
      method: "DELETE"
    });
  },
  openTaskBrowser(taskId: string) {
    return request<{ opened: boolean; profileDirectory: string | null }>(
      `/api/tasks/${taskId}/browser/open`,
      { method: "POST" }
    );
  },
  resumeTaskDetection(taskId: string) {
    return request<{ task: TaskRecord }>(`/api/tasks/${taskId}/detect/resume`, {
      method: "POST"
    });
  },
  downloadTask(taskId: string, payload: DownloadTaskRequest) {
    return request<{ task: TaskRecord }>(`/api/tasks/${taskId}/download`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  downloadResource(resourceId: string) {
    return request<{ task: TaskRecord }>(`/api/resources/${resourceId}/download`, {
      method: "POST"
    });
  },
  getResourceContentUrl(resourceId: string) {
    return `${API_BASE}/api/resources/${resourceId}/content`;
  },
  getSettings() {
    return request<SettingsResponse>("/api/settings");
  },
  saveSettings(settings: AppSettings) {
    return request<SettingsResponse>("/api/settings", {
      method: "POST",
      body: JSON.stringify({ settings })
    });
  },
  pickDirectory() {
    return request<{ directoryPath: string | null }>("/api/settings/download-directory/pick", {
      method: "POST"
    });
  },
  createEventSource() {
    return new EventSource(`${API_BASE}/api/events`);
  }
};
