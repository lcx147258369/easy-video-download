export interface AppSettings {
  downloadDirectory: string;
  profileDirectory: string;
  maxConcurrentDownloads: number;
  autoDownload: boolean;
  detectionTimeoutMs: number;
  browserExecutablePath: string | null;
  headless: boolean;
}

export function createDefaultSettings(baseDirectory = "."): AppSettings {
  return {
    downloadDirectory: joinPath(baseDirectory, "data", "downloads"),
    profileDirectory: joinPath(baseDirectory, "data", "profiles"),
    maxConcurrentDownloads: 2,
    autoDownload: true,
    detectionTimeoutMs: 15_000,
    browserExecutablePath: null,
    headless: true
  };
}

function joinPath(...parts: string[]): string {
  return parts
    .filter(Boolean)
    .join("/")
    .replace(/\/+/g, "/")
    .replace(/\/\.\//g, "/");
}
