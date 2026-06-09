// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TaskTable } from "./task-table";

describe("TaskTable", () => {
  it("supports select all and bulk delete", () => {
    const onDeleteSelected = vi.fn();
    const onDeleteTask = vi.fn();
    const onOpenTaskBrowser = vi.fn();
    const onResumeTask = vi.fn();
    const onRetryTask = vi.fn();
    const onToggleAll = vi.fn();
    const onToggleTask = vi.fn();
    const tasks = [
      {
        id: "task-1",
        sourceUrl: "https://example.com/watch",
        status: "failed" as const,
        siteHost: "example.com",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        errorMessage: "no resource"
      }
    ];

    const { rerender } = render(
      <TaskTable
        busyTaskIds={new Set()}
        onDeleteSelected={onDeleteSelected}
        onDeleteTask={onDeleteTask}
        onOpenTaskBrowser={onOpenTaskBrowser}
        onResumeTask={onResumeTask}
        onRetryTask={onRetryTask}
        onSelect={vi.fn()}
        onToggleAll={onToggleAll}
        onToggleTask={onToggleTask}
        resources={[]}
        selectedTaskIds={new Set()}
        selectedTaskId={null}
        tasks={tasks}
      />
    );

    fireEvent.click(screen.getByLabelText("全选"));
    expect(onToggleAll).toHaveBeenCalledTimes(1);

    rerender(
      <TaskTable
        busyTaskIds={new Set()}
        onDeleteSelected={onDeleteSelected}
        onDeleteTask={onDeleteTask}
        onOpenTaskBrowser={onOpenTaskBrowser}
        onResumeTask={onResumeTask}
        onRetryTask={onRetryTask}
        onSelect={vi.fn()}
        onToggleAll={onToggleAll}
        onToggleTask={onToggleTask}
        resources={[]}
        selectedTaskIds={new Set(["task-1"])}
        selectedTaskId={null}
        tasks={tasks}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "删除已选" }));
    expect(onDeleteSelected).toHaveBeenCalledTimes(1);
  });

  it("surfaces page task actions inside the card action area", () => {
    const onDeleteTask = vi.fn();
    const onResumeTask = vi.fn();
    const onRetryTask = vi.fn();

    render(
      <TaskTable
        busyTaskIds={new Set()}
        onDeleteSelected={vi.fn()}
        onDeleteTask={onDeleteTask}
        onOpenTaskBrowser={vi.fn()}
        onResumeTask={onResumeTask}
        onRetryTask={onRetryTask}
        onSelect={vi.fn()}
        onToggleAll={vi.fn()}
        onToggleTask={vi.fn()}
        resources={[]}
        selectedTaskId="task-1"
        selectedTaskIds={new Set()}
        tasks={[
          {
            id: "task-1",
            sourceUrl: "https://example.com/watch",
            status: "failed",
            siteHost: "example.com",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            errorMessage: "no resource"
          }
        ]}
      />
    );

    expect(screen.getByText("失败")).toBeInTheDocument();
    expect(screen.getByText("资源 0")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重试页面任务" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "删除任务" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "删除任务" }));

    expect(onDeleteTask).toHaveBeenCalledWith("task-1");
    expect(onRetryTask).not.toHaveBeenCalled();
    expect(onResumeTask).not.toHaveBeenCalled();
  });
});
