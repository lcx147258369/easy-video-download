import { randomUUID } from "node:crypto";

import type { DetectedResource } from "@video/shared";

export interface VideoResourceProbe {
  url: string;
  contentType?: string | null;
}

export interface DomVideoExtractionOptions {
  taskId: string;
  pageUrl: string;
  userAgent?: string | null;
}

export interface VideoDomElement {
  getAttribute(name: string): string | null;
}

export interface VideoDomDocument {
  querySelectorAll(selector: string): Iterable<VideoDomElement>;
  title: string;
}

export interface VideoRequestLike {
  url(): string;
  headers(): Record<string, string>;
}

export interface VideoResponseLike {
  url(): string;
  headers(): Record<string, string>;
  request(): VideoRequestLike;
}

export interface VideoTrafficPageLike {
  on(event: "request", listener: (request: VideoRequestLike) => void): void;
  on(event: "response", listener: (response: VideoResponseLike) => void): void;
  off(event: "request", listener: (request: VideoRequestLike) => void): void;
  off(event: "response", listener: (response: VideoResponseLike) => void): void;
}

export interface VideoTrafficCollector {
  start(): void;
  stop(): void;
  snapshot(): DetectedResource[];
}

export interface VideoPerformanceResourceEntry {
  name: string;
  initiatorType?: string;
}

export interface VideoCapturedMediaEntry {
  url: string;
  contentType?: string | null;
  referer?: string | null;
}

export interface VideoResourceClassification {
  url: string;
  format: DetectedResource["format"];
  mimeType: string | null;
}

const EXTENSION_FORMATS: Array<[RegExp, DetectedResource["format"]]> = [
  [/\.(mp4)(?:$|\?)/i, "mp4"],
  [/\.(webm)(?:$|\?)/i, "webm"],
  [/\.(m3u8)(?:$|\?)/i, "m3u8"]
];

const MIME_FORMATS: Array<[RegExp, DetectedResource["format"]]> = [
  [/video\/mp4/i, "mp4"],
  [/video\/webm/i, "webm"],
  [/application\/vnd\.apple\.mpegurl/i, "m3u8"],
  [/application\/x-mpegurl/i, "m3u8"]
];

export function classifyVideoResource(
  probe: VideoResourceProbe
): VideoResourceClassification | null {
  const mimeType = probe.contentType ?? inferMimeTypeFromUrl(probe.url);
  const format =
    detectFormatFromContentType(probe.contentType ?? null) ??
    detectFormatFromUrl(probe.url) ??
    null;

  if (!format && !isVideoMimeType(mimeType)) {
    return null;
  }

  return {
    url: probe.url,
    format: format ?? "unknown",
    mimeType
  };
}

