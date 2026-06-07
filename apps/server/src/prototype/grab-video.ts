import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import type { DetectedResource } from "@video/shared";

import { createBrowserManager, type BrowserManager } from "../browser/browser-manager.js";
import { createDownloadManager, type DownloadManager, type DownloadResult } from "../downloads/download-manager.js";
import { detectTaskResources } from "../services/detect-task-resources.js";

export interface GrabVideoPrototypeOptions {
  pageUrl: string;
  profileDirectory: string;
  captureDirectory: string;
  downloadDirectory: string;
  browserExecutablePath?: string | null;
  captureWindowMs?: number;
  headless?: boolean;
}

export interface GrabVideoPrototypeCollaborators {
  browserManager: Pick<BrowserManager, "openSession" | "closeAll">;
  capturePageResources: (context: {
    pageUrl: string;
    page: unknown;
    taskId: string;
    captureWindowMs: number;
  }) => Promise<GrabVideoCaptureResult>;
  downloadManager: Pick<DownloadManager, "download">;
  now: () => Date;
  randomId: () => string;
}

export interface GrabVideoCaptureResult {
  titleHint: string | null;
  needsLogin: boolean;
  networkResources: DetectedResource[];
  domResources: DetectedResource[];
  allResources: DetectedResource[];
}

export interface GrabVideoPrototypeResult {
  taskId: string;
  pageUrl: string;
  selectedResource: DetectedResource;
  allResources: DetectedResource[];
  discoveryMethod: "network" | "dom" | "mixed";
  captureFilePath: string;
  downloadResult: DownloadResult;
}

export function selectPreferredVideoResource(
  resources: DetectedResource[]
): DetectedResource | null {
  if (resources.length === 0) {
    return null;
  }

  return [...resources].sort((left, right) => scoreResource(right) - scoreResource(left))[0];
}

export async function runGrabVideoPrototype(
  options: GrabVideoPrototypeOptions,
  collaborators: Partial<GrabVideoPrototypeCollaborators> = {}
): Promise<GrabVideoPrototypeResult> {
  const runtime = createCollaborators(options, collaborators);
  const taskId = runtime.randomId();
  const session = await runtime.browserManager.openSession({
    siteHost: new URL(options.pageUrl).host,
    url: options.pageUrl
  });

  try {
    const captured = await runtime.capturePageResources({
      pageUrl: options.pageUrl,
      page: session.page,
      taskId,
      captureWindowMs: options.captureWindowMs ?? 2000
    });

    if (captured.needsLogin) {
      throw new Error("page requires login before a downloadable video is visible");
    }

    const selectedResource = selectPreferredVideoResource(captured.allResources);
    if (!selectedResource) {
      throw new Error("no downloadable resource detected");
    }

    const discoveryMethod = detectDiscoveryMethod(captured, selectedResource);
    const downloadResult = await runtime.downloadManager.download(selectedResource);

    mkdirSync(options.captureDirectory, { recursive: true });
    const captureFilePath = join(
      options.captureDirectory,
      `${runtime.now().toISOString().replace(/[:.]/g, "-")}-${taskId}.json`
    );

    writeFileSync(
      captureFilePath,
      JSON.stringify(
        {
          taskId,
          pageUrl: options.pageUrl,
          titleHint: captured.titleHint,
          selectedResource,
          allResources: captured.allResources,
          discoveryMethod,
          downloadResult
        },
        null,
        2
      )
    );

    return {
      taskId,
      pageUrl: options.pageUrl,
      selectedResource,
      allResources: captured.allResources,
      discoveryMethod,
      captureFilePath,
      downloadResult
    };
  } finally {
    await session.close();
    await runtime.browserManager.closeAll();
  }
}

function createCollaborators(
  options: GrabVideoPrototypeOptions,
  collaborators: Partial<GrabVideoPrototypeCollaborators>
): GrabVideoPrototypeCollaborators {
  const browserManager =
    collaborators.browserManager ??
    createBrowserManager({
      profileRootDirectory: options.profileDirectory,
      browserExecutablePath: options.browserExecutablePath ?? null,
      headless: options.headless ?? false
    });

  const downloadManager =
    collaborators.downloadManager ??
    createDownloadManager({
      downloadDirectory: options.downloadDirectory
    });

  return {
    browserManager,
    downloadManager,
    capturePageResources:
      collaborators.capturePageResources ??
      (async ({ page, taskId }) => {
        const result = await detectTaskResources({
          task: {
            id: taskId,
            sourceUrl: options.pageUrl,
            status: "running",
            siteHost: new URL(options.pageUrl).host,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          },
          page
        });

        return {
          titleHint: result.resources[0]?.titleHint ?? null,
          needsLogin: result.status === "needs_login",
          networkResources: result.resources.filter((resource) => hasNetworkHeaders(resource)),
          domResources: result.resources.filter((resource) => !hasNetworkHeaders(resource)),
          allResources: result.resources
        };
      }),
    now: collaborators.now ?? (() => new Date()),
    randomId: collaborators.randomId ?? randomUUID
  };
}

function scoreResource(resource: DetectedResource): number {
  const formatScore =
    resource.format === "mp4"
      ? 300
      : resource.format === "webm"
        ? 200
        : resource.format === "m3u8"
          ? 100
          : 0;
  const headerScore = Object.keys(resource.headers).length * 10;
  const refererScore = resource.referer ? 40 : 0;
  const cookieScore = resource.cookie ? 30 : 0;
  return formatScore + headerScore + refererScore + cookieScore;
}

function detectDiscoveryMethod(
  captured: GrabVideoCaptureResult,
  selectedResource: DetectedResource
): "network" | "dom" | "mixed" {
  if (captured.networkResources.some((resource) => resource.id === selectedResource.id)) {
    return "network";
  }
  if (captured.domResources.some((resource) => resource.id === selectedResource.id)) {
    return "dom";
  }
  return "mixed";
}

function hasNetworkHeaders(resource: DetectedResource): boolean {
  return Boolean(
    resource.cookie ||
      resource.referer ||
      resource.userAgent ||
      Object.keys(resource.headers).length > 0
  );
}
