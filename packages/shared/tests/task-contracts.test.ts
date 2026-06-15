import { describe, expect, it } from "vitest";

import {
  createDefaultSettings,
  getTaskStatusLabel,
  isTerminalTaskStatus,
  parseTaskUrlInput
} from "../src/index.js";

describe("shared task contracts", () => {
  it("maps task statuses to readable labels", () => {
    expect(getTaskStatusLabel("needs_login")).toBe("等待登录");
    expect(getTaskStatusLabel("completed")).toBe("已完成");
  });

  it("identifies terminal task statuses", () => {
    expect(isTerminalTaskStatus("completed")).toBe(true);
    expect(isTerminalTaskStatus("failed")).toBe(true);
    expect(isTerminalTaskStatus("running")).toBe(false);
  });

  it("parses task urls from pasted input", () => {
    expect(
      parseTaskUrlInput(`
        https://example.com/video/1
        not-a-url
        https://example.com/video/2
      `)
    ).toEqual([
      "https://example.com/video/1",
      "https://example.com/video/2"
    ]);
  });

  it("extracts multiple urls from mixed pasted text", () => {
    expect(
      parseTaskUrlInput(`
        第一组：https://example.com/video/1 https://example.com/video/2
        第二组，https://example.com/video/3，https://example.com/video/3
        说明文字 (https://example.com/video/4)
      `)
    ).toEqual([
      "https://example.com/video/1",
      "https://example.com/video/2",
      "https://example.com/video/3",
      "https://example.com/video/4"
    ]);
  });

  it("creates sane default settings", () => {
    const settings = createDefaultSettings();

    expect(settings.maxConcurrentDownloads).toBe(2);
    expect(settings.autoDownload).toBe(true);
    expect(settings.headless).toBe(true);
    expect(settings.downloadDirectory.endsWith("data/downloads")).toBe(true);
  });
});
