import {
  existsSync,
  mkdirSync,
  renameSync,
  createWriteStream,
  readdirSync,
  rmSync
} from "node:fs";
import { createDecipheriv } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, extname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { spawn as defaultSpawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";

import type {
  DetectedResource,
  ResourceDownloadStatus
} from "@video/shared";

const require = createRequire(import.meta.url);

export interface DownloadManagerOptions {
  downloadDirectory: string;
  fetchImpl?: typeof fetch;
  spawnImpl?: (
    command: string,
    args: string[],
    options: { stdio: "pipe"; env?: NodeJS.ProcessEnv }
  ) => ChildProcess;
  ytDlpExecutable?: string;
  ffmpegExecutable?: string | null;
}

export interface DownloadResult {
  filePath: string;
  downloadedBytes: number;
  totalBytes: number | null;
  method: "direct" | "remux" | "yt-dlp";
}

export interface DownloadProgressSnapshot {
  downloadedBytes: number;
  totalBytes: number | null;
  speedBytesPerSecond: number | null;
}

export interface DownloadManager {
  download(
    resource: DetectedResource,
    options?: {
      onProgress?(snapshot: DownloadProgressSnapshot): void;
      onStatusChange?(snapshot: DownloadStatusSnapshot): void;
    }
  ): Promise<DownloadResult>;
}

type ActiveDownloadStatus = Exclude<
  ResourceDownloadStatus,
  "idle" | "completed" | "failed"
>;

interface DownloadStatusSnapshot {
  status: ActiveDownloadStatus;
  outputFilePath: string | null;
}

export function createDownloadManager(
  options: DownloadManagerOptions
): DownloadManager {
  const fetchImpl = options.fetchImpl ?? fetch;
  const spawnImpl = options.spawnImpl ?? defaultSpawn;
  const ytDlpExecutable =
    options.ytDlpExecutable ??
    resolveExecutablePath("yt-dlp", { fallbackToCommand: true }) ??
    "yt-dlp";
  const ffmpegExecutable =
    options.ffmpegExecutable === undefined
      ? resolveExecutablePath("ffmpeg", {
          bundledPath: resolveBundledFfmpegExecutable(),
          fallbackToCommand: true
        })
      : options.ffmpegExecutable;

  return {
    async download(resource, runtimeOptions) {
      const outputPath = resolveOutputPath(
        options.downloadDirectory,
        resource,
        {
          ffmpegExecutable
        }
      );
      const tempOutputPath = `${outputPath}.part`;
      mkdirSync(dirname(outputPath), { recursive: true });

      if (resource.format === "m3u8") {
        const nativeOutputPath = ffmpegExecutable ? `${outputPath}.ts` : outputPath;
        const nativeTempOutputPath = `${nativeOutputPath}.part`;
        try {
          runtimeOptions?.onStatusChange?.({
            status: "downloading",
            outputFilePath: null
          });
          const hlsResult = await downloadHlsPlaylist({
            resource,
            outputPath: nativeTempOutputPath,
            fetchImpl,
            onProgress: runtimeOptions?.onProgress
          });
          renameSync(nativeTempOutputPath, nativeOutputPath);
          if (ffmpegExecutable) {
            runtimeOptions?.onStatusChange?.({
              status: "remuxing",
              outputFilePath: nativeOutputPath
            });
            await remuxToMp4(
              ffmpegExecutable,
              spawnImpl,
              nativeOutputPath,
              outputPath
            );
            cleanupTemporaryArtifacts(nativeOutputPath);
            cleanupTemporaryArtifacts(outputPath);
            rmSync(nativeOutputPath, { force: true });
            return {
              filePath: outputPath,
              downloadedBytes: hlsResult.downloadedBytes,
              totalBytes: hlsResult.totalBytes,
              method: "remux"
            };
          }
          cleanupTemporaryArtifacts(nativeOutputPath);
          cleanupTemporaryArtifacts(outputPath);
          return {
            filePath: outputPath,
            downloadedBytes: hlsResult.downloadedBytes,
            totalBytes: hlsResult.totalBytes,
            method: "direct"
          };
        } catch (nativeError) {
          runtimeOptions?.onStatusChange?.({
            status: "merging",
            outputFilePath: outputPath
          });
          await runYtDlp(
            ytDlpExecutable,
            spawnImpl,
            resource,
            outputPath,
            { ffmpegExecutable }
          );
          cleanupTemporaryArtifacts(outputPath);
        }
        return {
          filePath: outputPath,
          downloadedBytes: 0,
          totalBytes: null,
          method: "yt-dlp"
        };
      }

      runtimeOptions?.onStatusChange?.({
        status: "downloading",
        outputFilePath: null
      });
      const response = await fetchImpl(resource.url, {
        headers: buildRequestHeaders(resource)
      });

      if (!response.ok) {
        throw new Error(`download failed with status ${response.status}`);
      }

      if (!response.body) {
        throw new Error("download response has no body");
      }

      let downloadedBytes = 0;
      const totalBytesHeader = response.headers.get("content-length");
      const totalBytes = totalBytesHeader ? Number(totalBytesHeader) : null;
      const startedAt = Date.now();
      const reader = Readable.fromWeb(response.body as never);
      reader.on("data", (chunk: Buffer) => {
        downloadedBytes += chunk.length;
        runtimeOptions?.onProgress?.({
          downloadedBytes,
          totalBytes,
          speedBytesPerSecond: calculateSpeed(downloadedBytes, startedAt)
        });
      });

      await pipeline(reader, createWriteStream(tempOutputPath));
      renameSync(tempOutputPath, outputPath);

      return {
        filePath: outputPath,
        downloadedBytes,
        totalBytes,
        method: "direct"
      };
    }
  };
}

export function buildYtDlpArgs(
  resource: DetectedResource,
  outputPath: string,
  options: {
    ffmpegExecutable: string | null;
  }
): string[] {
  const args = [
    "--no-playlist",
    "--newline",
    "--no-part",
    "--downloader",
    "m3u8:native",
    ...buildHeaderArgs(resource),
  ];

  if (options.ffmpegExecutable) {
    args.push(
      "--ffmpeg-location",
      dirname(options.ffmpegExecutable),
      "--merge-output-format",
      "mp4"
    );
  } else {
    args.push("--hls-use-mpegts");
  }

  args.push("-o", outputPath, resource.url);
  return args;
}

function resolveOutputPath(
  downloadDirectory: string,
  resource: DetectedResource,
  options: {
    ffmpegExecutable: string | null;
  }
): string {
  const sourceName = extractSourceName(resource.url);
  const baseName = sanitizeFileName(
    resource.titleHint?.trim() || sourceName || `video-${resource.id}`
  );
  const extension =
    resource.format === "m3u8"
      ? options.ffmpegExecutable
        ? ".mp4"
        : ".ts"
      : resource.format === "webm"
        ? ".webm"
        : resource.format === "mp4"
          ? ".mp4"
          : extname(sourceName) || ".bin";

  return join(downloadDirectory, `${baseName}${extension}`);
}

function extractSourceName(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    return pathname.split("/").filter(Boolean).pop() || "";
  } catch {
    return "";
  }
}

