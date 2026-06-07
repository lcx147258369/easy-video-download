// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TaskTable } from "./task-table";

describe("TaskTable", () => {
  it("supports select all and bulk delete", () => {
    const onDeleteSelected = vi.fn();
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
        onDeleteSelected={onDeleteSelected}
        onSelect={vi.fn()}
        onToggleAll={onToggleAll}
        onToggleTask={onToggleTask}
        resources={[]}
        selectedTaskIds={new Set()}
        selectedTaskId={null}
        tasks={tasks}
      />
    );

    fireEvent.click(screen.getByLabelText("全选页面任务"));
    expect(onToggleAll).toHaveBeenCalledTimes(1);

    rerender(
      <TaskTable
        onDeleteSelected={onDeleteSelected}
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

});
