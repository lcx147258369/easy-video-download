// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TaskDetail } from "./task-detail";

const task = {
  id: "task-1",
  sourceUrl: "https://example.com/watch",
  status: "downloading" as const,
  siteHost: "example.com",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

describe("TaskDetail", () => {
  it("shows resource download progress and error details", () => {
    render(
      <TaskDetail
        busy={false}
        detail={{
          task,
          resources: [
            {
              id: "resource-1",
              taskId: "task-1",
              url: "https://cdn.example.com/movie.mp4",
              format: "mp4",
              mimeType: "video/mp4",
              referer: "https://example.com/watch",
              userAgent: null,
              cookie: null,
              headers: {},
              titleHint: "demo video",
              sizeHint: null,
              selected: true,
              downloadStatus: "downloading",
              downloadedBytes: 50,
              totalBytes: 100,
              speedBytesPerSecond: 25,
              outputFilePath: null,
              errorMessage: null
            },
            {
              id: "resource-2",
              taskId: "task-1",
              url: "https://cdn.example.com/fail.mp4",
              format: "mp4",
              mimeType: "video/mp4",
              referer: "https://example.com/watch",
              userAgent: null,
              cookie: null,
              headers: {},
              titleHint: "broken video",
              sizeHint: null,
              selected: true,
              downloadStatus: "failed",
              downloadedBytes: 12,
              totalBytes: 100,
              speedBytesPerSecond: null,
              outputFilePath: null,
              errorMessage: "403 Forbidden"
            }
          ],
          logs: []
        }}
        onDelete={vi.fn()}
        onDownloadSelected={vi.fn()}
        onOpenBrowser={vi.fn()}
        onPreviewDownload={vi.fn()}
        onResume={vi.fn()}
        onRetry={vi.fn()}
        onToggleResource={vi.fn()}
        selectedResourceIds={["resource-1", "resource-2"]}
        task={task}
      />
    );

    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("403 Forbidden")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "删除页面任务" })).toBeInTheDocument();
  });
});
