// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

const apiState = vi.hoisted(() => {
  class FakeEventSource {
    static instances: FakeEventSource[] = [];
    static reset() {
      FakeEventSource.instances = [];
    }

    public onerror: ((this: EventSource, ev: Event) => unknown) | null = null;
    private listeners = new Map<string, Set<EventListener>>();

    constructor(_url: string) {
      FakeEventSource.instances.push(this);
    }

    addEventListener(type: string, listener: EventListener) {
      const set = this.listeners.get(type) ?? new Set<EventListener>();
      set.add(listener);
      this.listeners.set(type, set);
    }

    removeEventListener(type: string, listener: EventListener) {
      this.listeners.get(type)?.delete(listener);
    }

    emit(type: string, payload: unknown) {
      const event = new MessageEvent("message", {
        data: JSON.stringify(payload)
      });
      for (const listener of this.listeners.get(type) ?? []) {
        listener(event);
      }
    }

    close() {}
  }

  return {
    listTasks: vi.fn(),
    listResources: vi.fn(),
    getSettings: vi.fn(),
    getTask: vi.fn(),
    createTasks: vi.fn(),
    deleteTask: vi.fn(),
    deleteResource: vi.fn(),
    retryTask: vi.fn(),
    openTaskBrowser: vi.fn(),
    resumeTaskDetection: vi.fn(),
    downloadTask: vi.fn(),
    downloadResource: vi.fn(),
    revealDownloadedFile: vi.fn(),
    saveSettings: vi.fn(),
    pickDirectory: vi.fn(),
    createEventSource: vi.fn(),
    FakeEventSource
  };
});

vi.mock("./lib/api", () => ({
  api: {
    listTasks: apiState.listTasks,
    listResources: apiState.listResources,
    getSettings: apiState.getSettings,
    getTask: apiState.getTask,
    createTasks: apiState.createTasks,
    deleteTask: apiState.deleteTask,
    deleteResource: apiState.deleteResource,
    retryTask: apiState.retryTask,
    openTaskBrowser: apiState.openTaskBrowser,
    resumeTaskDetection: apiState.resumeTaskDetection,
    downloadTask: apiState.downloadTask,
    downloadResource: apiState.downloadResource,
    revealDownloadedFile: apiState.revealDownloadedFile,
    saveSettings: apiState.saveSettings,
    pickDirectory: apiState.pickDirectory,
    createEventSource: apiState.createEventSource
  }
}));

