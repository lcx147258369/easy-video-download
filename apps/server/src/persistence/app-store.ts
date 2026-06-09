import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";

import {
  createDefaultSettings,
  parseTaskUrlInput,
  type DetectedResource,
  type AppSettings,
  type ManagedVideoItem,
  type TaskLogEntry,
  type TaskRecord
} from "@video/shared";

type TaskRow = {
  id: string;
  source_url: string;
  status: TaskRecord["status"];
  title: string | null;
  site_host: string;
  created_at: string;
  updated_at: string;
  error_message: string | null;
};

type ResourceRow = {
  id: string;
  task_id: string;
  url: string;
  format: DetectedResource["format"];
  mime_type: string | null;
  referer: string | null;
  user_agent: string | null;
  cookie: string | null;
  headers_json: string;
  title_hint: string | null;
  size_hint: number | null;
  selected: number;
  download_status: DetectedResource["downloadStatus"];
  downloaded_bytes: number;
  total_bytes: number | null;
  speed_bytes_per_second: number | null;
  output_file_path: string | null;
  error_message: string | null;
  created_at: string;
};

type LogRow = {
  id: string;
  task_id: string;
  level: TaskLogEntry["level"];
  message: string;
  created_at: string;
};

export interface TaskDetail {
  task: TaskRecord;
  resources: DetectedResource[];
  logs: TaskLogEntry[];
}

type ResourceStateFields = Pick<
  DetectedResource,
  | "downloadStatus"
  | "downloadedBytes"
  | "totalBytes"
  | "speedBytesPerSecond"
  | "outputFilePath"
  | "errorMessage"
>;

type NewResourceInput = Omit<
  DetectedResource,
  "id" | "taskId" | keyof ResourceStateFields
> &
  Partial<ResourceStateFields>;

const SETTINGS_KEY = 1;

export interface AppStore {
  getSettings(): AppSettings;
  saveSettings(settings: AppSettings): AppSettings;
  createTasks(urls: string[]): TaskRecord[];
  listTasks(): TaskRecord[];
  listManagedResources(): ManagedVideoItem[];
  deleteTask(taskId: string): void;
  deleteResource(resourceId: string): void;
  updateTaskStatus(
    taskId: string,
    status: TaskRecord["status"],
    errorMessage?: string | null
  ): TaskRecord;
  clearTaskResources(taskId: string): void;
  updateResourceDownloadState(
    resourceId: string,
    state: ResourceStateFields
  ): DetectedResource;
  addResource(taskId: string, resource: NewResourceInput): DetectedResource;
  addTaskLog(taskId: string, level: TaskLogEntry["level"], message: string): TaskLogEntry;
  getTaskDetail(taskId: string): TaskDetail;
}

export function createAppStore(databasePath: string, baseDirectory = process.cwd()): AppStore {
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  initializeSchema(database, baseDirectory);

  return {
    getSettings() {
      return readSettings(database, baseDirectory);
    },
    saveSettings(settings) {
      return writeSettings(database, settings);
    },
    createTasks(urls) {
      return insertTasks(database, urls);
    },
    listTasks() {
      return readTasks(database);
    },
    listManagedResources() {
      return readManagedResources(database);
    },
    deleteTask(taskId) {
      deleteTask(database, taskId);
    },
    deleteResource(resourceId) {
      deleteResource(database, resourceId);
    },
    updateTaskStatus(taskId, status, errorMessage) {
      return writeTaskStatus(database, taskId, status, errorMessage ?? null);
    },
    clearTaskResources(taskId) {
      deleteTaskResources(database, taskId);
    },
    updateResourceDownloadState(resourceId, state) {
      return writeResourceDownloadState(database, resourceId, state);
    },
    addResource(taskId, resource) {
      return insertResource(database, taskId, resource);
    },
    addTaskLog(taskId, level, message) {
      return insertTaskLog(database, taskId, level, message);
    },
    getTaskDetail(taskId) {
      return readTaskDetail(database, taskId);
    }
  };
}

