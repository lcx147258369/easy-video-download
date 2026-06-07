import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { DetectedResource } from "@video/shared";

describe("app server", () => {
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

  it("creates tasks, exposes task details, and streams events", async () => {
    const { createAppStore } = await import("../src/persistence/app-store.js");
    const { createTaskQueue } = await import("../src/queue/task-queue.js");
    const { createAppServer, createEventHub } = await import(
      "../src/http/app-server.js"
    );

    const rootDir = mkdtempSync(join(tmpdir(), "video-api-"));
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
        status: "detected" as const,
        resources: [
          {
            id: "resource-1",
            taskId: "task-1",
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
    const eventResponse = await fetch(`${baseUrl}/api/events`);
    expect(eventResponse.ok).toBe(true);

    const reader = eventResponse.body?.getReader();
    if (!reader) {
      throw new Error("missing sse body");
    }

    const initialChunk = await reader.read();
    expect(new TextDecoder().decode(initialChunk.value)).toContain("app:ready");

    const created = await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        urls: ["https://example.com/watch"]
      })
    }).then((response) => response.json() as Promise<{ tasks: { id: string; status: string }[] }>);

    expect(created.tasks).toHaveLength(1);
    expect(created.tasks[0].status).toBe("detected");

    const eventChunk = await reader.read();
    expect(new TextDecoder().decode(eventChunk.value)).toContain("task:state-changed");

    const taskList = await fetch(`${baseUrl}/api/tasks`).then((response) =>
      response.json() as Promise<{ tasks: { id: string; status: string }[] }>
    );
    expect(taskList.tasks).toHaveLength(1);
    expect(taskList.tasks[0].status).toBe("detected");

    const taskDetail = await fetch(`${baseUrl}/api/tasks/${created.tasks[0].id}`).then(
      (response) =>
        response.json() as Promise<{
          task: { id: string; status: string };
          resources: unknown[];
          logs: unknown[];
        }>
    );

    expect(taskDetail.resources).toHaveLength(1);
    expect(taskDetail.logs.length).toBeGreaterThan(0);

    await reader.cancel();
  });
});