function sanitizeFileName(input: string): string {
  return input
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function buildRequestHeaders(resource: DetectedResource): Record<string, string> {
  const headers = buildForwardedHeaders(resource);

  if (resource.referer) {
    headers.referer = resource.referer;
    try {
      headers.origin = new URL(resource.referer).origin;
    } catch {
      // Ignore invalid referer values.
    }
  }
  if (resource.userAgent) {
    headers["user-agent"] = resource.userAgent;
  }
  if (resource.cookie) {
    headers.cookie = resource.cookie;
  }
  headers["accept-encoding"] = "identity";

  return headers;
}

function buildHeaderArgs(resource: DetectedResource): string[] {
  const requestHeaders = buildRequestHeaders(resource);
  const args: string[] = [];

  for (const [key, value] of Object.entries(requestHeaders)) {
    if (!value) {
      continue;
    }
    if (key.toLowerCase() === "user-agent") {
      args.push("--user-agent", value);
      continue;
    }
    args.push("--add-header", `${formatHeaderName(key)}: ${value}`);
  }

  return args;
}

function runYtDlp(
  executable: string,
  spawnImpl: NonNullable<DownloadManagerOptions["spawnImpl"]>,
  resource: DetectedResource,
  outputPath: string,
  options: {
    ffmpegExecutable: string | null;
  }
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawnImpl(
      executable,
      buildYtDlpArgs(resource, outputPath, options),
      {
        stdio: "pipe",
        env: buildChildEnv(executable, options.ffmpegExecutable)
      }
    );

    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        reject(
          new Error(
            `无法找到 ${executable}。请确认已安装 yt-dlp，或把它加入 PATH。`
          )
        );
        return;
      }
      reject(error);
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `yt-dlp exited with code ${code}`));
    });
  });
}

