import { randomUUID } from "node:crypto";

import type { DetectedResource, TaskRecord } from "@video/shared";
import type { Page } from "playwright";

import {
  classifyVideoResource,
  createVideoTrafficCollector,
  dedupeVideoCandidates
} from "../browser/video-detector.js";
import type { DetectionResult } from "../queue/task-queue.js";

interface DomResourceEntry {
  src: string | null;
  type: string | null;
}

export async function detectTaskResources(input: {
  task: TaskRecord;
  page: unknown;
}): Promise<DetectionResult> {
  if (!isPlaywrightPage(input.page)) {
    return {
      status: "failed",
      resources: [],
      message: "invalid browser page"
    };
  }

  const page = input.page;
  const userAgent = await page
    .evaluate(() => {
      const runtime = globalThis as { navigator?: { userAgent?: string } };
      return runtime.navigator?.userAgent ?? null;
    })
    .catch(() => null as string | null);

  const collector = createVideoTrafficCollector(page, {
    taskId: input.task.id,
    pageUrl: input.task.sourceUrl,
    userAgent
  });

  collector.start();

  try {
    await page.waitForLoadState("domcontentloaded", { timeout: 5_000 }).catch(() => undefined);
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
    await page.waitForTimeout(1_000);

    const domSnapshot = await page.evaluate(() => {
      const runtime = globalThis as {
        document?: {
          title?: string;
          querySelector?(selector: string): unknown;
          querySelectorAll?(selector: string): Iterable<{
            getAttribute(name: string): string | null;
          }>;
        };
      };
      const documentRef = runtime.document;
      const resources = Array.from(
        documentRef?.querySelectorAll?.("video[src], source[src]") ?? []
      ).map((element) => ({
        src: element.getAttribute("src"),
        type: element.getAttribute("type")
      }));

      return {
        title: documentRef?.title ?? null,
        resources,
        needsLogin: Boolean(
          documentRef?.querySelector?.(
            'input[type="password"], form[action*="login" i], button[id*="login" i], button[class*="login" i], [data-testid*="login" i]'
          )
        )
      };
    });

    const domCandidates = buildDomResources(domSnapshot.resources, {
      taskId: input.task.id,
      pageUrl: page.url() || input.task.sourceUrl,
      titleHint: domSnapshot.title,
      userAgent
    });
    const resources = dedupeVideoCandidates([
      ...collector.snapshot(),
      ...domCandidates
    ]);

    if (resources.length > 0) {
      return {
        status: "detected",
        resources
      };
    }

    if (domSnapshot.needsLogin) {
      return {
        status: "needs_login",
        resources: [],
        message: "page appears to require login before media requests are available"
      };
    }

    return {
      status: "failed",
      resources: [],
      message: "no video resources detected"
    };
  } catch (error) {
    return {
      status: "failed",
      resources: [],
      message: error instanceof Error ? error.message : "unknown detection error"
    };
  } finally {
    collector.stop();
  }
}

function buildDomResources(
  resources: DomResourceEntry[],
  options: {
    taskId: string;
    pageUrl: string;
    titleHint: string | null;
    userAgent: string | null;
  }
): DetectedResource[] {
  const items: DetectedResource[] = [];

  for (const resource of resources) {
    if (!resource.src) {
      continue;
    }

    const resolvedUrl = new URL(resource.src, options.pageUrl).toString();
    const classification =
      classifyVideoResource({
        url: resolvedUrl,
        contentType: resource.type
      }) ?? {
        url: resolvedUrl,
        format: "unknown" as const,
        mimeType: resource.type
      };

    items.push({
      id: randomUUID(),
      taskId: options.taskId,
      url: classification.url,
      format: classification.format,
      mimeType: classification.mimeType,
      referer: options.pageUrl,
      userAgent: options.userAgent,
      cookie: null,
      headers: {},
      titleHint: options.titleHint,
      sizeHint: null,
      selected: false,
      downloadStatus: "idle",
      downloadedBytes: 0,
      totalBytes: null,
      speedBytesPerSecond: null,
      outputFilePath: null,
      errorMessage: null
    });
  }

  return items;
}

function isPlaywrightPage(value: unknown): value is Page {
  return Boolean(
    value &&
      typeof value === "object" &&
      "evaluate" in value &&
      "waitForTimeout" in value &&
      "url" in value
  );
}
