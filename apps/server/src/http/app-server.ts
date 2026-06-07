import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

import cors from "cors";
import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response
} from "express";

import type { AppSettings } from "@video/shared";

import type { AppStore } from "../persistence/app-store.js";
import type { BrowserManagerLike, TaskQueue } from "../queue/task-queue.js";
import type { ServerEvent } from "@video/shared";

export interface EventHub {
  publish(event: ServerEvent): void;
  subscribe(listener: (event: ServerEvent) => void): () => void;
}

export function createEventHub(): EventHub {
  const listeners = new Set<(event: ServerEvent) => void>();

  return {
    publish(event) {
      for (const listener of listeners) {
        listener(event);
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

export interface AppServerDependencies {
  store: AppStore;
  queue: TaskQueue;
  browserManager: BrowserManagerLike;
  eventHub?: EventHub;
  staticDirectory?: string | null;
  pickDirectory?: () => Promise<string | null>;
}

export function createAppServer(dependencies: AppServerDependencies): {
  app: Express;
  eventHub: EventHub;
} {
  const eventHub = dependencies.eventHub ?? createEventHub();
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/health", (_request, response) => {
    response.json({
      ok: true,
      service: "@video/server"
    });
  });

  app.get("/api/events", (request, response) => {
    response.status(200);
    response.setHeader("content-type", "text/event-stream; charset=utf-8");
    response.setHeader("cache-control", "no-cache, no-transform");
    response.setHeader("connection", "keep-alive");
    response.flushHeaders();

    response.write(formatSseEvent({
      type: "app:ready",
      ts: new Date().toISOString()
    }));

    const unsubscribe = eventHub.subscribe((event) => {
      response.write(formatSseEvent(event));
    });

    request.on("close", () => {
      unsubscribe();
    });
  });

  app.post("/api/tasks", async (request, response, next) => {
    try {
      const urls = Array.isArray(request.body?.urls) ? request.body.urls : [];
      const tasks = await dependencies.queue.submit(urls);
      response.json({ tasks });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/tasks", (_request, response) => {
    response.json({ tasks: dependencies.store.listTasks() });
  });

  app.get("/api/resources", (_request, response) => {
    response.json({ resources: dependencies.store.listManagedResources() });
  });

  app.get("/api/tasks/:taskId", (request, response) => {
    const detail = dependencies.store.getTaskDetail(request.params.taskId);
    response.json(detail);
  });

  app.post("/api/tasks/:taskId/retry", async (request, response, next) => {
    try {
      const task = await dependencies.queue.retry(request.params.taskId);
      response.json({ task });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/tasks/:taskId", async (request, response, next) => {
    try {
      await dependencies.queue.deleteTask(request.params.taskId);
      response.json({ deletedTaskId: request.params.taskId });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/tasks/:taskId/download", async (request, response, next) => {
    try {
      const resourceIds = Array.isArray(request.body?.resourceIds)
        ? request.body.resourceIds
        : undefined;
      const task = await dependencies.queue.downloadTask(
        request.params.taskId,
        resourceIds
      );
      response.json({ task });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/resources/:resourceId/download", async (request, response, next) => {
    try {
      const resource = dependencies
        .store
        .listManagedResources()
        .find((item) => item.id === request.params.resourceId);

      if (!resource) {
        response.status(404).json({ error: "resource not found" });
        return;
      }

      try {
        const task = await dependencies.queue.downloadTask(resource.taskId, [
          resource.id
        ]);
        response.json({ task });
        return;
      } catch (initialError) {
        if (resource.format !== "m3u8") {
          throw initialError;
        }

        await dependencies.queue.retry(resource.taskId);
        const refreshedResources = dependencies
          .store
          .listManagedResources()
          .filter((item) => item.taskId === resource.taskId);

        const refreshedResource =
          refreshedResources.find(
            (item) =>
              item.format === resource.format &&
              item.titleHint === resource.titleHint
          ) ??
          refreshedResources.find((item) => item.format === resource.format) ??
          refreshedResources[0];

        if (!refreshedResource) {
          throw initialError;
        }

        const task = await dependencies.queue.downloadTask(resource.taskId, [
          refreshedResource.id
        ]);
        response.json({ task });
        return;
      }
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/resources/:resourceId/content", (request, response) => {
    const resource = dependencies
      .store
      .listManagedResources()
      .find((item) => item.id === request.params.resourceId);

    if (!resource || !resource.outputFilePath) {
      response.status(404).json({ error: "downloaded resource not found" });
      return;
    }

    if (!existsSync(resource.outputFilePath)) {
      response.status(404).json({ error: "downloaded file not found on disk" });
      return;
    }

    const stats = statSync(resource.outputFilePath);
    if (!stats.isFile()) {
      response.status(400).json({ error: "downloaded resource is not a file" });
      return;
    }

    response.setHeader("content-disposition", "inline");
    response.sendFile(resource.outputFilePath);
  });

  app.post("/api/tasks/:taskId/browser/open", async (request, response, next) => {
    try {
      const detail = dependencies.store.getTaskDetail(request.params.taskId);
      const session = await dependencies.browserManager.openSession({
        siteHost: detail.task.siteHost,
        url: detail.task.sourceUrl
      });

      response.json({
        opened: true,
        profileDirectory: session.profileDirectory ?? null
      });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/resources/:resourceId", async (request, response, next) => {
    try {
      const resource = dependencies
        .store
        .listManagedResources()
        .find((item) => item.id === request.params.resourceId);

      if (!resource) {
        throw new Error("resource not found");
      }

      dependencies.store.deleteResource(request.params.resourceId);
      eventHub.publish({
        type: "resource:deleted",
        resourceId: request.params.resourceId,
        taskId: resource.taskId
      });
      response.json({ deletedResourceId: request.params.resourceId });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/tasks/:taskId/detect/resume", async (request, response, next) => {
    try {
      const task = await dependencies.queue.retry(request.params.taskId);
      response.json({ task });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/settings", (_request, response) => {
    response.json({ settings: dependencies.store.getSettings() });
  });

  app.post("/api/settings/download-directory/pick", async (_request, response, next) => {
    try {
      if (!dependencies.pickDirectory) {
        response.status(501).json({ error: "directory picker is not available" });
        return;
      }

      const directoryPath = await dependencies.pickDirectory();
      response.json({ directoryPath });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/settings", (request, response) => {
    const body = request.body?.settings ?? request.body;
    const settings = dependencies.store.saveSettings(body as AppSettings);
    response.json({ settings });
  });

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    response.status(500).json({
      error: error instanceof Error ? error.message : "unknown error"
    });
  });

  if (dependencies.staticDirectory && existsSync(dependencies.staticDirectory)) {
    app.use(express.static(dependencies.staticDirectory));
    app.get(/^(?!\/api|\/health).*/, (_request, response) => {
      response.sendFile(join(dependencies.staticDirectory!, "index.html"));
    });
  }

  return { app, eventHub };
}

function formatSseEvent(event: ServerEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}