function remuxToMp4(
  executable: string,
  spawnImpl: NonNullable<DownloadManagerOptions["spawnImpl"]>,
  inputPath: string,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawnImpl(
      executable,
      [
        "-y",
        "-i",
        inputPath,
        "-c",
        "copy",
        "-movflags",
        "+faststart",
        outputPath
      ],
      {
        stdio: "pipe",
        env: buildChildEnv(executable, executable)
      }
    );

    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        reject(
          new Error(
            `无法找到 ${executable}。请确认已安装 ffmpeg，或把它加入 PATH。`
          )
        );
        return;
      }
      reject(error);
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `ffmpeg exited with code ${code}`));
    });
  });
}

function calculateSpeed(downloadedBytes: number, startedAt: number): number | null {
  const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 0.001);
  return Math.round(downloadedBytes / elapsedSeconds);
}

export function resolveExecutablePath(
  name: "yt-dlp" | "ffmpeg",
  options: {
    exists?: (candidate: string) => boolean;
    fallbackToCommand?: boolean;
    bundledPath?: string | null;
  } = {}
): string | null {
  const exists = options.exists ?? existsSync;
  const fallbackToCommand = options.fallbackToCommand ?? false;
  const candidates =
    name === "yt-dlp"
      ? ["/opt/homebrew/bin/yt-dlp", "/usr/local/bin/yt-dlp", "yt-dlp"]
      : ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "ffmpeg"];

  const found = candidates.find((candidate) =>
    candidate.includes("/") ? exists(candidate) : false
  );

  if (options.bundledPath && exists(options.bundledPath)) {
    return options.bundledPath;
  }

  if (found) {
    return found;
  }

  return fallbackToCommand ? name : null;
}

function buildChildEnv(
  executable: string,
  ffmpegExecutable: string | null
): NodeJS.ProcessEnv {
  const extraPaths = new Set<string>();
  for (const candidate of [
    executable.includes("/") ? dirname(executable) : null,
    ffmpegExecutable && ffmpegExecutable.includes("/") ? dirname(ffmpegExecutable) : null,
    "/opt/homebrew/bin",
    "/usr/local/bin"
  ]) {
    if (candidate) {
      extraPaths.add(candidate);
    }
  }

  const currentPath = process.env.PATH ?? "";
  return {
    ...process.env,
    PATH: `${Array.from(extraPaths).join(":")}:${currentPath}`
  };
}

function resolveBundledFfmpegExecutable(): string | null {
  try {
    const resolved = require("ffmpeg-static") as string | null;
    return typeof resolved === "string" && resolved.length > 0 ? resolved : null;
  } catch {
    return null;
  }
}

async function downloadHlsPlaylist(input: {
  resource: DetectedResource;
  outputPath: string;
  fetchImpl: typeof fetch;
  onProgress?(snapshot: DownloadProgressSnapshot): void;
}): Promise<{ downloadedBytes: number; totalBytes: number | null }> {
  const headers = buildRequestHeaders(input.resource);
  const keyCache = new Map<string, Buffer>();
  const plan = await resolveHlsPlan(input.resource.url, headers, input.fetchImpl);
  const writer = createWriteStream(input.outputPath);
  let downloadedBytes = 0;

  try {
    if (plan.initSegmentUrl) {
      const initSegment = await fetchBinary(plan.initSegmentUrl, headers, input.fetchImpl);
      await writeChunk(writer, initSegment);
      downloadedBytes += initSegment.length;
      input.onProgress?.({
        downloadedBytes,
        totalBytes: null,
        speedBytesPerSecond: null
      });
    }

    for (const segment of plan.segments) {
      const encryptedSegment = await fetchBinary(segment.url, headers, input.fetchImpl);
      const decryptedSegment = await maybeDecryptSegment(
        encryptedSegment,
        segment,
        headers,
        input.fetchImpl,
        keyCache
      );

      await writeChunk(writer, decryptedSegment);
      downloadedBytes += decryptedSegment.length;
      input.onProgress?.({
        downloadedBytes,
        totalBytes: null,
        speedBytesPerSecond: null
      });
    }
  } finally {
    writer.end();
    await once(writer, "close").catch(() => undefined);
  }

  return {
    downloadedBytes,
    totalBytes: null
  };
}

async function resolveHlsPlan(
  url: string,
  headers: Record<string, string>,
  fetchImpl: typeof fetch
): Promise<{
  initSegmentUrl: string | null;
  segments: Array<{
    url: string;
    sequence: number;
    key: {
      method: "AES-128";
      uri: string;
      ivHex?: string;
    } | null;
  }>;
}> {
  const playlist = await fetchText(url, headers, fetchImpl);
  const parsed = parseHlsManifest(playlist, url);

  if (parsed.kind === "master") {
    const variant = selectPreferredVariant(parsed.variants);
    return resolveHlsPlan(variant.url, headers, fetchImpl);
  }

  return parsed;
}

