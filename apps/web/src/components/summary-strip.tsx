import type { TaskRecord } from "@video/shared";

const metrics = [
  { key: "pending", label: "待处理" },
  { key: "running", label: "活跃任务" },
  { key: "completed", label: "已完成" },
  { key: "failed", label: "失败" }
] as const;

export function SummaryStrip({ tasks }: { tasks: TaskRecord[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => {
        const count = tasks.filter((task) => task.status === metric.key).length;
        return (
          <article
            key={metric.key}
            className="rounded-[1.35rem] border border-white/10 bg-white/[0.04] px-4 py-4"
          >
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-ink-200/80">
              {metric.label}
            </p>
            <p className="mt-2 font-display text-3xl font-semibold text-ink-100">
              {count}
            </p>
          </article>
        );
      })}
    </div>
  );
}
