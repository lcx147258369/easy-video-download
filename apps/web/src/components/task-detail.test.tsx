// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
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
    const onRevealDownload = vi.fn();
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
              id: "resource-3",
              taskId: "task-1",
              url: "https://cdn.example.com/completed.mp4",
              format: "mp4",
              mimeType: "video/mp4",
              referer: "https://example.com/watch",
              userAgent: null,
              cookie: null,
              headers: {},
              titleHint: "completed video",
              sizeHint: null,
              selected: true,
              downloadStatus: "completed",
              downloadedBytes: 100,
              totalBytes: 100,
              speedBytesPerSecond: null,
              outputFilePath: "/tmp/completed.mp4",
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
        onDownloadSelected={vi.fn()}
        onPreviewDownload={vi.fn()}
        onRevealDownload={onRevealDownload}
        onRetryDownload={vi.fn()}
        onToggleResource={vi.fn()}
        selectedResourceIds={["resource-1", "resource-2"]}
        task={task}
      />
    );

    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("403 Forbidden")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重试下载" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成所选下载任务" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "删除页面任务" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "查看下载文件位置" }));
    expect(onRevealDownload).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "resource-3"
      })
    );
  });

  it("highlights stage logs with visual labels", () => {
    render(
      <TaskDetail
        busy={false}
        detail={{
          task,
          resources: [],
          logs: [
            {
              id: "log-1",
              taskId: "task-1",
              level: "info",
              message: "HLS demo：开始转 MP4",
              createdAt: new Date().toISOString()
            },
            {
              id: "log-2",
              taskId: "task-1",
              level: "error",
              message: "HLS demo：下载失败 - 403 Forbidden",
              createdAt: new Date().toISOString()
            }
          ]
        }}
        onDownloadSelected={vi.fn()}
        onPreviewDownload={vi.fn()}
        onRevealDownload={vi.fn()}
        onRetryDownload={vi.fn()}
        onToggleResource={vi.fn()}
        selectedResourceIds={[]}
        task={task}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "展开日志" }));

    expect(screen.getByText("转 MP4")).toBeInTheDocument();
    expect(screen.getByText("失败")).toBeInTheDocument();
    expect(screen.getByText("HLS demo：开始转 MP4")).toBeInTheDocument();
    expect(screen.getByText("HLS demo：下载失败 - 403 Forbidden")).toBeInTheDocument();
  });
});
