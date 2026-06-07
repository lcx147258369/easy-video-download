import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

describe("app server task deletion", () => {
  const createdPaths: string[] = [];
  const servers: Server[] = [];

  afterEach(async () => {
    for (const server of servers.splice(0)) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    for (const createdPath of createdPaths.splice(0)) {
      rmSync(createdPath, { recursive: true, force: true });
    }
  });

  it("deletes a task and removes it from the list", async () => {
    const { createAppStore } = await import("../src/persistence/app-store.js");
    const { createTaskQueue } = await import("../src/queue/task-queue.js");
    const { createAppServer, createEventHub } = await import(
      "../src/http/app-server.js"
    );

    const rootDir = mkdtempSync(join(tmpdir(), "video-api-delete-"));
    createdPaths.push(rootDir);

    const store = createAppStore(join(rootDir, "app.db"), rootDir);
    const eventHub = createEventHub();
    const queue = createTaskQueue({
      store,
      autoDownload: false,
      browserManager: {
        async openSession() {
          return {
            page: {},
            close: async () => undefined
          };
        }
      },
      detectResources: async () => ({
        status: "failed" as const,
        resources: [],
        message: "no resource"
      }),
      downloadResource: async () => ({
        filePath: "/tmp/demo-video.mp4",
        downloadedBytes: 1,
        method: "direct" as const
      }),
      publishEvent: eventHub.publish
    });

    const { app } = createAppServer({
      store,
      queue,
      browserManager: {
        async openSession() {
          return {
            page: {},
            close: async () => undefined
          };
        }
      },
      eventHub
    });

    const server = createServer(app);
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (typeof address !== "object" || address === null) {
      throw new Error("failed to open api server");
    }

    const baseUrl = `http://127.0.0.1:${address.port}`;
    const created = await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        urls: ["https://example.com/watch"]
      })
    }).then((response) => response.json() as Promise<{ tasks: Array<{ id: string }> }>);

    expect(created.tasks).toHaveLength(1);

    await fetch(`${baseUrl}/api/tasks/${created.tasks[0].id}`, {
      method: "DELETE"
    });

    const list = await fetch(`${baseUrl}/api/tasks`).then((response) =>
      response.json() as Promise<{ tasks: Array<{ id: string }> }>
    );
    expect(list.tasks).toHaveLength(0);
  });

  it("retries with a refreshed m3u8 resource only after the first download attempt fails", async () => {
    const { createAppStore } = await import("../src/persistence/app-store.js");
    const { createAppServer, createEventHub } = await import(
      "../src/http/app-server.js"
    );

    const rootDir = mkdtempSync(join(tmpdir(), "video-api-download-"));
    createdPaths.push(rootDir);

    const store = createAppStore(join(rootDir, "app.db"), rootDir);
    const eventHub = createEventHub();
    const [task] = store.createTasks(["https://example.com/watch"]);
    const stale = store.addResource(task.id, {
      url: "https://cdn.example.com/stale.m3u8?auth_key=old",
      format: "m3u8",
      mimeType: "application/vnd.apple.mpegurl",
      referer: "https://example.com/watch",
      userAgent: "test-agent",
      cookie: null,
      headers: {},
      titleHint: "demo video",
      sizeHint: null,
      selected: false
    });

    let retried = false;
    let downloadAttempts = 0;

    const queue = {
      submit: async () => [],
      retry: async (taskId: string) => {
        retried = true;
        store.clearTaskResources(taskId);
        store.addResource(taskId, {
          url: "https://cdn.example.com/fresh.m3u8?auth_key=new",
          format: "m3u8",
          mimeType: "application/vnd.apple.mpegurl",
          referer: "https://example.com/watch",
          userAgent: "test-agent",
          cookie: null,
          headers: {},
          titleHint: "demo video",
          sizeHint: null,
          selected: false
        });
        return store.updateTaskStatus(taskId, "detected");
      },
      downloadTask: async (taskId: string, resourceIds?: string[]) => {
        downloadAttempts += 1;
        expect(taskId).toBe(task.id);
        if (downloadAttempts === 1) {
          expect(resourceIds).toEqual([stale.id]);
          throw new Error("HTTP 400");
        }

        expect(retried).toBe(true);
        const detail = store.getTaskDetail(taskId);
        expect(detail.resources).toHaveLength(1);
        expect(resourceIds).toEqual([detail.resources[0].id]);
        expect(resourceIds).not.toEqual([stale.id]);
        return detail.task;
      },
      deleteTask: async () => undefined
    };

    const { app } = createAppServer({
      store,
      queue,
      browserManager: {
        async openSession() {
          return {
            page: {},
            close: async () => undefined
          };
        }
      },
      eventHub
    });

    const server = createServer(app);
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (typeof address !== "object" || address === null) {
      throw new Error("failed to open api server");
    }

    const baseUrl = `http://127.0.0.1:${address.port}`;
    const response = await fetch(`${baseUrl}/api/resources/${stale.id}/download`, {
      method: "POST"
    }).then((res) => res.json());

    expect(response.task.id).toBe(task.id);
    expect(downloadAttempts).toBe(2);
  });

  it("serves downloaded resource content when output file exists", async () => {
    const { createAppStore } = await import("../src/persistence/app-store.js");
    const { createAppServer, createEventHub } = await import(
      "../src/http/app-server.js"
    );

    const rootDir = mkdtempSync(join(tmpdir(), "video-api-content-"));
    createdPaths.push(rootDir);

    const store = createAppStore(join(rootDir, "app.db"), rootDir);
    const eventHub = createEventHub();
    const [task] = store.createTasks(["https://example.com/watch"]);
    const resource = store.addResource(task.id, {
      url: "https://cdn.example.com/demo.mp4",
      format: "mp4",
      mimeType: "video/mp4",
      referer: "https://example.com/watch",
      userAgent: "test-agent",
      cookie: null,
      headers: {},
      titleHint: "demo video",
      sizeHint: null,
      selected: false
    });
    const outputPath = join(rootDir, "demo.mp4");
    writeFileSync(outputPath, "demo-video-content");
    store.updateResourceDownloadState(resource.id, {
      downloadStatus: "completed",
      downloadedBytes: 18,
      totalBytes: 18,
      speedBytesPerSecond: null,
      outputFilePath: outputPath,
      errorMessage: null
    });

    const queue = {
      submit: async () => [],
      retry: async () => task,
      downloadTask: async () => task,
      deleteTask: async () => undefined
    };

    const { app } = createAppServer({
      store,
      queue,
      browserManager: {
        async openSession() {
          return {
            page: {},
            close: async () => undefined
          };
        }
      },
      eventHub
    });

    const server = createServer(app);
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (typeof address !== "object" || address === null) {
      throw new Error("failed to open api server");
    }

    const baseUrl = `http://127.0.0.1:${address.port}`;
    const response = await fetch(`${baseUrl}/api/resources/${resource.id}/content`);

    expect(response.ok).toBe(true);
    expect(response.headers.get("content-disposition")).toContain("inline");
    await expect(response.text()).resolves.toBe("demo-video-content");
  });
});