export function extractDomVideoCandidates(
  document: VideoDomDocument,
  options: DomVideoExtractionOptions
): DetectedResource[] {
  const candidates: DetectedResource[] = [];

  const mediaElements = [
    ...document.querySelectorAll("video[src]"),
    ...document.querySelectorAll("source[src]")
  ];

  for (const element of mediaElements) {
    const src = element.getAttribute("src");
    if (!src) {
      continue;
    }

    const resolvedUrl = new URL(src, options.pageUrl).toString();
    const classification =
      classifyVideoResource({
        url: resolvedUrl,
        contentType: element.getAttribute("type")
      }) ?? {
        url: resolvedUrl,
        format: "unknown" as const,
        mimeType: element.getAttribute("type")
      };

    candidates.push({
      id: randomUUID(),
      taskId: options.taskId,
      url: classification.url,
      format: classification.format,
      mimeType: classification.mimeType,
      referer: options.pageUrl,
      userAgent: options.userAgent ?? null,
      cookie: null,
      headers: {},
      titleHint: document.title || null,
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

  return dedupeVideoCandidates(candidates);
}

export function extractVideoCandidatesFromPerformanceEntries(
  entries: VideoPerformanceResourceEntry[],
  options: DomVideoExtractionOptions & {
    titleHint?: string | null;
  }
): DetectedResource[] {
  const candidates: DetectedResource[] = [];

  for (const entry of entries) {
    const classification = classifyVideoResource({
      url: entry.name
    });
    if (!classification) {
      continue;
    }

    candidates.push({
      id: randomUUID(),
      taskId: options.taskId,
      url: classification.url,
      format: classification.format,
      mimeType: classification.mimeType,
      referer: options.pageUrl,
      userAgent: options.userAgent ?? null,
      cookie: null,
      headers: {},
      titleHint: options.titleHint ?? null,
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

  return dedupeVideoCandidates(candidates);
}

export function extractVideoCandidatesFromCapturedEntries(
  entries: VideoCapturedMediaEntry[],
  options: DomVideoExtractionOptions & {
    titleHint?: string | null;
  }
): DetectedResource[] {
  const candidates: DetectedResource[] = [];

  for (const entry of entries) {
    const classification = classifyVideoResource({
      url: entry.url,
      contentType: entry.contentType ?? null
    });
    if (!classification) {
      continue;
    }

    candidates.push({
      id: randomUUID(),
      taskId: options.taskId,
      url: classification.url,
      format: classification.format,
      mimeType: classification.mimeType,
      referer: entry.referer ?? options.pageUrl,
      userAgent: options.userAgent ?? null,
      cookie: null,
      headers: {},
      titleHint: options.titleHint ?? null,
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

  return dedupeVideoCandidates(candidates);
}

export function extractVideoCandidatesFromText(
  text: string,
  options: DomVideoExtractionOptions & {
    titleHint?: string | null;
  }
): DetectedResource[] {
  const normalized = text
    .replace(/\\u002F/gi, "/")
    .replace(/\\\//g, "/")
    .replace(/&amp;/gi, "&");
  const matches =
    normalized.match(
      /https?:\/\/[^\s"'`<>]+?\.(?:m3u8|mp4|webm)(?:\?[^"'`\s<>]*)?/gi
    ) ?? [];
  const candidates: DetectedResource[] = [];

  for (const rawMatch of matches) {
    const url = rawMatch.replace(/[),.;]+$/g, "");
    const classification = classifyVideoResource({ url });
    if (!classification) {
      continue;
    }

    candidates.push({
      id: randomUUID(),
      taskId: options.taskId,
      url: classification.url,
      format: classification.format,
      mimeType: classification.mimeType,
      referer: options.pageUrl,
      userAgent: options.userAgent ?? null,
      cookie: null,
      headers: {},
      titleHint: options.titleHint ?? null,
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

  return dedupeVideoCandidates(candidates);
}

export function dedupeVideoCandidates(
  candidates: DetectedResource[]
): DetectedResource[] {
  const seen = new Set<string>();
  const deduped: DetectedResource[] = [];

  for (const candidate of candidates) {
    const key = `${candidate.url}|${candidate.format}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(candidate);
  }

  return deduped;
}

export function createVideoTrafficCollector(
  page: VideoTrafficPageLike,
  options: DomVideoExtractionOptions
): VideoTrafficCollector {
  const candidates: DetectedResource[] = [];

  const handleRequest = (request: VideoRequestLike) => {
    const classification = classifyVideoResource({
      url: request.url(),
      contentType: headerValue(request.headers(), "content-type")
    });
    if (!classification) {
      return;
    }

    candidates.push({
      id: randomUUID(),
      taskId: options.taskId,
      url: classification.url,
      format: classification.format,
      mimeType: classification.mimeType,
      referer: headerValue(request.headers(), "referer") ?? options.pageUrl,
      userAgent: options.userAgent ?? null,
      cookie: headerValue(request.headers(), "cookie"),
      headers: request.headers(),
      titleHint: null,
      sizeHint: null,
      selected: false,
      downloadStatus: "idle",
      downloadedBytes: 0,
      totalBytes: null,
      speedBytesPerSecond: null,
      outputFilePath: null,
      errorMessage: null
    });
  };

  const handleResponse = (response: VideoResponseLike) => {
    const request = response.request();
    const classification = classifyVideoResource({
      url: response.url(),
      contentType: headerValue(response.headers(), "content-type")
    });
    if (!classification) {
      return;
    }

    candidates.push({
      id: randomUUID(),
      taskId: options.taskId,
      url: classification.url,
      format: classification.format,
      mimeType: classification.mimeType,
      referer: headerValue(request.headers(), "referer") ?? options.pageUrl,
      userAgent: options.userAgent ?? null,
      cookie: headerValue(request.headers(), "cookie"),
      headers: {
        ...request.headers(),
        ...response.headers()
      },
      titleHint: null,
      sizeHint: null,
      selected: false,
      downloadStatus: "idle",
      downloadedBytes: 0,
      totalBytes: null,
      speedBytesPerSecond: null,
      outputFilePath: null,
      errorMessage: null
    });
  };

  return {
    start() {
      page.on("request", handleRequest);
      page.on("response", handleResponse);
    },
    stop() {
      page.off("request", handleRequest);
      page.off("response", handleResponse);
    },
    snapshot() {
      return dedupeVideoCandidates(candidates);
    }
  };
}

function detectFormatFromUrl(url: string): DetectedResource["format"] | null {
  const pathname = safePathname(url);
  for (const [pattern, format] of EXTENSION_FORMATS) {
    if (pattern.test(pathname)) {
      return format;
    }
  }
  return null;
}

function detectFormatFromContentType(
  contentType: string | null
): DetectedResource["format"] | null {
  if (!contentType) {
    return null;
  }

  for (const [pattern, format] of MIME_FORMATS) {
    if (pattern.test(contentType)) {
      return format;
    }
  }

  return null;
}

function isVideoMimeType(contentType: string | null): boolean {
  return Boolean(contentType && /^(video\/|application\/vnd\.apple\.mpegurl|application\/x-mpegurl)/i.test(contentType));
}

function inferMimeTypeFromUrl(url: string): string | null {
  const pathname = safePathname(url);
  if (/\.(mp4)(?:$|\?)/i.test(pathname)) {
    return "video/mp4";
  }
  if (/\.(webm)(?:$|\?)/i.test(pathname)) {
    return "video/webm";
  }
  if (/\.(m3u8)(?:$|\?)/i.test(pathname)) {
    return "application/vnd.apple.mpegurl";
  }
  return null;
}

function safePathname(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function headerValue(
  headers: Record<string, string>,
  key: string
): string | null {
  const foundKey = Object.keys(headers).find(
    (candidate) => candidate.toLowerCase() === key.toLowerCase()
  );
  return foundKey ? headers[foundKey] : null;
}
