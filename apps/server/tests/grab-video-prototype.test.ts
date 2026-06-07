import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { DetectedResource } from "@video/shared";

describe("grab video prototype", () => {
  const createdPaths: string[] = [];

  afterEach(() => {
    for (const createdPath of createdPaths.splice(0)) {
      rmSync(createdPath, { recursive: true, force: true });
    }
  });

  it("prefers network discovered mp4 resources over lower priority candidates", async () => {
    const { selectPreferredVideoResource } = await import(
      "../src/prototype/grab-video.js"
    );

    const preferred = selectPreferredVideoResource([
      createResource({
        id: "dom-m3u8",
        url: "https://cdn.example.com/master.m3u8",
        format: "m3u8",
        headers: {}
      }),
      createResource({
        id: "network-mp4",
        url: "https://cdn.example.com/movie.mp4",
        format: "mp4",
        headers: {
          referer: "https://example.com/watch"
        }
      }),
      createResource({
        id: "dom-mp4",
        url: "https://cdn.example.com/fallback.mp4",
        format: "mp4",
        headers: {}
      })
    ]);

    expect(preferred).toMatchObject({
      id: "network-mp4",
      url: "https://cdn.example.com/movie.mp4",
      format: "mp4"
    });
  });

  it("captures metadata and downloads the selected resource", async () => {
    const { runGrabVideoPrototype } = await import(
      "../src/prototype/grab-video.js"
    );

    const rootDir = mkdtempSync(join(tmpdir(), "grab-video-prototype-"));
    createdPaths.push(rootDir);

    const selectedResource = createResource({
      id: "resource-1",
      url: "https://cdn.example.com/movie.mp4",
      format: "mp4",
      headers: {
        referer: "https://example.com/watch"
      }
    });
    const downloadedUrls: string[] = [];

    const result = await runGrabVideoPrototype(
      {
        pageUrl: "https://example.com/watch",
        profileDirectory: join(rootDir, "profiles"),
        captureDirectory: join(rootDir, "captures"),
        downloadDirectory: join(rootDir, "downloads"),
        browserExecutablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        captureWindowMs: 25,
        headless: true
      },
      {
        browserManager: {
          async openSession({ siteHost, url }) {
            expect(siteHost).toBe("example.com");
            expect(url).toBe("https://example.com/watch");
            return {
              profileDirectory: join(rootDir, "profiles", siteHost),
              page: {},
              close: async () => {}
            };
          },
          closeAll: async () => {}
        },
        capturePageResources: async () => ({
          titleHint: "Demo Video",
          needsLogin: false,
          networkResources: [selectedResource],
          domResources: [],
          allResources: [selectedResource]
        }),
        downloadManager: {
          async download(resource) {
            downloadedUrls.push(resource.url);
            return {
              filePath: join(rootDir, "downloads", "Demo Video.mp4"),
              downloadedBytes: 42,
              method: "direct" as const
            };
          }
        },
        now: () => new Date("2026-06-01T08:09:10.111Z"),
        randomId: () => "task-123"
      }
    );

    expect(downloadedUrls).toEqual(["https://cdn.example.com/movie.mp4"]);
    expect(result.selectedResource).toMatchObject({
      id: "resource-1",
      format: "mp4"
    });
    expect(result.discoveryMethod).toBe("network");

    const persistedCapture = JSON.parse(
      readFileSync(result.captureFilePath, "utf8")
    ) as {
      pageUrl: string;
      selectedResource: DetectedResource;
      allResources: DetectedResource[];
      discoveryMethod: string;
    };

    expect(persistedCapture.pageUrl).toBe("https://example.com/watch");
    expect(persistedCapture.selectedResource.url).toBe(
      "https://cdn.example.com/movie.mp4"
    );
    expect(persistedCapture.allResources).toHaveLength(1);
    expect(persistedCapture.discoveryMethod).toBe("network");
    expect(result.captureFilePath.endsWith(".json")).toBe(true);
  });
});

function createResource(
  overrides: Partial<DetectedResource> & Pick<DetectedResource, "id" | "url" | "format">
): DetectedResource {
  return {
    id: overrides.id,
    taskId: overrides.taskId ?? "task-1",
    url: overrides.url,
    format: overrides.format,
    mimeType: overrides.mimeType ?? "video/mp4",
    referer: overrides.referer ?? "https://example.com/watch",
    userAgent: overrides.userAgent ?? "test-agent",
    cookie: overrides.cookie ?? null,
    headers: overrides.headers ?? {},
    titleHint: overrides.titleHint ?? "Demo Video",
    sizeHint: overrides.sizeHint ?? null,
    selected: overrides.selected ?? false
  };
}
