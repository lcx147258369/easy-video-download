// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ManagedVideoItem } from "@video/shared";

import { GlobalDownloadMonitor } from "./global-download-monitor";

function createResource(
  overrides: Partial<ManagedVideoItem> & Pick<ManagedVideoItem, "id" | "taskId">
): ManagedVideoItem {
  return {
    id: overrides.id,
    taskId: overrides.taskId,
    url: overrides.url ?? `https://cdn.example.com/${overrides.id}.mp4`,
    format: overrides.format ?? "mp4",
    mimeType: overrides.mimeType ?? "video/mp4",
    referer: overrides.referer ?? null,
    userAgent: overrides.userAgent ?? null,
    cookie: overrides.cookie ?? null,
    headers: overrides.headers ?? {},
    titleHint: overrides.titleHint ?? overrides.id,
    sizeHint: overrides.sizeHint ?? null,
    selected: overrides.selected ?? true,
    downloadStatus: overrides.downloadStatus ?? "idle",
    downloadedBytes: overrides.downloadedBytes ?? 0,
    totalBytes: overrides.totalBytes ?? null,
    speedBytesPerSecond: overrides.speedBytesPerSecond ?? null,
    outputFilePath: overrides.outputFilePath ?? null,
    errorMessage: overrides.errorMessage ?? null,
    sourceUrl: overrides.sourceUrl ?? `https://example.com/${overrides.taskId}`,
    siteHost: overrides.siteHost ?? "example.com",
    taskStatus: overrides.taskStatus ?? "downloading",
    taskUpdatedAt: overrides.taskUpdatedAt ?? new Date().toISOString(),
    taskErrorMessage: overrides.taskErrorMessage ?? null
  };
}

describe("GlobalDownloadMonitor", () => {
  it("hides idle resources and exposes actions for failed and completed items", () => {
    const onFocusTask = vi.fn();
    const onPreviewDownload = vi.fn();
    const onRetryDownload = vi.fn();
    const onRevealDownload = vi.fn();

    const failedResource = createResource({
      id: "resource-failed",
      taskId: "task-failed",
      titleHint: "failed video",
      downloadStatus: "failed",
      errorMessage: "403 Forbidden",
      taskUpdatedAt: "2026-06-07T12:00:00.000Z"
    });
    const completedResource = createResource({
      id: "resource-completed",
      taskId: "task-completed",
      titleHint: "completed video",
      downloadStatus: "completed",
      downloadedBytes: 1024,
      totalBytes: 1024,
      outputFilePath: "/tmp/completed.mp4",
      taskUpdatedAt: "2026-06-07T11:00:00.000Z"
    });

    render(
      <GlobalDownloadMonitor
        busyIds={new Set()}
        onFocusTask={onFocusTask}
        onPreviewDownload={onPreviewDownload}
        onRevealDownload={onRevealDownload}
        onRetryDownload={onRetryDownload}
        resources={[
          createResource({
            id: "resource-idle",
            taskId: "task-idle",
            titleHint: "idle video",
            downloadStatus: "idle"
          }),
          failedResource,
          completedResource
        ]}
      />
    );

    expect(screen.queryByText("idle video")).not.toBeInTheDocument();
    expect(screen.getByText("failed video")).toBeInTheDocument();
    expect(screen.getByText("completed video")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "定位页面任务" })[0]);
    expect(onFocusTask).toHaveBeenCalledWith("task-failed");

    fireEvent.click(screen.getByRole("button", { name: "重试下载" }));
    expect(onRetryDownload).toHaveBeenCalledWith(failedResource);

    fireEvent.click(screen.getByRole("button", { name: "查看下载内容" }));
    expect(onPreviewDownload).toHaveBeenCalledWith(completedResource);

    fireEvent.click(screen.getByRole("button", { name: "查看下载文件位置" }));
    expect(onRevealDownload).toHaveBeenCalledWith(completedResource);
  });

  it("shows downloading count and disables actions for busy resources", () => {
    render(
      <GlobalDownloadMonitor
        busyIds={new Set(["task-1"])}
        onFocusTask={vi.fn()}
        onPreviewDownload={vi.fn()}
        onRevealDownload={vi.fn()}
        onRetryDownload={vi.fn()}
        resources={[
          createResource({
            id: "resource-1",
            taskId: "task-1",
            titleHint: "downloading video",
            downloadStatus: "downloading",
            downloadedBytes: 512,
            totalBytes: 1024,
            speedBytesPerSecond: 128
          }),
          createResource({
            id: "resource-2",
            taskId: "task-2",
            titleHint: "another downloading video",
            downloadStatus: "downloading"
          })
        ]}
      />
    );

    expect(screen.getByText("后台下载看板")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "定位页面任务" })[0]).toBeDisabled();
  });
});
