import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { DetectedResource } from "@video/shared";

describe("task queue", () => {
  const createdPaths: string[] = [];

  afterEach(() => {
    for (const createdPath of createdPaths.splice(0)) {
      rmSync(createdPath, { recursive: true, force: true });
    }
  });

  it("marks a task as detected when resources are found", async () => {
    const { createAppStore } = await import("../src/persistence/app-store.js");
    const { createTaskQueue } = await import("../src/queue/task-queue.js");

    const rootDir = mkdtempSync(join(tmpdir(), "video-queue-"));
    createdPaths.push(rootDir);

    const store = createAppStore(join(rootDir, "app.db"), rootDir);
    const browserOpens: string[] = [];

    const queue = createTaskQueue({
      store,
      autoDownload: false,
      browserManager: {
        async openSession({ siteHost }) {
          browserOpens.push(siteHost);
          return {
            page: {},
            close: async () => {}
          };
        }
      },
      detectResources: async () => ({
        status: "detected" as const,
        resources: [
          {
            id: "resource-1",
            taskId: "pending",
            url: "https://cdn.example.com/movie.mp4",
            format: "mp4",
            mimeType: "video/mp4",
            referer: null,
            userAgent: null,
            cookie: null,
            headers: {},
            titleHint: "demo video",
            sizeHint: null,
            selected: false
          } satisfies DetectedResource
        ]
      }),
      downloadResource: async () => {
        throw new Error("download should not be called when autoDownload is off");
      }
    });

    const [task] = await queue.submit(["https://example.com/watch"]);

    expect(browserOpens).toEqual(["example.com"]);
    expect(task.status).toBe("detected");
    expect(store.getTaskDetail(task.id).resources).toHaveLength(1);
  });

  it("downloads detected resources when auto download is enabled", async () => {
    const { createAppStore } = await import("../src/persistence/app-store.js");
    const { createTaskQueue } = await import("../src/queue/task-queue.js");

    const rootDir = mkdtempSync(join(tmpdir(), "video-queue-"));
    createdPaths.push(rootDir);

    const store = createAppStore(join(rootDir, "app.db"), rootDir);
    const downloaded: string[] = [];
    let browserClosed = false;
    let closedBeforeDownload = false;

    const queue = createTaskQueue({
      store,
      autoDownload: true,
      browserManager: {
        async openSession() {
          return {
            page: {},
            close: async () => {
              browserClosed = true;
            }
          };
        }
      },
      detectResources: async () => ({
        status: "detected" as const,
        resources: [
          {
            id: "resource-2",
            taskId: "pending",
            url: "https://cdn.example.com/movie.mp4",
            format: "mp4",
            mimeType: "video/mp4",
            referer: null,
            userAgent: null,
            cookie: null,
            headers: {},
            titleHint: "demo video",
            sizeHint: null,
            selected: true
          } satisfies DetectedResource
        ]
      }),
      downloadResource: async (resource) => {
        closedBeforeDownload = browserClosed;
        downloaded.push(resource.url);
        return {
          filePath: "/tmp/demo-video.mp4",
          downloadedBytes: 1,
          totalBytes: 1,
          method: "direct" as const
        };
      }
    });

    const [task] = await queue.submit(["https://example.com/watch"]);

    expect(downloaded).toEqual(["https://cdn.example.com/movie.mp4"]);
    expect(closedBeforeDownload).toBe(true);
    expect(task.status).toBe("completed");
  });

  it("marks a task as failed and allows retry", async () => {
    const { createAppStore } = await import("../src/persistence/app-store.js");
    const { createTaskQueue } = await import("../src/queue/task-queue.js");

    const rootDir = mkdtempSync(join(tmpdir(), "video-queue-"));
    createdPaths.push(rootDir);

    const store = createAppStore(join(rootDir, "app.db"), rootDir);
    let attempts = 0;

    const queue = createTaskQueue({
      store,
      autoDownload: false,
      browserManager: {
        async openSession() {
          return {
            page: {},
            close: async () => {}
          };
        }
      },
      detectResources: async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error("login required");
        }
        return {
          status: "detected" as const,
          resources: []
        };
      },
      downloadResource: async () => {
        throw new Error("download should not be called");
      }
    });

    const [task] = await queue.submit(["https://example.com/watch"]);
    expect(task.status).toBe("failed");

    const retryTask = await queue.retry(task.id);
    expect(retryTask.status).toBe("detected");
  });

  it("does not append duplicate resources when retrying the same task", async () => {
    const { createAppStore } = await import("../src/persistence/app-store.js");
    const { createTaskQueue } = await import("../src/queue/task-queue.js");

    const rootDir = mkdtempSync(join(tmpdir(), "video-queue-"));
    createdPaths.push(rootDir);

    const store = createAppStore(join(rootDir, "app.db"), rootDir);

    const queue = createTaskQueue({
      store,
      autoDownload: false,
      browserManager: {
        async openSession() {
          return {
            page: {},
            close: async () => {}
          };
        }
      },
      detectResources: async ({ task }) => ({
        status: "detected" as const,
        resources: [
          {
            id: `resource-${task.id}`,
            taskId: task.id,
            url: "https://cdn.example.com/movie.mp4",
            format: "mp4",
            mimeType: "video/mp4",
            referer: null,
            userAgent: null,
            cookie: null,
            headers: {},
            titleHint: "demo video",
            sizeHint: null,
            selected: false
          } satisfies DetectedResource
        ]
      }),
      downloadResource: async () => {
        throw new Error("download should not be called");
      }
    });

    const [task] = await queue.submit(["https://example.com/watch"]);
    expect(store.getTaskDetail(task.id).resources).toHaveLength(1);

    await queue.retry(task.id);
    expect(store.getTaskDetail(task.id).resources).toHaveLength(1);
  });

  it("falls back to the source page as referer when detected resources omit it", async () => {
    const { createAppStore } = await import("../src/persistence/app-store.js");
    const { createTaskQueue } = await import("../src/queue/task-queue.js");

    const rootDir = mkdtempSync(join(tmpdir(), "video-queue-"));
    createdPaths.push(rootDir);

    const store = createAppStore(join(rootDir, "app.db"), rootDir);

    const queue = createTaskQueue({
      store,
      autoDownload: false,
      browserManager: {
        async openSession() {
          return {
            page: {},
            close: async () => {}
          };
        }
      },
      detectResources: async ({ task }) => ({
        status: "detected" as const,
        resources: [
          {
            id: `resource-${task.id}`,
            taskId: task.id,
            url: "https://cdn.example.com/master.m3u8",
            format: "m3u8",
            mimeType: "application/vnd.apple.mpegurl",
            referer: "",
            userAgent: null,
            cookie: null,
            headers: {},
            titleHint: "demo video",
            sizeHint: null,
            selected: false,
            downloadStatus: "idle",
            downloadedBytes: 0,
            totalBytes: null,
            speedBytesPerSecond: null,
            outputFilePath: null,
            errorMessage: null
          } satisfies DetectedResource
        ]
      }),
      downloadResource: async () => {
        throw new Error("download should not be called");
      }
    });

    const [task] = await queue.submit(["https://example.com/watch"]);
    const [resource] = store.getTaskDetail(task.id).resources;

    expect(resource.referer).toBe("https://example.com/watch");
  });

  it("filters out unsupported blob resources before storing detected results", async () => {
    const { createAppStore } = await import("../src/persistence/app-store.js");
    const { createTaskQueue } = await import("../src/queue/task-queue.js");

    const rootDir = mkdtempSync(join(tmpdir(), "video-queue-"));
    createdPaths.push(rootDir);

    const store = createAppStore(join(rootDir, "app.db"), rootDir);

    const queue = createTaskQueue({
      store,
      autoDownload: false,
      browserManager: {
        async openSession() {
          return {
            page: {},
            close: async () => {}
          };
        }
      },
      detectResources: async ({ task }) => ({
        status: "detected" as const,
        resources: [
          {
            id: `blob-${task.id}`,
            taskId: task.id,
            url: "blob:https://example.com/demo",
            format: "unknown",
            mimeType: null,
            referer: task.sourceUrl,
            userAgent: null,
            cookie: null,
            headers: {},
            titleHint: "blob video",
            sizeHint: null,
            selected: false,
            downloadStatus: "idle",
            downloadedBytes: 0,
            totalBytes: null,
            speedBytesPerSecond: null,
            outputFilePath: null,
            errorMessage: null
          } satisfies DetectedResource,
          {
            id: `m3u8-${task.id}`,
            taskId: task.id,
            url: "https://cdn.example.com/master.m3u8",
            format: "m3u8",
            mimeType: "application/vnd.apple.mpegurl",
            referer: task.sourceUrl,
            userAgent: null,
            cookie: null,
            headers: {},
            titleHint: "playlist",
            sizeHint: null,
            selected: false,
            downloadStatus: "idle",
            downloadedBytes: 0,
            totalBytes: null,
            speedBytesPerSecond: null,
            outputFilePath: null,
            errorMessage: null
          } satisfies DetectedResource
        ]
      }),
      downloadResource: async () => {
        throw new Error("download should not be called");
      }
    });

    const [task] = await queue.submit(["https://example.com/watch"]);
    const resources = store.getTaskDetail(task.id).resources;

    expect(resources).toHaveLength(1);
    expect(resources[0].format).toBe("m3u8");
    expect(resources[0].url).toBe("https://cdn.example.com/master.m3u8");
  });
});