describe("App", () => {
  beforeEach(() => {
    apiState.FakeEventSource.reset();
    apiState.listTasks.mockReset();
    apiState.listResources.mockReset();
    apiState.getSettings.mockReset();
    apiState.getTask.mockReset();
    apiState.createTasks.mockReset();
    apiState.deleteTask.mockReset();
    apiState.deleteResource.mockReset();
    apiState.retryTask.mockReset();
    apiState.openTaskBrowser.mockReset();
    apiState.resumeTaskDetection.mockReset();
    apiState.downloadTask.mockReset();
    apiState.downloadResource.mockReset();
    apiState.revealDownloadedFile.mockReset();
    apiState.saveSettings.mockReset();
    apiState.pickDirectory.mockReset();
    apiState.createEventSource.mockReset();

    apiState.listTasks.mockResolvedValue({ tasks: [] });
    apiState.listResources.mockResolvedValue({ resources: [] });
    apiState.getTask.mockResolvedValue({
      task: {
        id: "task-1",
        sourceUrl: "https://example.com/watch",
        status: "detected",
        siteHost: "example.com",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      resources: [],
      logs: []
    });
    apiState.getSettings.mockResolvedValue({
      settings: {
        downloadDirectory: "/tmp/downloads",
        profileDirectory: "/tmp/profiles",
        maxConcurrentDownloads: 2,
        autoDownload: false,
        detectionTimeoutMs: 15000,
        browserExecutablePath: null,
        headless: true
      }
    });
    apiState.createEventSource.mockImplementation(
      () => new apiState.FakeEventSource("/api/events")
    );
    apiState.pickDirectory.mockResolvedValue({
      directoryPath: "/tmp/selected-downloads"
    });
    apiState.revealDownloadedFile.mockResolvedValue({
      revealed: true,
      filePath: "/tmp/demo.mp4"
    });
  });

  it("loads initial data and event source only once", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("视频抓取工作台")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "运行设置" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "下载中心" })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "当前页面任务" })).not.toBeInTheDocument();
      expect(screen.getAllByText("页面任务").length).toBeGreaterThan(0);
      expect(screen.getAllByText("0")).not.toHaveLength(0);
    });

    expect(apiState.listTasks).toHaveBeenCalledTimes(1);
    expect(apiState.listResources).toHaveBeenCalledTimes(1);
    expect(apiState.getSettings).toHaveBeenCalledTimes(1);
    expect(apiState.createEventSource).toHaveBeenCalledTimes(1);
    expect(apiState.FakeEventSource.instances).toHaveLength(1);
  });

  it("shows resource download tasks under the selected page task", async () => {
    apiState.listTasks.mockResolvedValue({
      tasks: [
        {
          id: "task-1",
          sourceUrl: "https://example.com/watch",
          status: "detected",
          siteHost: "example.com",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ]
    });
    apiState.listResources.mockResolvedValue({
      resources: [
        {
          id: "resource-1",
          taskId: "task-1",
          url: "https://cdn.example.com/demo.mp4",
          format: "mp4",
          mimeType: "video/mp4",
          referer: null,
          userAgent: null,
          cookie: null,
          headers: {},
          titleHint: "demo video",
          sizeHint: null,
          selected: false,
          downloadStatus: "completed",
          downloadedBytes: 1024,
          totalBytes: 1024,
          speedBytesPerSecond: null,
          outputFilePath: "/tmp/demo.mp4",
          errorMessage: null,
          sourceUrl: "https://example.com/watch",
          siteHost: "example.com",
          taskStatus: "detected",
          taskUpdatedAt: new Date("2026-06-06T12:00:00.000Z").toISOString(),
          taskErrorMessage: null
        }
      ]
    });
    apiState.getTask.mockResolvedValue({
      task: {
        id: "task-1",
        sourceUrl: "https://example.com/watch",
        status: "detected",
        siteHost: "example.com",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      resources: [
        {
          id: "resource-1",
          taskId: "task-1",
          url: "https://cdn.example.com/demo.mp4",
          format: "mp4",
          mimeType: "video/mp4",
          referer: "https://example.com/watch",
          userAgent: null,
          cookie: null,
          headers: {},
          titleHint: "demo video",
          sizeHint: null,
          selected: true,
          downloadStatus: "completed",
          downloadedBytes: 1024,
          totalBytes: 1024,
          speedBytesPerSecond: null,
          outputFilePath: "/tmp/demo.mp4",
          errorMessage: null
        }
      ],
      logs: []
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("第 3 步：资源下载任务")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "查看下载内容" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "查看下载文件位置" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "下载中心" }));

    await waitFor(() => {
      expect(screen.getByText("后台下载看板")).toBeInTheDocument();
    });
  });

  it("keeps download center progress available after switching page tasks", async () => {
    const now = new Date().toISOString();
    apiState.listTasks.mockResolvedValue({
      tasks: [
        {
          id: "task-1",
          sourceUrl: "https://example.com/watch/1",
          status: "downloading",
          siteHost: "example.com",
          createdAt: now,
          updatedAt: now
        },
        {
          id: "task-2",
          sourceUrl: "https://example.com/watch/2",
          status: "detected",
          siteHost: "example.com",
          createdAt: now,
          updatedAt: now
        }
      ]
    });
    apiState.listResources.mockResolvedValue({
      resources: [
        {
          id: "resource-1",
          taskId: "task-1",
          url: "https://cdn.example.com/demo.mp4",
          format: "mp4",
          mimeType: "video/mp4",
          referer: null,
          userAgent: null,
          cookie: null,
          headers: {},
          titleHint: "demo video",
          sizeHint: null,
          selected: true,
          downloadStatus: "downloading",
          downloadedBytes: 512,
          totalBytes: 1024,
          speedBytesPerSecond: 128,
          outputFilePath: null,
          errorMessage: null,
          sourceUrl: "https://example.com/watch/1",
          siteHost: "example.com",
          taskStatus: "downloading",
          taskUpdatedAt: now,
          taskErrorMessage: null
        }
      ]
    });
    apiState.getTask.mockImplementation(async (taskId: string) => ({
      task:
        taskId === "task-2"
          ? {
              id: "task-2",
              sourceUrl: "https://example.com/watch/2",
              status: "detected" as const,
              siteHost: "example.com",
              createdAt: now,
              updatedAt: now
            }
          : {
              id: "task-1",
              sourceUrl: "https://example.com/watch/1",
              status: "downloading" as const,
              siteHost: "example.com",
              createdAt: now,
              updatedAt: now
            },
      resources:
        taskId === "task-1"
          ? [
              {
                id: "resource-1",
                taskId: "task-1",
                url: "https://cdn.example.com/demo.mp4",
                format: "mp4",
                mimeType: "video/mp4",
                referer: "https://example.com/watch/1",
                userAgent: null,
                cookie: null,
                headers: {},
                titleHint: "demo video",
                sizeHint: null,
                selected: true,
                downloadStatus: "downloading" as const,
                downloadedBytes: 512,
                totalBytes: 1024,
                speedBytesPerSecond: 128,
                outputFilePath: null,
                errorMessage: null
              }
            ]
          : [],
      logs: []
    }));

    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByText("https://example.com/watch/2")[0]).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByText("https://example.com/watch/2")[0]);
    fireEvent.click(screen.getByRole("button", { name: "下载中心" }));

    await waitFor(() => {
      expect(screen.getByText("后台下载看板")).toBeInTheDocument();
      expect(screen.getByText("demo video")).toBeInTheDocument();
      expect(screen.getByText("50%")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "定位页面任务" })).toBeInTheDocument();
    });
  });

  it("keeps updating download center progress after switching to another page task", async () => {
    const now = new Date().toISOString();
    apiState.listTasks.mockResolvedValue({
      tasks: [
        {
          id: "task-1",
          sourceUrl: "https://example.com/watch/1",
          status: "downloading",
          siteHost: "example.com",
          createdAt: now,
          updatedAt: now
        },
        {
          id: "task-2",
          sourceUrl: "https://example.com/watch/2",
          status: "detected",
          siteHost: "example.com",
          createdAt: now,
          updatedAt: now
        }
      ]
    });
    apiState.listResources.mockResolvedValue({
      resources: [
        {
          id: "resource-1",
          taskId: "task-1",
          url: "https://cdn.example.com/demo.mp4",
          format: "mp4",
          mimeType: "video/mp4",
          referer: null,
          userAgent: null,
          cookie: null,
          headers: {},
          titleHint: "demo video",
          sizeHint: null,
          selected: true,
          downloadStatus: "downloading",
          downloadedBytes: 512,
          totalBytes: 1024,
          speedBytesPerSecond: 128,
          outputFilePath: null,
          errorMessage: null,
          sourceUrl: "https://example.com/watch/1",
          siteHost: "example.com",
          taskStatus: "downloading",
          taskUpdatedAt: now,
          taskErrorMessage: null
        }
      ]
    });
    apiState.getTask.mockImplementation(async (taskId: string) => ({
      task:
        taskId === "task-2"
          ? {
              id: "task-2",
              sourceUrl: "https://example.com/watch/2",
              status: "detected" as const,
              siteHost: "example.com",
              createdAt: now,
              updatedAt: now
            }
          : {
              id: "task-1",
              sourceUrl: "https://example.com/watch/1",
              status: "downloading" as const,
              siteHost: "example.com",
              createdAt: now,
              updatedAt: now
            },
      resources:
        taskId === "task-1"
          ? [
              {
                id: "resource-1",
                taskId: "task-1",
                url: "https://cdn.example.com/demo.mp4",
                format: "mp4",
                mimeType: "video/mp4",
                referer: "https://example.com/watch/1",
                userAgent: null,
                cookie: null,
                headers: {},
                titleHint: "demo video",
                sizeHint: null,
                selected: true,
                downloadStatus: "downloading" as const,
                downloadedBytes: 512,
                totalBytes: 1024,
                speedBytesPerSecond: 128,
                outputFilePath: null,
                errorMessage: null
              }
            ]
          : [],
      logs: []
    }));

    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByText("https://example.com/watch/2")[0]).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByText("https://example.com/watch/2")[0]);
    fireEvent.click(screen.getByRole("button", { name: "下载中心" }));

    await waitFor(() => {
      expect(screen.getByText("50%")).toBeInTheDocument();
    });

    await act(async () => {
      apiState.FakeEventSource.instances[0]?.emit("task:download-progress", {
        type: "task:download-progress",
        taskId: "task-1",
        resourceId: "resource-1",
        downloadStatus: "downloading",
        downloadedBytes: 768,
        totalBytes: 1024,
        speedBytesPerSecond: 256,
        outputFilePath: null,
        errorMessage: null
      });
    });

    await waitFor(() => {
      expect(screen.getByText("75%")).toBeInTheDocument();
    });
  });

  it("keeps a newly created task unique and switches detail to it", async () => {
    const existingTask = {
      id: "task-1",
      sourceUrl: "https://old.example.com/watch",
      status: "detected" as const,
      siteHost: "old.example.com",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const createdTask = {
      id: "task-2",
      sourceUrl: "https://example.com/test-main-flow",
      status: "running" as const,
      siteHost: "example.com",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    let resolveCreateTasks:
      | ((value: { tasks: Array<typeof createdTask> }) => void)
      | undefined;

    apiState.listTasks.mockResolvedValue({
      tasks: [existingTask]
    });
    apiState.createTasks.mockImplementation(
      () =>
        new Promise<{ tasks: Array<typeof createdTask> }>((resolve) => {
          resolveCreateTasks = resolve;
        })
    );
    apiState.getTask.mockImplementation(async (taskId: string) => ({
      task: taskId === createdTask.id ? createdTask : existingTask,
      resources: [],
      logs: []
    }));

    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByText("https://old.example.com/watch")).toHaveLength(2);
    });

    fireEvent.change(
      screen.getByRole("textbox", { name: /输入页面 URL/ }),
      {
        target: {
          value: `${createdTask.sourceUrl} https://example.com/extra-task\n说明：https://example.com/extra-task`
        }
      }
    );
    fireEvent.click(screen.getByRole("button", { name: "创建页面任务" }));

    await waitFor(() => {
      expect(apiState.createTasks).toHaveBeenCalledWith([
        createdTask.sourceUrl,
        "https://example.com/extra-task"
      ]);
    });

    await act(async () => {
      apiState.FakeEventSource.instances[0]?.emit("task:state-changed", {
        type: "task:state-changed",
        task: createdTask
      });
    });

    await waitFor(() => {
      expect(apiState.getTask).toHaveBeenCalledWith(createdTask.id);
    });

    resolveCreateTasks?.({ tasks: [createdTask] });

    await waitFor(() => {
      expect(screen.getAllByText("页面任务").length).toBeGreaterThan(0);
      expect(screen.getAllByText("2")).not.toHaveLength(0);
      expect(
        screen.getAllByRole("button", { name: new RegExp(createdTask.sourceUrl) })
      ).toHaveLength(1);
      expect(screen.getByRole("heading", { name: "当前页面任务" })).toBeInTheDocument();
      expect(screen.getAllByText(createdTask.sourceUrl)).toHaveLength(2);
    });
  });

  it("bulk deletes selected page tasks", async () => {
    apiState.listTasks.mockResolvedValue({
      tasks: [
        {
          id: "task-1",
          sourceUrl: "https://example.com/watch/1",
          status: "detected",
          siteHost: "example.com",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: "task-2",
          sourceUrl: "https://example.com/watch/2",
          status: "detected",
          siteHost: "example.com",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ]
    });
    apiState.deleteTask.mockResolvedValue({ deletedTaskId: "task-1" });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByLabelText("全选")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("全选"));
    fireEvent.click(screen.getByRole("button", { name: "删除已选" }));

    await waitFor(() => {
      expect(apiState.deleteTask).toHaveBeenCalledTimes(2);
      expect(apiState.deleteTask).toHaveBeenNthCalledWith(1, "task-1");
      expect(apiState.deleteTask).toHaveBeenNthCalledWith(2, "task-2");
    });
  });
});