function initializeSchema(database: DatabaseSync, baseDirectory: string): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      payload TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      source_url TEXT NOT NULL,
      status TEXT NOT NULL,
      title TEXT,
      site_host TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      error_message TEXT
    );

    CREATE TABLE IF NOT EXISTS resources (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      url TEXT NOT NULL,
      format TEXT NOT NULL,
      mime_type TEXT,
      referer TEXT,
      user_agent TEXT,
      cookie TEXT,
      headers_json TEXT NOT NULL,
      title_hint TEXT,
      size_hint INTEGER,
      selected INTEGER NOT NULL,
      download_status TEXT NOT NULL DEFAULT 'idle',
      downloaded_bytes INTEGER NOT NULL DEFAULT 0,
      total_bytes INTEGER,
      speed_bytes_per_second INTEGER,
      output_file_path TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS task_logs (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      level TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );
  `);

  ensureColumn(database, "resources", "download_status", "TEXT NOT NULL DEFAULT 'idle'");
  ensureColumn(database, "resources", "downloaded_bytes", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(database, "resources", "total_bytes", "INTEGER");
  ensureColumn(database, "resources", "speed_bytes_per_second", "INTEGER");
  ensureColumn(database, "resources", "output_file_path", "TEXT");
  ensureColumn(database, "resources", "error_message", "TEXT");

  const defaultSettings = createDefaultSettings(baseDirectory);
  const statement = database.prepare(
    "INSERT OR IGNORE INTO app_settings (id, payload) VALUES (?, ?)"
  );
  statement.run(SETTINGS_KEY, JSON.stringify(defaultSettings));
}

function readSettings(database: DatabaseSync, baseDirectory: string): AppSettings {
  const row = database
    .prepare("SELECT payload FROM app_settings WHERE id = ?")
    .get(SETTINGS_KEY) as { payload: string } | undefined;

  if (!row) {
    const settings = createDefaultSettings(baseDirectory);
    writeSettings(database, settings);
    return settings;
  }

  return normalizeSettings({
    ...createDefaultSettings(baseDirectory),
    ...(JSON.parse(row.payload) as Partial<AppSettings>)
  });
}

function writeSettings(database: DatabaseSync, settings: AppSettings): AppSettings {
  const normalized = normalizeSettings(settings);
  database
    .prepare("UPDATE app_settings SET payload = ? WHERE id = ?")
    .run(JSON.stringify(normalized), SETTINGS_KEY);
  return normalized;
}

function normalizeSettings(settings: AppSettings): AppSettings {
  return {
    ...settings,
    autoDownload: true
  };
}

function insertTasks(database: DatabaseSync, urls: string[]): TaskRecord[] {
  const normalizedUrls = parseTaskUrlInput(urls.join("\n"));
  const now = new Date().toISOString();
  const insert = database.prepare(`
    INSERT INTO tasks (id, source_url, status, title, site_host, created_at, updated_at, error_message)
    VALUES (@id, @sourceUrl, @status, @title, @siteHost, @createdAt, @updatedAt, @errorMessage)
  `);

  const tasks: TaskRecord[] = [];
  database.exec("BEGIN");
  try {
    for (const sourceUrl of normalizedUrls) {
      const task: TaskRecord = {
        id: randomUUID(),
        sourceUrl,
        status: "pending",
        title: undefined,
        siteHost: new URL(sourceUrl).host,
        createdAt: now,
        updatedAt: now,
        errorMessage: undefined
      };

      insert.run({
        id: task.id,
        sourceUrl: task.sourceUrl,
        status: task.status,
        title: task.title ?? null,
        siteHost: task.siteHost,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        errorMessage: task.errorMessage ?? null
      });
      tasks.push(task);
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  return tasks;
}

function readTasks(database: DatabaseSync): TaskRecord[] {
  const rows = database
    .prepare(
      "SELECT id, source_url, status, title, site_host, created_at, updated_at, error_message FROM tasks ORDER BY created_at ASC"
    )
    .all() as TaskRow[];

  return rows.map((row) => mapTaskRow(reconcileTaskRow(database, row)));
}

function insertResource(
  database: DatabaseSync,
  taskId: string,
  resource: NewResourceInput
): DetectedResource {
  const createdAt = new Date().toISOString();
  const record: DetectedResource = {
    id: randomUUID(),
    taskId,
    ...resource,
    downloadStatus: resource.downloadStatus ?? "idle",
    downloadedBytes: resource.downloadedBytes ?? 0,
    totalBytes: resource.totalBytes ?? null,
    speedBytesPerSecond: resource.speedBytesPerSecond ?? null,
    outputFilePath: resource.outputFilePath ?? null,
    errorMessage: resource.errorMessage ?? null
  };

  database
    .prepare(
      `
        INSERT INTO resources (
          id, task_id, url, format, mime_type, referer, user_agent, cookie,
          headers_json, title_hint, size_hint, selected, download_status,
          downloaded_bytes, total_bytes, speed_bytes_per_second, output_file_path,
          error_message, created_at
        ) VALUES (
          @id, @taskId, @url, @format, @mimeType, @referer, @userAgent, @cookie,
          @headersJson, @titleHint, @sizeHint, @selected, @downloadStatus,
          @downloadedBytes, @totalBytes, @speedBytesPerSecond, @outputFilePath,
          @errorMessage, @createdAt
        )
      `
    )
    .run({
      id: record.id,
      taskId: record.taskId,
      url: record.url,
      format: record.format,
      mimeType: record.mimeType,
      referer: record.referer,
      userAgent: record.userAgent,
      cookie: record.cookie,
      headersJson: JSON.stringify(record.headers),
      titleHint: record.titleHint,
      sizeHint: record.sizeHint,
      selected: record.selected ? 1 : 0,
      downloadStatus: record.downloadStatus,
      downloadedBytes: record.downloadedBytes,
      totalBytes: record.totalBytes,
      speedBytesPerSecond: record.speedBytesPerSecond,
      outputFilePath: record.outputFilePath,
      errorMessage: record.errorMessage,
      createdAt
    });

  return record;
}

function writeTaskStatus(
  database: DatabaseSync,
  taskId: string,
  status: TaskRecord["status"],
  errorMessage: string | null
): TaskRecord {
  const updatedAt = new Date().toISOString();
  const result = database
    .prepare(
      `
        UPDATE tasks
        SET status = ?, updated_at = ?, error_message = ?
        WHERE id = ?
      `
    )
    .run(status, updatedAt, errorMessage, taskId);

  if (result.changes === 0) {
    throw new Error(`task not found: ${taskId}`);
  }

  const task = database
    .prepare(
      "SELECT id, source_url, status, title, site_host, created_at, updated_at, error_message FROM tasks WHERE id = ?"
    )
    .get(taskId) as TaskRow | undefined;

  if (!task) {
    throw new Error(`task not found after update: ${taskId}`);
  }

  return {
    id: task.id,
    sourceUrl: task.source_url,
    status: task.status,
    title: task.title ?? undefined,
    siteHost: task.site_host,
    createdAt: task.created_at,
    updatedAt: task.updated_at,
    errorMessage: task.error_message ?? undefined
  };
}

function deleteTaskResources(database: DatabaseSync, taskId: string): void {
  database.prepare("DELETE FROM resources WHERE task_id = ?").run(taskId);
}

function deleteTask(database: DatabaseSync, taskId: string): void {
  database.exec("BEGIN");
  try {
    database.prepare("DELETE FROM task_logs WHERE task_id = ?").run(taskId);
    database.prepare("DELETE FROM resources WHERE task_id = ?").run(taskId);
    database.prepare("DELETE FROM tasks WHERE id = ?").run(taskId);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function deleteResource(database: DatabaseSync, resourceId: string): void {
  const taskRow = database
    .prepare("SELECT task_id FROM resources WHERE id = ?")
    .get(resourceId) as { task_id: string } | undefined;

  if (!taskRow) {
    return;
  }

  database.prepare("DELETE FROM resources WHERE id = ?").run(resourceId);

  const remaining = database
    .prepare("SELECT COUNT(*) AS count FROM resources WHERE task_id = ?")
    .get(taskRow.task_id) as { count: number };

  if (remaining.count === 0) {
    deleteTask(database, taskRow.task_id);
  }
}

function insertTaskLog(
  database: DatabaseSync,
  taskId: string,
  level: TaskLogEntry["level"],
  message: string
): TaskLogEntry {
  const log: TaskLogEntry = {
    id: randomUUID(),
    taskId,
    level,
    message,
    createdAt: new Date().toISOString()
  };

  database
    .prepare(
      `
        INSERT INTO task_logs (id, task_id, level, message, created_at)
        VALUES (@id, @taskId, @level, @message, @createdAt)
      `
    )
    .run({
      id: log.id,
      taskId: log.taskId,
      level: log.level,
      message: log.message,
      createdAt: log.createdAt
    });

  return log;
}

function readTaskDetail(database: DatabaseSync, taskId: string): TaskDetail {
  const task = database
    .prepare(
      "SELECT id, source_url, status, title, site_host, created_at, updated_at, error_message FROM tasks WHERE id = ?"
    )
    .get(taskId) as TaskRow | undefined;

  if (!task) {
    throw new Error(`task not found: ${taskId}`);
  }

  const settings = readSettings(database, ".");

  const resourceRows = database
    .prepare(
      `
        SELECT id, task_id, url, format, mime_type, referer, user_agent, cookie,
               headers_json, title_hint, size_hint, selected, created_at,
               download_status, downloaded_bytes, total_bytes, speed_bytes_per_second,
               output_file_path, error_message
        FROM resources
        WHERE task_id = ?
        ORDER BY created_at ASC
      `
    )
    .all(taskId) as ResourceRow[];

  const resources = resourceRows
    .map(mapResourceRow)
    .map((resource) =>
      reconcileResourceRow(database, resource, settings.downloadDirectory)
    )
    .filter(isQueueableResource);

  const reconciledTask = reconcileTaskRow(
    database,
    readTaskRow(database, taskId) ?? task
  );

  const logRows = database
    .prepare(
      `
        SELECT id, task_id, level, message, created_at
        FROM task_logs
        WHERE task_id = ?
        ORDER BY created_at ASC
      `
    )
    .all(taskId) as LogRow[];

  return {
    task: mapTaskRow(reconciledTask),
    resources,
    logs: logRows.map((row) => ({
      id: row.id,
      taskId: row.task_id,
      level: row.level,
      message: row.message,
      createdAt: row.created_at
    }))
  };
}

function readManagedResources(database: DatabaseSync): ManagedVideoItem[] {
  const settings = readSettings(database, ".");
  const rows = database
    .prepare(
      `
        SELECT
          r.id,
          r.task_id,
          r.url,
          r.format,
          r.mime_type,
          r.referer,
          r.user_agent,
          r.cookie,
          r.headers_json,
          r.title_hint,
          r.size_hint,
          r.selected,
          r.download_status,
          r.downloaded_bytes,
          r.total_bytes,
          r.speed_bytes_per_second,
          r.output_file_path,
          r.error_message,
          t.source_url,
          t.site_host,
          t.status,
          t.updated_at,
          t.error_message AS task_error_message
        FROM resources r
        JOIN tasks t ON t.id = r.task_id
        ORDER BY t.created_at DESC, r.created_at DESC
      `
    )
    .all() as Array<
      ResourceRow & {
        source_url: string;
        site_host: string;
        status: TaskRecord["status"];
        updated_at: string;
        task_error_message: string | null;
      }
    >;

  const reconciledResources = rows.map((row) => ({
    row,
    resource: reconcileResourceRow(
      database,
      mapResourceRow(row),
      settings.downloadDirectory
    )
  }));

  const tasks = new Map<string, TaskRow>();
  for (const row of database
    .prepare(
      "SELECT id, source_url, status, title, site_host, created_at, updated_at, error_message FROM tasks"
    )
    .all() as TaskRow[]) {
    tasks.set(row.id, reconcileTaskRow(database, row));
  }

  return reconciledResources
    .map(({ row, resource }) => ({
      ...resource,
      sourceUrl: row.source_url,
      siteHost: row.site_host,
      taskStatus: tasks.get(row.task_id)?.status ?? row.status,
      taskUpdatedAt: tasks.get(row.task_id)?.updated_at ?? row.updated_at,
      taskErrorMessage: tasks.get(row.task_id)?.error_message ?? row.task_error_message
    }))
    .filter(isQueueableResource);
}

function writeResourceDownloadState(
  database: DatabaseSync,
  resourceId: string,
  state: ResourceStateFields
): DetectedResource {
  const result = database
    .prepare(
      `
        UPDATE resources
        SET download_status = ?,
            downloaded_bytes = ?,
            total_bytes = ?,
            speed_bytes_per_second = ?,
            output_file_path = ?,
            error_message = ?
        WHERE id = ?
      `
    )
    .run(
      state.downloadStatus,
      state.downloadedBytes,
      state.totalBytes,
      state.speedBytesPerSecond,
      state.outputFilePath,
      state.errorMessage,
      resourceId
    );

  if (result.changes === 0) {
    throw new Error(`resource not found: ${resourceId}`);
  }

  const row = database
    .prepare(
      `
        SELECT id, task_id, url, format, mime_type, referer, user_agent, cookie,
               headers_json, title_hint, size_hint, selected, created_at,
               download_status, downloaded_bytes, total_bytes, speed_bytes_per_second,
               output_file_path, error_message
        FROM resources
        WHERE id = ?
      `
    )
    .get(resourceId) as (ResourceRow & {
      download_status: DetectedResource["downloadStatus"];
      downloaded_bytes: number;
      total_bytes: number | null;
      speed_bytes_per_second: number | null;
      output_file_path: string | null;
      error_message: string | null;
    }) | undefined;

  if (!row) {
    throw new Error(`resource not found after update: ${resourceId}`);
  }

  return {
    id: row.id,
    taskId: row.task_id,
    url: row.url,
    format: row.format,
    mimeType: row.mime_type,
    referer: row.referer,
    userAgent: row.user_agent,
    cookie: row.cookie,
    headers: JSON.parse(row.headers_json) as Record<string, string>,
    titleHint: row.title_hint,
    sizeHint: row.size_hint,
    selected: row.selected === 1,
    downloadStatus: row.download_status,
    downloadedBytes: row.downloaded_bytes,
    totalBytes: row.total_bytes,
    speedBytesPerSecond: row.speed_bytes_per_second,
    outputFilePath: row.output_file_path,
    errorMessage: row.error_message
  };
}

function ensureColumn(
  database: DatabaseSync,
  tableName: string,
  columnName: string,
  definition: string
): void {
  try {
    database.exec(
      `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`
    );
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.includes("duplicate column name")
    ) {
      throw error;
    }
  }
}

function mapResourceRow(row: ResourceRow): DetectedResource {
  return {
    id: row.id,
    taskId: row.task_id,
    url: row.url,
    format: row.format,
    mimeType: row.mime_type,
    referer: row.referer,
    userAgent: row.user_agent,
    cookie: row.cookie,
    headers: JSON.parse(row.headers_json) as Record<string, string>,
    titleHint: row.title_hint,
    sizeHint: row.size_hint,
    selected: row.selected === 1,
    downloadStatus: row.download_status ?? "idle",
    downloadedBytes: row.downloaded_bytes ?? 0,
    totalBytes: row.total_bytes ?? null,
    speedBytesPerSecond: row.speed_bytes_per_second ?? null,
    outputFilePath: row.output_file_path ?? null,
    errorMessage: row.error_message ?? null
  };
}

function reconcileResourceRow(
  database: DatabaseSync,
  resource: DetectedResource,
  downloadDirectory: string
): DetectedResource {
  if (
    resource.downloadStatus !== "downloading" &&
    resource.downloadStatus !== "merging" &&
    resource.downloadStatus !== "remuxing"
  ) {
    return resource;
  }

  const outputPath =
    resource.outputFilePath ?? findExistingOutputPath(resource, downloadDirectory);
  if (!outputPath) {
    return resource;
  }

  if (resource.downloadStatus === "remuxing") {
    const finalOutputPath = findExpectedCompletedOutputPath(resource, downloadDirectory);
    if (finalOutputPath && existsSync(finalOutputPath)) {
      const stats = statSync(finalOutputPath);
      return writeResourceDownloadState(database, resource.id, {
        downloadStatus: "completed",
        downloadedBytes: Number(stats.size),
        totalBytes: Number(stats.size),
        speedBytesPerSecond: null,
        outputFilePath: finalOutputPath,
        errorMessage: null
      });
    }

    if (!existsSync(outputPath)) {
      if (!hasRecentDownloadActivity(outputPath)) {
        return writeResourceDownloadState(database, resource.id, {
          downloadStatus: "failed",
          downloadedBytes: resource.downloadedBytes,
          totalBytes: resource.totalBytes,
          speedBytesPerSecond: null,
          outputFilePath: null,
          errorMessage: resource.errorMessage ?? "下载中断，请重试该资源"
        });
      }
      return {
        ...resource,
        outputFilePath: outputPath
      };
    }

    if (hasRecentDownloadActivity(outputPath)) {
      return {
        ...resource,
        outputFilePath: outputPath
      };
    }

    return writeResourceDownloadState(database, resource.id, {
      downloadStatus: "failed",
      downloadedBytes: Number(statSync(outputPath).size),
      totalBytes: resource.totalBytes,
      speedBytesPerSecond: null,
      outputFilePath: outputPath,
      errorMessage: resource.errorMessage ?? "下载中断，请重试该资源"
    });
  }

  if (hasTemporaryArtifacts(outputPath)) {
    if (hasRecentDownloadActivity(outputPath)) {
      return {
        ...resource,
        outputFilePath: outputPath
      };
    }

    const completedBytes = existsSync(outputPath) ? Number(statSync(outputPath).size) : 0;
    return writeResourceDownloadState(database, resource.id, {
      downloadStatus: "failed",
      downloadedBytes: completedBytes,
      totalBytes: resource.totalBytes,
      speedBytesPerSecond: null,
      outputFilePath: existsSync(outputPath) ? outputPath : null,
      errorMessage: resource.errorMessage ?? "下载中断，请重试该资源"
    });
  }

  if (!existsSync(outputPath)) {
    if (!hasRecentDownloadActivity(outputPath)) {
      return writeResourceDownloadState(database, resource.id, {
        downloadStatus: "failed",
        downloadedBytes: resource.downloadedBytes,
        totalBytes: resource.totalBytes,
        speedBytesPerSecond: null,
        outputFilePath: null,
        errorMessage: resource.errorMessage ?? "下载中断，请重试该资源"
      });
    }
    return {
      ...resource,
      outputFilePath: outputPath
    };
  }

  const stats = statSync(outputPath);
  return writeResourceDownloadState(database, resource.id, {
    downloadStatus: "completed",
    downloadedBytes: Number(stats.size),
    totalBytes: Number(stats.size),
    speedBytesPerSecond: null,
    outputFilePath: outputPath,
    errorMessage: null
  });
}

function findExpectedCompletedOutputPath(
  resource: DetectedResource,
  downloadDirectory: string
): string | null {
  const sourceName = extractSourceName(resource.url);
  const baseName = sanitizeFileName(
    resource.titleHint?.trim() || sourceName || `video-${resource.id}`
  );

  if (resource.format === "m3u8") {
    return join(downloadDirectory, `${baseName}.mp4`);
  }
  if (resource.format === "webm") {
    return join(downloadDirectory, `${baseName}.webm`);
  }
  if (resource.format === "mp4") {
    return join(downloadDirectory, `${baseName}.mp4`);
  }
  return join(downloadDirectory, `${baseName}.bin`);
}

function isQueueableResource(resource: Pick<DetectedResource, "url" | "format">): boolean {
  if (resource.url.startsWith("blob:")) {
    return false;
  }

  if (resource.format === "unknown") {
    return /^https?:\/\//i.test(resource.url);
  }

  return true;
}

function findExistingOutputPath(
  resource: DetectedResource,
  downloadDirectory: string
): string | null {
  const sourceName = extractSourceName(resource.url);
  const baseName = sanitizeFileName(
    resource.titleHint?.trim() || sourceName || `video-${resource.id}`
  );
  const candidates =
    resource.format === "m3u8"
      ? [join(downloadDirectory, `${baseName}.mp4`), join(downloadDirectory, `${baseName}.ts`)]
      : resource.format === "webm"
        ? [join(downloadDirectory, `${baseName}.webm`)]
        : resource.format === "mp4"
          ? [join(downloadDirectory, `${baseName}.mp4`)]
          : [join(downloadDirectory, `${baseName}.bin`)];

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function hasTemporaryArtifacts(outputPath: string): boolean {
  if (existsSync(`${outputPath}.part`) || existsSync(`${outputPath}.ytdl`)) {
    return true;
  }

  const directory = dirname(outputPath);
  const fileName = outputPath.split("/").pop() ?? outputPath;
  const entries = readdirSync(directory, { withFileTypes: true });
  return entries.some(
    (entry) =>
      entry.isFile() &&
      entry.name.startsWith(`${fileName}-Frag`)
  );
}

function hasRecentDownloadActivity(outputPath: string): boolean {
  const cutoff = Date.now() - 90_000;
  return listDownloadArtifacts(outputPath).some((artifactPath) => {
    if (!existsSync(artifactPath)) {
      return false;
    }
    return statSync(artifactPath).mtimeMs >= cutoff;
  });
}

function listDownloadArtifacts(outputPath: string): string[] {
  const artifacts = [outputPath, `${outputPath}.part`, `${outputPath}.ytdl`];
  const directory = dirname(outputPath);
  const fileName = outputPath.split("/").pop() ?? outputPath;

  if (!existsSync(directory)) {
    return artifacts;
  }

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile()) {
      continue;
    }
    if (!entry.name.startsWith(`${fileName}-Frag`)) {
      continue;
    }
    artifacts.push(join(directory, entry.name));
  }

  return artifacts;
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

function mapTaskRow(row: TaskRow): TaskRecord {
  return {
    id: row.id,
    sourceUrl: row.source_url,
    status: row.status,
    title: row.title ?? undefined,
    siteHost: row.site_host,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    errorMessage: row.error_message ?? undefined
  };
}

function reconcileTaskRow(database: DatabaseSync, task: TaskRow): TaskRow {
  const resources = database
    .prepare(
      `
        SELECT id, task_id, url, format, mime_type, referer, user_agent, cookie,
               headers_json, title_hint, size_hint, selected, created_at,
               download_status, downloaded_bytes, total_bytes, speed_bytes_per_second,
               output_file_path, error_message
        FROM resources
        WHERE task_id = ?
      `
    )
    .all(task.id) as ResourceRow[];

  const manageableResources = resources
    .map(mapResourceRow)
    .filter(isQueueableResource);

  if (manageableResources.length === 0) {
    if (task.status === "detected" || task.status === "downloading") {
      writeTaskStatus(
        database,
        task.id,
        "failed",
        task.error_message ?? "no downloadable resources available"
      );
      return readTaskRow(database, task.id) ?? task;
    }
    return task;
  }

  const failedResource = manageableResources.find(
    (resource) => resource.downloadStatus === "failed"
  );
  if (failedResource && (task.status !== "failed" || task.error_message !== failedResource.errorMessage)) {
    writeTaskStatus(
      database,
      task.id,
      "failed",
      failedResource.errorMessage ?? "download failed"
    );
    return readTaskRow(database, task.id) ?? task;
  }

  const allCompleted = manageableResources.every(
    (resource) =>
      resource.downloadStatus === "completed" &&
      resource.outputFilePath &&
      existsSync(resource.outputFilePath)
  );
  if (allCompleted && task.status !== "completed") {
    writeTaskStatus(database, task.id, "completed", null);
    return readTaskRow(database, task.id) ?? task;
  }

  return task;
}

function readTaskRow(database: DatabaseSync, taskId: string): TaskRow | undefined {
  return database
    .prepare(
      "SELECT id, source_url, status, title, site_host, created_at, updated_at, error_message FROM tasks WHERE id = ?"
    )
    .get(taskId) as TaskRow | undefined;
}