function parseHlsManifest(
  manifest: string,
  baseUrl: string
):
  | {
      kind: "master";
      variants: Array<{
        url: string;
        bandwidth: number;
        averageBandwidth: number;
        resolutionWidth: number;
        resolutionHeight: number;
        codecs: string;
      }>;
    }
  | {
      kind: "media";
      initSegmentUrl: string | null;
      segments: Array<{
        url: string;
        sequence: number;
        key: {
          method: "AES-128";
          uri: string;
          ivHex?: string;
        } | null;
      }>;
    } {
  const lines = manifest.split(/\r?\n/).map((line) => line.trim());
  const variants: Array<{
    url: string;
    bandwidth: number;
    averageBandwidth: number;
    resolutionWidth: number;
    resolutionHeight: number;
    codecs: string;
  }> = [];
  const segments: Array<{
    url: string;
    sequence: number;
    key: {
      method: "AES-128";
      uri: string;
      ivHex?: string;
    } | null;
  }> = [];

  let mediaSequence = 0;
  let currentKey: {
    method: "AES-128";
    uri: string;
    ivHex?: string;
  } | null = null;
  let initSegmentUrl: string | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) continue;

    if (line.startsWith("#EXT-X-MEDIA-SEQUENCE:")) {
      mediaSequence = Number(line.split(":")[1] ?? "0");
      continue;
    }

    if (line.startsWith("#EXT-X-STREAM-INF:")) {
      const nextLine = lines[index + 1];
      if (!nextLine || nextLine.startsWith("#")) continue;
      const attrs = parseAttributeList(line.slice("#EXT-X-STREAM-INF:".length));
      const resolution = parseResolution(attrs.RESOLUTION);
      variants.push({
        url: new URL(nextLine, baseUrl).toString(),
        bandwidth: Number(attrs.BANDWIDTH ?? "0"),
        averageBandwidth: Number(attrs["AVERAGE-BANDWIDTH"] ?? attrs.BANDWIDTH ?? "0"),
        resolutionWidth: resolution.width,
        resolutionHeight: resolution.height,
        codecs: attrs.CODECS ?? ""
      });
      continue;
    }

    if (line.startsWith("#EXT-X-KEY:")) {
      const attrs = parseAttributeList(line.slice("#EXT-X-KEY:".length));
      if (attrs.METHOD === "AES-128" && attrs.URI) {
        currentKey = {
          method: "AES-128",
          uri: new URL(attrs.URI, baseUrl).toString(),
          ivHex: attrs.IV?.replace(/^0x/i, "")
        };
      } else {
        currentKey = null;
      }
      continue;
    }

    if (line.startsWith("#EXT-X-MAP:")) {
      const attrs = parseAttributeList(line.slice("#EXT-X-MAP:".length));
      if (attrs.URI) {
        initSegmentUrl = new URL(attrs.URI, baseUrl).toString();
      }
      continue;
    }

    if (!line.startsWith("#")) {
      segments.push({
        url: new URL(line, baseUrl).toString(),
        sequence: mediaSequence + segments.length,
        key: currentKey
      });
    }
  }

  if (variants.length > 0) {
    return {
      kind: "master",
      variants
    };
  }

  return {
    kind: "media",
    initSegmentUrl,
    segments
  };
}

function parseAttributeList(input: string): Record<string, string> {
  const entries: string[] = [];
  let current = "";
  let inQuotes = false;

  for (const char of input) {
    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
      continue;
    }
    if (char === "," && !inQuotes) {
      if (current.trim()) {
        entries.push(current.trim());
      }
      current = "";
      continue;
    }
    current += char;
  }

  if (current.trim()) {
    entries.push(current.trim());
  }

  return Object.fromEntries(
    entries.map((entry) => {
      const [key, ...rest] = entry.split("=");
      return [key.trim(), rest.join("=").replace(/^"|"$/g, "")];
    })
  );
}

async function fetchText(
  url: string,
  headers: Record<string, string>,
  fetchImpl: typeof fetch
): Promise<string> {
  const response = await fetchImpl(url, { headers });
  if (!response.ok) {
    throw new Error(`HLS playlist request failed with status ${response.status}`);
  }
  return response.text();
}

