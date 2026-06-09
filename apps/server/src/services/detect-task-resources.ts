import { randomUUID } from "node:crypto";

import type { DetectedResource, TaskRecord } from "@video/shared";
import type { Page } from "playwright";

import {
  classifyVideoResource,
  extractVideoCandidatesFromCapturedEntries,
  createVideoTrafficCollector,
  dedupeVideoCandidates,
  extractVideoCandidatesFromPerformanceEntries,
  extractVideoCandidatesFromText
} from "../browser/video-detector.js";
import type { DetectionResult } from "../queue/task-queue.js";

interface DomResourceEntry {
  src: string | null;
  currentSrc: string | null;
  type: string | null;
}

interface PerformanceResourceEntrySnapshot {
  name: string;
  initiatorType: string;
}

interface CapturedMediaEntrySnapshot {
  url: string;
  contentType: string | null;
  referer: string | null;
}

interface MediaDetectionSnapshot {
  title: string | null;
  resources: DomResourceEntry[];
  performanceResources: PerformanceResourceEntrySnapshot[];
  inlineMediaText: string;
  capturedMediaEntries: CapturedMediaEntrySnapshot[];
  needsLogin: boolean;
  hasVideoElement: boolean;
}

const MEDIA_DETECTION_TIMEOUT_MS = 10_000;
const MEDIA_DETECTION_POLL_INTERVAL_MS = 500;

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
  await installMediaCaptureHooks(page);
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
    const currentUrl = page.url();
    if (currentUrl !== input.task.sourceUrl) {
      await page
        .goto(input.task.sourceUrl, { waitUntil: "domcontentloaded" })
        .catch(() => undefined);
    }
    await page.waitForLoadState("domcontentloaded", { timeout: 5_000 }).catch(() => undefined);
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
    await page.waitForTimeout(500);
    await attemptAutoplay(page);

    const detectionStartAt = Date.now();
    let lastSnapshot = await collectMediaSnapshot(page);

    while (Date.now() - detectionStartAt <= MEDIA_DETECTION_TIMEOUT_MS) {
      const candidates = buildDetectedCandidates({
        snapshot: lastSnapshot,
        taskId: input.task.id,
        pageUrl: page.url() || input.task.sourceUrl,
        userAgent,
        trafficCandidates: collector.snapshot()
      });
      const downloadableResources = candidates.filter(
        (resource) => !resource.url.startsWith("blob:")
      );

      if (downloadableResources.length > 0) {
        return {
          status: "detected",
          resources: downloadableResources
        };
      }

      await page.waitForTimeout(MEDIA_DETECTION_POLL_INTERVAL_MS);
      lastSnapshot = await collectMediaSnapshot(page);
    }

    const finalCandidates = buildDetectedCandidates({
      snapshot: lastSnapshot,
      taskId: input.task.id,
      pageUrl: page.url() || input.task.sourceUrl,
      userAgent,
      trafficCandidates: collector.snapshot()
    });

    if (finalCandidates.some((resource) => resource.url.startsWith("blob:"))) {
      return {
        status: "failed",
        resources: [],
        message: "detected blob media source, but could not resolve the underlying downloadable url"
      };
    }

    if (lastSnapshot.needsLogin) {
      return {
        status: "needs_login",
        resources: [],
        message: "page appears to require login before media requests are available"
      };
    }

    if (lastSnapshot.hasVideoElement) {
      return {
        status: "failed",
        resources: [],
        message: "video element found, but no downloadable media request was captured within the detection window"
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

async function installMediaCaptureHooks(page: Page): Promise<void> {
  await page.addInitScript(mediaCaptureInitScript).catch(() => undefined);
  await page.evaluate(mediaCaptureInitScript).catch(() => undefined);
}

async function attemptAutoplay(page: Page): Promise<void> {
  await page
    .evaluate(() => {
      const runtime = globalThis as {
        document?: {
          querySelectorAll?(selector: string): Iterable<{
            muted?: boolean;
            playsInline?: boolean;
            play?: () => Promise<void>;
          }>;
        };
      };

      for (const element of runtime.document?.querySelectorAll?.("video") ?? []) {
        try {
          if ("muted" in element) {
            element.muted = true;
          }
          if ("playsInline" in element) {
            element.playsInline = true;
          }
          void element.play?.().catch(() => undefined);
        } catch {
          // Ignore autoplay failures; the polling loop will still rely on
          // live requests, performance entries, and script hints.
        }
      }
    })
    .catch(() => undefined);
}

async function collectMediaSnapshot(page: Page): Promise<MediaDetectionSnapshot> {
  return page.evaluate(() => {
    const runtime = globalThis as {
      document?: {
        title?: string;
        querySelector?(selector: string): unknown;
        querySelectorAll?(selector: string): Iterable<{
          getAttribute(name: string): string | null;
          currentSrc?: string;
          textContent?: string | null;
        }>;
      };
      performance?: {
        getEntriesByType?(type: string): Array<{
          name?: string;
          initiatorType?: string;
        }>;
      };
      __videoCaptureState__?: {
        mediaEntries?: Array<{
          url?: string;
          contentType?: string | null;
          referer?: string | null;
        }>;
      };
    };
    const documentRef = runtime.document;
    const resources = Array.from(
      documentRef?.querySelectorAll?.("video, source[src]") ?? []
    ).map((element) => ({
      src: element.getAttribute("src"),
      currentSrc:
        typeof element.currentSrc === "string" && element.currentSrc.length > 0
          ? element.currentSrc
          : null,
      type: element.getAttribute("type")
    }));
    const performanceResources = Array.from(
      runtime.performance?.getEntriesByType?.("resource") ?? []
    )
      .map((entry) => ({
        name: entry.name ?? "",
        initiatorType: entry.initiatorType ?? ""
      }))
      .filter((entry) => entry.name.length > 0);
    const inlineMediaText = Array.from(
      documentRef?.querySelectorAll?.("script") ?? []
    )
      .map((element) => element.textContent ?? "")
      .join("\n");
    const capturedMediaEntries = Array.from(
      runtime.__videoCaptureState__?.mediaEntries ?? []
    )
      .map((entry) => ({
        url: entry.url ?? "",
        contentType: entry.contentType ?? null,
        referer: entry.referer ?? null
      }))
      .filter((entry) => entry.url.length > 0);

    return {
      title: documentRef?.title ?? null,
      resources,
      performanceResources,
      inlineMediaText,
      capturedMediaEntries,
      needsLogin: Boolean(
        documentRef?.querySelector?.(
          'input[type="password"], form[action*="login" i], button[id*="login" i], button[class*="login" i], [data-testid*="login" i]'
        )
      ),
      hasVideoElement: resources.length > 0
    };
  });
}

function buildDetectedCandidates(input: {
  snapshot: MediaDetectionSnapshot;
  taskId: string;
  pageUrl: string;
  userAgent: string | null;
  trafficCandidates: DetectedResource[];
}): DetectedResource[] {
  const domCandidates = buildDomResources(input.snapshot.resources, {
    taskId: input.taskId,
    pageUrl: input.pageUrl,
    titleHint: input.snapshot.title,
    userAgent: input.userAgent
  });
  const performanceCandidates = extractVideoCandidatesFromPerformanceEntries(
    input.snapshot.performanceResources,
    {
      taskId: input.taskId,
      pageUrl: input.pageUrl,
      titleHint: input.snapshot.title,
      userAgent: input.userAgent
    }
  );
  const inlineCandidates = extractVideoCandidatesFromText(
    input.snapshot.inlineMediaText,
    {
      taskId: input.taskId,
      pageUrl: input.pageUrl,
      titleHint: input.snapshot.title,
      userAgent: input.userAgent
    }
  );
  const capturedCandidates = extractVideoCandidatesFromCapturedEntries(
    input.snapshot.capturedMediaEntries,
    {
      taskId: input.taskId,
      pageUrl: input.pageUrl,
      titleHint: input.snapshot.title,
      userAgent: input.userAgent
    }
  );

  return dedupeVideoCandidates([
    ...input.trafficCandidates,
    ...capturedCandidates,
    ...performanceCandidates,
    ...inlineCandidates,
    ...domCandidates
  ]);
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
    const candidateUrls = [resource.src, resource.currentSrc].filter(
      (value): value is string => Boolean(value)
    );

    for (const candidateUrl of candidateUrls) {
      const resolvedUrl = new URL(candidateUrl, options.pageUrl).toString();
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
  }

  return dedupeVideoCandidates(items);
}

function isPlaywrightPage(value: unknown): value is Page {
  return Boolean(
    value &&
      typeof value === "object" &&
      "addInitScript" in value &&
      "evaluate" in value &&
      "goto" in value &&
      "waitForTimeout" in value &&
      "url" in value
  );
}

function mediaCaptureInitScript(): void {
  const runtime = globalThis as typeof globalThis & {
    __videoCaptureInstalled__?: boolean;
    __videoCaptureState__?: {
      mediaEntries: Array<{
        url: string;
        contentType: string | null;
        referer: string | null;
      }>;
    };
    fetch?: typeof fetch;
    XMLHttpRequest?: {
      prototype: {
        open?: (method: string, url: string, ...args: unknown[]) => unknown;
        send?: (...args: unknown[]) => unknown;
        addEventListener?: (
          type: string,
          listener: (...args: unknown[]) => void
        ) => void;
      };
    };
    URL: typeof URL;
    location?: {
      href?: string;
    };
  };

  if (runtime.__videoCaptureInstalled__) {
    return;
  }
  runtime.__videoCaptureInstalled__ = true;
  runtime.__videoCaptureState__ = runtime.__videoCaptureState__ ?? {
    mediaEntries: []
  };

  const pushEntry = (entry: {
    url: string;
    contentType?: string | null;
    referer?: string | null;
  }) => {
    if (!entry.url) {
      return;
    }
    runtime.__videoCaptureState__?.mediaEntries.push({
      url: entry.url,
      contentType: entry.contentType ?? null,
      referer: entry.referer ?? runtime.location?.href ?? null
    });
  };

  if (typeof runtime.fetch === "function") {
    const originalFetch = runtime.fetch.bind(runtime);
    runtime.fetch = async (...args) => {
      const requestUrl =
        typeof args[0] === "string"
          ? args[0]
          : args[0] instanceof Request
            ? args[0].url
            : "";
      if (requestUrl) {
        pushEntry({
          url: requestUrl
        });
      }
      const response = await originalFetch(...args);
      pushEntry({
        url: response.url || requestUrl,
        contentType: response.headers.get("content-type"),
        referer: runtime.location?.href ?? null
      });
      return response;
    };
  }

  if (runtime.XMLHttpRequest?.prototype) {
    const xhrPrototype = runtime.XMLHttpRequest.prototype;
    const originalOpen = xhrPrototype.open;
    const originalSend = xhrPrototype.send;

    if (typeof originalOpen === "function") {
      xhrPrototype.open = function patchedOpen(
        this: {
          __videoCaptureUrl__?: string;
        },
        method: string,
        url: string,
        ...rest: unknown[]
      ) {
        this.__videoCaptureUrl__ = url;
        return originalOpen.call(this, method, url, ...rest);
      };
    }

    if (typeof originalSend === "function") {
      xhrPrototype.send = function patchedSend(
        this: {
          __videoCaptureUrl__?: string;
          addEventListener: (type: string, listener: () => void) => void;
          responseURL?: string;
          getResponseHeader(name: string): string | null;
        },
        ...rest: unknown[]
      ) {
        this.addEventListener("loadend", () => {
          const responseUrl = this.responseURL || this.__videoCaptureUrl__ || "";
          pushEntry({
            url: responseUrl,
            contentType: this.getResponseHeader("content-type"),
            referer: runtime.location?.href ?? null
          });
        });
        return originalSend.call(this, ...rest);
      };
    }
  }

  if (typeof runtime.URL?.createObjectURL === "function") {
    const originalCreateObjectURL = runtime.URL.createObjectURL.bind(runtime.URL);
    runtime.URL.createObjectURL = function patchedCreateObjectURL(object: unknown) {
      const objectUrl = originalCreateObjectURL(object as Blob);
      const blobType =
        typeof Blob !== "undefined" && object instanceof Blob ? object.type || null : null;
      pushEntry({
        url: objectUrl,
        contentType: blobType,
        referer: runtime.location?.href ?? null
      });
      return objectUrl;
    };
  }
}
