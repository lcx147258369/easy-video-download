import type { ManagedVideoItem } from "@video/shared";
import { Panel } from "./ui/panel";

const metrics = [
  { key: "idle", label: "待下载资源" },
  { key: "downloading", label: "下载中资源" },
  { key: "merging", label: "合并中资源" },
  { key: "remuxing", label: "转 MP4 中资源" },
  { key: "completed", label: "已完成资源" },
  { key: "failed", label: "失败资源" }
] as const;

export function ResourceSummaryStrip({
  resources
}: {
  resources: ManagedVideoItem[];
}) {
  return (
    <Panel className="px-3 py-3 sm:px-4">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {metrics.map((metric) => {
          const count = resources.filter(
            (resource) => resource.downloadStatus === metric.key
          ).length;
          return (
            <article
              key={metric.key}
              className="rounded-[1.2rem] border border-[rgba(23,23,23,0.08)] bg-[rgba(250,250,250,0.82)] px-4 py-3"
            >
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-stone-500">
                {metric.label}
              </p>
              <p className="mt-1 font-display text-2xl font-semibold text-stone-900">
                {count}
              </p>
            </article>
          );
        })}
      </div>
    </Panel>
  );
}