async function fetchBinary(
  url: string,
  headers: Record<string, string>,
  fetchImpl: typeof fetch
): Promise<Buffer> {
  const response = await fetchImpl(url, { headers });
  if (!response.ok) {
    throw new Error(`HLS segment request failed with status ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function maybeDecryptSegment(
  segment: Buffer,
  metadata: {
    sequence: number;
    key: {
      method: "AES-128";
      uri: string;
      ivHex?: string;
    } | null;
  },
  headers: Record<string, string>,
  fetchImpl: typeof fetch,
  keyCache: Map<string, Buffer>
): Promise<Buffer> {
  if (!metadata.key) {
    return segment;
  }

  const key =
    keyCache.get(metadata.key.uri) ??
    (await fetchBinary(metadata.key.uri, headers, fetchImpl));
  keyCache.set(metadata.key.uri, key);

  const iv = metadata.key.ivHex
    ? Buffer.from(metadata.key.ivHex.padStart(32, "0"), "hex")
    : deriveSegmentIv(metadata.sequence);

  const decipher = createDecipheriv("aes-128-cbc", key, iv);
  return Buffer.concat([decipher.update(segment), decipher.final()]);
}

function deriveSegmentIv(sequence: number): Buffer {
  const buffer = Buffer.alloc(16);
  buffer.writeBigUInt64BE(BigInt(sequence), 8);
  return buffer;
}

async function writeChunk(stream: ReturnType<typeof createWriteStream>, chunk: Buffer): Promise<void> {
  if (stream.write(chunk)) {
    return;
  }
  await once(stream, "drain");
}

function buildForwardedHeaders(resource: DetectedResource): Record<string, string> {
  const allowed = new Set([
    "accept",
    "accept-language",
    "cookie",
    "referer",
    "origin",
    "user-agent",
    "sec-ch-ua",
    "sec-ch-ua-mobile",
    "sec-ch-ua-platform",
    "authorization"
  ]);

  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(resource.headers)) {
    if (!value) continue;
    if (!allowed.has(key.toLowerCase())) continue;
    headers[key.toLowerCase()] = value;
  }
  return headers;
}

function formatHeaderName(key: string): string {
  return key
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("-");
}

function parseResolution(value: string | undefined): {
  width: number;
  height: number;
} {
  if (!value) {
    return {
      width: 0,
      height: 0
    };
  }

  const [width, height] = value.split("x").map((part) => Number(part));
  return {
    width: Number.isFinite(width) ? width : 0,
    height: Number.isFinite(height) ? height : 0
  };
}

function selectPreferredVariant(
  variants: Array<{
    url: string;
    bandwidth: number;
    averageBandwidth: number;
    resolutionWidth: number;
    resolutionHeight: number;
    codecs: string;
  }>
): {
  url: string;
  bandwidth: number;
  averageBandwidth: number;
  resolutionWidth: number;
  resolutionHeight: number;
  codecs: string;
} {
  return [...variants].sort((left, right) => {
    const resolutionDiff =
      right.resolutionWidth * right.resolutionHeight -
      left.resolutionWidth * left.resolutionHeight;
    if (resolutionDiff !== 0) {
      return resolutionDiff;
    }

    const bandwidthDiff = right.averageBandwidth - left.averageBandwidth;
    if (bandwidthDiff !== 0) {
      return bandwidthDiff;
    }

    const codecDiff = scoreCodecs(right.codecs) - scoreCodecs(left.codecs);
    if (codecDiff !== 0) {
      return codecDiff;
    }

    return right.bandwidth - left.bandwidth;
  })[0];
}

function scoreCodecs(codecs: string): number {
  const value = codecs.toLowerCase();
  if (value.includes("av01")) {
    return 4;
  }
  if (value.includes("hvc1") || value.includes("hev1")) {
    return 3;
  }
  if (value.includes("avc1")) {
    return 2;
  }
  if (value.includes("vp9")) {
    return 1;
  }
  return 0;
}

function cleanupTemporaryArtifacts(outputPath: string): void {
  const artifacts = [`${outputPath}.part`, `${outputPath}.ytdl`];
  for (const artifact of artifacts) {
    rmSync(artifact, { force: true });
  }

  const directory = dirname(outputPath);
  const fileName = outputPath.split("/").pop() ?? outputPath;
  if (!existsSync(directory)) {
    return;
  }

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile()) {
      continue;
    }
    if (!entry.name.startsWith(`${fileName}-Frag`)) {
      continue;
    }
    rmSync(join(directory, entry.name), { force: true });
  }
}
