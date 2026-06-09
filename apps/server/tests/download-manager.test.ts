import { createCipheriv } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { DetectedResource } from "@video/shared";

describe("download manager", () => {
  const createdPaths: string[] = [];

  afterEach(() => {
    for (const createdPath of createdPaths.splice(0)) {
      rmSync(createdPath, { recursive: true, force: true });
    }
  });

  it("downloads direct files through fetch and writes them to disk", async () => {
    const { createDownloadManager } = await import(
      "../src/downloads/download-manager.js"
    );

    const rootDir = mkdtempSync(join(tmpdir(), "video-download-"));
    createdPaths.push(rootDir);

    const resource: DetectedResource = {
      id: "resource-1",
      taskId: "task-1",
      url: "https://cdn.example.com/movie.mp4",
      format: "mp4",
      mimeType: "video/mp4",
      referer: "https://example.com/watch",
      userAgent: "test-agent",
      cookie: "session=1",
      headers: {
        referer: "https://example.com/watch"
      },
      titleHint: "demo video",
      sizeHint: null,
      selected: true,
      downloadStatus: "idle",
      downloadedBytes: 0,
      totalBytes: null,
      speedBytesPerSecond: null,
      outputFilePath: null,
      errorMessage: null
    };

    const manager = createDownloadManager({
      downloadDirectory: rootDir,
      fetchImpl: async () =>
        new Response("hello world", {
          headers: {
            "content-length": "11"
          }
        }),
      spawnImpl: () => {
        throw new Error("spawn should not be called for direct files");
      }
    });

    const progressUpdates: Array<{ downloadedBytes: number; totalBytes: number | null }> = [];
    const result = await manager.download(resource, {
      onProgress(progress) {
        progressUpdates.push({
          downloadedBytes: progress.downloadedBytes,
          totalBytes: progress.totalBytes
        });
      }
    });

    expect(result.downloadedBytes).toBe(11);
    expect(readFileSync(result.filePath, "utf8")).toBe("hello world");
    expect(result.filePath.endsWith(".mp4")).toBe(true);
    expect(() => readFileSync(`${result.filePath}.part`, "utf8")).toThrow();
    expect(progressUpdates.at(-1)).toEqual({
      downloadedBytes: 11,
      totalBytes: 11
    });
  });

  it("builds yt-dlp arguments for m3u8 downloads", async () => {
    const { buildYtDlpArgs } = await import(
      "../src/downloads/download-manager.js"
    );

    const args = buildYtDlpArgs(
      {
        id: "resource-2",
        taskId: "task-1",
        url: "https://cdn.example.com/master.m3u8",
        format: "m3u8",
        mimeType: "application/vnd.apple.mpegurl",
        referer: "https://example.com/watch",
        userAgent: "test-agent",
        cookie: "session=1",
        headers: {},
        titleHint: "demo video",
        sizeHint: null,
        selected: true,
        downloadStatus: "idle",
        downloadedBytes: 0,
        totalBytes: null,
        speedBytesPerSecond: null,
        outputFilePath: null,
        errorMessage: null
      },
      "/tmp/demo-video.mp4",
      {
        ffmpegExecutable: "/opt/homebrew/bin/ffmpeg"
      }
    );

    expect(args).toContain("https://cdn.example.com/master.m3u8");
    expect(args).toContain("/tmp/demo-video.mp4");
    expect(args).toContain("--merge-output-format");
    expect(args).toContain("mp4");
    expect(args).toContain("--downloader");
    expect(args).toContain("m3u8:native");
    expect(args).toContain("Origin: https://example.com");
  });

  it("builds native hls arguments when ffmpeg is unavailable", async () => {
    const { buildYtDlpArgs } = await import(
      "../src/downloads/download-manager.js"
    );

    const args = buildYtDlpArgs(
      {
        id: "resource-3",
        taskId: "task-1",
        url: "https://cdn.example.com/master.m3u8",
        format: "m3u8",
        mimeType: "application/vnd.apple.mpegurl",
        referer: "https://example.com/watch",
        userAgent: "test-agent",
        cookie: "session=1",
        headers: {},
        titleHint: "demo video",
        sizeHint: null,
        selected: true,
        downloadStatus: "idle",
        downloadedBytes: 0,
        totalBytes: null,
        speedBytesPerSecond: null,
        outputFilePath: null,
        errorMessage: null
      },
      "/tmp/demo-video.ts",
      {
        ffmpegExecutable: null
      }
    );

    expect(args).toContain("--hls-use-mpegts");
    expect(args).not.toContain("--merge-output-format");
  });

  it("prefers homebrew yt-dlp when available", async () => {
    const { resolveExecutablePath } = await import(
      "../src/downloads/download-manager.js"
    );

    const resolved = resolveExecutablePath("yt-dlp", {
      exists: (candidate) => candidate === "/opt/homebrew/bin/yt-dlp"
    });

    expect(resolved).toBe("/opt/homebrew/bin/yt-dlp");
  });

  it("prefers bundled ffmpeg over missing system ffmpeg", async () => {
    const { resolveExecutablePath } = await import(
      "../src/downloads/download-manager.js"
    );

    const resolved = resolveExecutablePath("ffmpeg", {
      bundledPath: "/app/vendor/ffmpeg",
      exists: (candidate) => candidate === "/app/vendor/ffmpeg",
      fallbackToCommand: false
    });

    expect(resolved).toBe("/app/vendor/ffmpeg");
  });

  it("downloads encrypted hls playlists natively without requiring ffmpeg", async () => {
    const { createDownloadManager } = await import(
      "../src/downloads/download-manager.js"
    );

    const rootDir = mkdtempSync(join(tmpdir(), "video-download-"));
    createdPaths.push(rootDir);

    const key = Buffer.from("0123456789abcdef");
    const iv = Buffer.alloc(16);
    iv.writeBigUInt64BE(1n, 8);
    const plainSegment = Buffer.from("demo transport stream payload");
    const cipher = createCipheriv("aes-128-cbc", key, iv);
    const encryptedSegment = Buffer.concat([
      cipher.update(plainSegment),
      cipher.final()
    ]);

    const resource: DetectedResource = {
      id: "resource-4",
      taskId: "task-1",
      url: "https://cdn.example.com/master.m3u8",
      format: "m3u8",
      mimeType: "application/vnd.apple.mpegurl",
      referer: "https://example.com/watch",
      userAgent: "test-agent",
      cookie: null,
      headers: {},
      titleHint: "encrypted playlist",
      sizeHint: null,
      selected: true,
      downloadStatus: "idle",
      downloadedBytes: 0,
      totalBytes: null,
      speedBytesPerSecond: null,
      outputFilePath: null,
      errorMessage: null
    };

    const manager = createDownloadManager({
      downloadDirectory: rootDir,
      ffmpegExecutable: null,
      fetchImpl: async (input) => {
        const url = String(input);
        if (url === resource.url) {
          return new Response(
            [
              "#EXTM3U",
              "#EXT-X-VERSION:3",
              "#EXT-X-MEDIA-SEQUENCE:1",
              '#EXT-X-KEY:METHOD=AES-128,URI="https://cdn.example.com/key"',
              "#EXTINF:10,",
              "segment-1.ts",
              "#EXT-X-ENDLIST"
            ].join("\n"),
            {
              headers: {
                "content-type": "application/vnd.apple.mpegurl"
              }
            }
          );
        }

        if (url === "https://cdn.example.com/key") {
          return new Response(key);
        }

        if (url === "https://cdn.example.com/segment-1.ts") {
          return new Response(encryptedSegment, {
            headers: {
              "content-length": String(encryptedSegment.length)
            }
          });
        }

        throw new Error(`unexpected url ${url}`);
      },
      spawnImpl: () => {
        throw new Error("spawn should not be called for native hls");
      }
    });

    const result = await manager.download(resource);

    expect(result.filePath.endsWith(".ts")).toBe(true);
    expect(readFileSync(result.filePath)).toEqual(plainSegment);
    expect(() => readFileSync(`${result.filePath}.part`)).toThrow();
    expect(result.method).toBe("direct");
  });

  it("remuxes native hls downloads to mp4 when ffmpeg is available", async () => {
    const { createDownloadManager } = await import(
      "../src/downloads/download-manager.js"
    );

    const rootDir = mkdtempSync(join(tmpdir(), "video-download-"));
    createdPaths.push(rootDir);

    const resource: DetectedResource = {
      id: "resource-5",
      taskId: "task-1",
      url: "https://cdn.example.com/master.m3u8",
      format: "m3u8",
      mimeType: "application/vnd.apple.mpegurl",
      referer: "https://example.com/watch",
      userAgent: "test-agent",
      cookie: null,
      headers: {},
      titleHint: "remux playlist",
      sizeHint: null,
      selected: true,
      downloadStatus: "idle",
      downloadedBytes: 0,
      totalBytes: null,
      speedBytesPerSecond: null,
      outputFilePath: null,
      errorMessage: null
    };

    const manager = createDownloadManager({
      downloadDirectory: rootDir,
      ffmpegExecutable: "/opt/homebrew/bin/ffmpeg",
      fetchImpl: async (input) => {
        const url = String(input);
        if (url === resource.url) {
          return new Response(
            [
              "#EXTM3U",
              "#EXT-X-VERSION:3",
              "#EXTINF:10,",
              "segment-1.ts",
              "#EXT-X-ENDLIST"
            ].join("\n"),
            {
              headers: {
                "content-type": "application/vnd.apple.mpegurl"
              }
            }
          );
        }

        if (url === "https://cdn.example.com/segment-1.ts") {
          return new Response("plain transport payload");
        }

        throw new Error(`unexpected url ${url}`);
      },
      spawnImpl: (command, args) => {
        expect(command).toBe("/opt/homebrew/bin/ffmpeg");
        const inputPath = args[args.indexOf("-i") + 1];
        const outputPath = args.at(-1);
        writeFileSync(outputPath!, readFileSync(inputPath));
        return createMockChildProcess();
      }
    });

    const result = await manager.download(resource);

    expect(result.filePath.endsWith(".mp4")).toBe(true);
    expect(readFileSync(result.filePath, "utf8")).toBe("plain transport payload");
    expect(existsSync(`${result.filePath}.ts`)).toBe(false);
    expect(result.method).toBe("remux");
  });

  it("cleans yt-dlp temporary fragments after fallback completes", async () => {
    const { createDownloadManager } = await import(
      "../src/downloads/download-manager.js"
    );

    const rootDir = mkdtempSync(join(tmpdir(), "video-download-"));
    createdPaths.push(rootDir);

    const resource: DetectedResource = {
      id: "resource-6",
      taskId: "task-1",
      url: "https://cdn.example.com/master.m3u8",
      format: "m3u8",
      mimeType: "application/vnd.apple.mpegurl",
      referer: "https://example.com/watch",
      userAgent: "test-agent",
      cookie: null,
      headers: {},
      titleHint: "fallback playlist",
      sizeHint: null,
      selected: true,
      downloadStatus: "idle",
      downloadedBytes: 0,
      totalBytes: null,
      speedBytesPerSecond: null,
      outputFilePath: null,
      errorMessage: null
    };

    const outputPath = join(rootDir, "fallback playlist.ts");

    const manager = createDownloadManager({
      downloadDirectory: rootDir,
      ffmpegExecutable: null,
      fetchImpl: async () => {
        throw new Error("force yt-dlp fallback");
      },
      spawnImpl: () => {
        writeFileSync(outputPath, "merged transport stream");
        writeFileSync(`${outputPath}.ytdl`, "metadata");
        writeFileSync(`${outputPath}-Frag148`, "fragment");
        return createMockChildProcess();
      }
    });

    const result = await manager.download(resource);

    expect(result.method).toBe("yt-dlp");
    expect(readFileSync(result.filePath, "utf8")).toBe("merged transport stream");
    expect(existsSync(`${outputPath}.ytdl`)).toBe(false);
    expect(existsSync(`${outputPath}-Frag148`)).toBe(false);
  });
});

function createMockChildProcess() {
  return {
    stderr: {
      on() {
        return undefined;
      }
    },
    on(event: string, handler: (value?: unknown) => void) {
      if (event === "close") {
        queueMicrotask(() => handler(0));
      }
      return this;
    }
  } as never;
}
