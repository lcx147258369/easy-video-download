import { useEffect, useState } from "react";

import type { AppSettings } from "@video/shared";
import { api } from "../lib/api";
import { Button } from "./ui/button";
import { Field, TextInput } from "./ui/field";
import { Panel } from "./ui/panel";

export function SettingsPanel({
  settings,
  busy,
  onSave
}: {
  settings: AppSettings | null;
  busy: boolean;
  onSave(settings: AppSettings): void;
}) {
  const [draft, setDraft] = useState<AppSettings | null>(settings);
  const [pickingDownloadDirectory, setPickingDownloadDirectory] = useState(false);
  const [pickingProfileDirectory, setPickingProfileDirectory] = useState(false);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  if (!draft) {
    return (
      <Panel>
        <p className="text-sm text-stone-500">正在加载设置...</p>
      </Panel>
    );
  }

  return (
    <Panel className="space-y-5">
      <header>
        <h3 className="font-display text-xl font-semibold text-stone-900">运行设置</h3>
        <p className="mt-1.5 text-sm leading-6 text-stone-600">
          下载目录和任务检测参数会直接影响后续任务行为。
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="下载目录" hint="使用系统文件夹选择器指定下载位置。">
          <div className="space-y-3">
            <TextInput readOnly value={draft.downloadDirectory} />
            <div className="flex justify-start">
              <Button
                disabled={busy || pickingDownloadDirectory}
                onClick={async () => {
                  setPickingDownloadDirectory(true);
                  try {
                    const response = await api.pickDirectory();
                    if (response.directoryPath) {
                      setDraft({
                        ...draft,
                        downloadDirectory: response.directoryPath
                      });
                    }
                  } finally {
                    setPickingDownloadDirectory(false);
                  }
                }}
                type="button"
              >
                {pickingDownloadDirectory ? "选择中..." : "选择文件夹"}
              </Button>
            </div>
          </div>
        </Field>
        <Field label="浏览器 Profile 目录" hint="用于保存登录态、Cookie 和浏览器站点缓存。">
          <div className="space-y-3">
            <TextInput readOnly value={draft.profileDirectory} />
            <div className="flex justify-start">
              <Button
                disabled={busy || pickingProfileDirectory}
                onClick={async () => {
                  setPickingProfileDirectory(true);
                  try {
                    const response = await api.pickDirectory();
                    if (response.directoryPath) {
                      setDraft({
                        ...draft,
                        profileDirectory: response.directoryPath
                      });
                    }
                  } finally {
                    setPickingProfileDirectory(false);
                  }
                }}
                type="button"
              >
                {pickingProfileDirectory ? "选择中..." : "选择文件夹"}
              </Button>
            </div>
          </div>
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="并发下载数">
          <TextInput
            inputMode="numeric"
            value={String(draft.maxConcurrentDownloads)}
            onChange={(event) =>
              setDraft({
                ...draft,
                maxConcurrentDownloads: Number(event.target.value) || 1
              })
            }
          />
        </Field>
        <Field label="检测超时 (ms)">
          <TextInput
            inputMode="numeric"
            value={String(draft.detectionTimeoutMs)}
            onChange={(event) =>
              setDraft({
                ...draft,
                detectionTimeoutMs: Number(event.target.value) || 5000
              })
            }
          />
        </Field>
      </div>

      <div className="flex justify-end">
        <Button
          disabled={busy}
          onClick={() =>
            onSave({
              ...draft,
              autoDownload: true
            })
          }
          variant="primary"
        >
          {busy ? "保存中..." : "保存设置"}
        </Button>
      </div>
    </Panel>
  );
}
