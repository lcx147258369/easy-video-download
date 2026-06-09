import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { createBrowserManager } from "./browser/browser-manager.js";
import { createDownloadManager } from "./downloads/download-manager.js";
import { createAppServer, createEventHub } from "./http/app-server.js";
import { createAppStore } from "./persistence/app-store.js";
import { createTaskQueue } from "./queue/task-queue.js";
import { detectTaskResources } from "./services/detect-task-resources.js";

const execFileAsync = promisify(execFile);

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const store = createAppStore(join(rootDirectory, "data", "app.db"), rootDirectory);
const eventHub = createEventHub();
const settings = store.getSettings();
const browserManager = createBrowserManager({
  profileRootDirectory: settings.profileDirectory,
  browserExecutablePath:
    process.env.CHROME_EXECUTABLE_PATH ??
    settings.browserExecutablePath ??
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless:
    process.env.CHROME_HEADLESS != null
      ? process.env.CHROME_HEADLESS !== "false"
      : settings.headless
});

const queue = createTaskQueue({
  store,
  browserManager,
  detectResources: detectTaskResources,
  downloadResource: async (resource) => {
    const runtimeSettings = store.getSettings();
    const downloadManager = createDownloadManager({
      downloadDirectory: runtimeSettings.downloadDirectory
    });
    return downloadManager.download(resource);
  },
  autoDownload: () => store.getSettings().autoDownload,
  publishEvent: eventHub.publish
});

const { app } = createAppServer({
  store,
  queue,
  browserManager,
  eventHub,
  staticDirectory: join(rootDirectory, "apps", "web", "dist"),
  pickDirectory: pickDirectoryWithOsDialog,
  revealFileInOs: revealFileInFinder
});

const port = Number(process.env.PORT ?? 4318);

const server = app.listen(port, () => {
  console.log(`server listening on http://localhost:${port}`);
});

let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`received ${signal}, closing browser contexts...`);

  try {
    await browserManager.closeAll();
  } catch (error) {
    console.error("failed to close browser contexts cleanly", error);
  }

  server.close(() => {
    process.exit(0);
  });

  setTimeout(() => {
    process.exit(1);
  }, 5_000).unref();
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}

async function pickDirectoryWithOsDialog(): Promise<string | null> {
  const script = `
    tell application "System Events"
      activate
      try
        set chosenFolder to choose folder with prompt "选择下载目录"
        POSIX path of chosenFolder
      on error number -128
        return ""
      end try
    end tell
  `;

  const { stdout } = await execFileAsync("osascript", ["-e", script]);
  const directoryPath = stdout.trim();
  return directoryPath.length > 0 ? directoryPath.replace(/\/$/, "") : null;
}

async function revealFileInFinder(filePath: string): Promise<void> {
  await execFileAsync("open", ["-R", filePath]);
}
