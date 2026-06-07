import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createAppStore } from "../src/persistence/app-store.js";

describe("app store", () => {
  const createdPaths: string[] = [];

  afterEach(() => {
    for (const createdPath of createdPaths.splice(0)) {
      rmSync(createdPath, { recursive: true, force: true });
    }
  });

  it("persists settings updates across reloads", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "video-store-"));
    createdPaths.push(rootDir);

    const dbPath = join(rootDir, "app.db");
    const store = createAppStore(dbPath, rootDir);
    const defaultSettings = store.getSettings();

    expect(defaultSettings.maxConcurrentDownloads).toBe(2);
    expect(defaultSettings.downloadDirectory.endsWith("data/downloads")).toBe(true);
    expect(defaultSettings.headless).toBe(true);

    store.saveSettings({
      ...defaultSettings,
      maxConcurrentDownloads: 4,
      autoDownload: true
    });

    const reopenedStore = createAppStore(dbPath, rootDir);
    const persisted = reopenedStore.getSettings();

    expect(persisted.maxConcurrentDownloads).toBe(4);
    expect(persisted.autoDownload).toBe(true);
    expect(persisted.headless).toBe(true);
  });

  it("creates tasks from url inputs and stores them", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "video-store-"));
    createdPaths.push(rootDir);

    const store = createAppStore(join(rootDir, "app.db"), rootDir);
    const tasks = store.createTasks([
      "https://example.com/video/1",
      "https://example.com/video/2"
    ]);

    expect(tasks).toHaveLength(2);
    expect(tasks[0].status).toBe("pending");
    expect(tasks[0].siteHost).toBe("example.com");
    expect(store.listTasks()).toHaveLength(2);
  });

  it("persists task logs and detected resources", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "video-store-"));
    createdPaths.push(rootDir);

    const store = createAppStore(join(rootDir, "app.db"), rootDir);
    const [task] = store.createTasks(["https://example.com/video/1"]);

    const resource = store.addResource(task.id, {
      url: "https://cdn.example.com/video.mp4",
      format: "mp4",
      mimeType: "video/mp4",
      referer: task.sourceUrl,
      userAgent: "test-agent",
      cookie: "session=1",
      headers: {
        "x-test": "1"
      },
      titleHint: "demo video",
      sizeHint: 1024,
      selected: true
    });

    store.addTaskLog(task.id, "info", "resource detected");

    const detail = store.getTaskDetail(task.id);

    expect(detail.resources).toHaveLength(1);
    expect(detail.resources[0].id).toBe(resource.id);
    expect(detail.resources[0].headers).toEqual({ "x-test": "1" });
    expect(detail.logs).toHaveLength(1);
    expect(detail.logs[0].message).toBe("resource detected");
  });

  it("updates resource download state and deletes the whole task", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "video-store-"));
    createdPaths.push(rootDir);

    const store = createAppStore(join(rootDir, "app.db"), rootDir);
    const [task] = store.createTasks(["https://example.com/video/1"]);
    const resource = store.addResource(task.id, {
      url: "https://cdn.example.com/video.mp4",
      format: "mp4",
      mimeType: "video/mp4",
      referer: task.sourceUrl,
      userAgent: "test-agent",
      cookie: null,
      headers: {},
      titleHint: "demo video",
      sizeHint: 1024,
      selected: true
    });

    const updated = store.updateResourceDownloadState(resource.id, {
      downloadStatus: "failed",
      downloadedBytes: 512,
      totalBytes: 1024,
      speedBytesPerSecond: 128,
      outputFilePath: null,
      errorMessage: "download interrupted"
    });

    expect(updated.downloadStatus).toBe("failed");
    expect(updated.errorMessage).toBe("download interrupted");

    store.deleteTask(task.id);

    expect(store.listTasks()).toHaveLength(0);
  });

  it("reconciles a stale downloading task to completed when the resource file exists", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "video-store-"));
    createdPaths.push(rootDir);

    const outputPath = join(rootDir, "data", "downloads", "done.ts");
    const store = createAppStore(join(rootDir, "app.db"), rootDir);
    const [task] = store.createTasks(["https://example.com/video/1"]);
    const resource = store.addResource(task.id, {
      url: "https://cdn.example.com/video.ts",
      format: "m3u8",
      mimeType: "application/vnd.apple.mpegurl",
      referer: task.sourceUrl,
      userAgent: "test-agent",
      cookie: null,
      headers: {},
      titleHint: "done video",
      sizeHint: 1024,
      selected: true
    });

    mkdirSync(join(rootDir, "data", "downloads"), { recursive: true });
    writeFileSync(outputPath, "done");
    store.updateResourceDownloadState(resource.id, {
      downloadStatus: "completed",
      downloadedBytes: 1024,
      totalBytes: 1024,
      speedBytesPerSecond: null,
      outputFilePath: outputPath,
      errorMessage: null
    });
    store.updateTaskStatus(task.id, "downloading");

    const [reconciledTask] = store.listTasks();
    const [managedResource] = store.listManagedResources();

    expect(reconciledTask.status).toBe("completed");
    expect(managedResource.taskStatus).toBe("completed");
  });
});
