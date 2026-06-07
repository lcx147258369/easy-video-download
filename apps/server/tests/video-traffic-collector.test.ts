import { EventEmitter } from "node:events";

import { describe, expect, it } from "vitest";

class FakePage extends EventEmitter {
  on(event: "request" | "response", listener: (...args: any[]) => void) {
    return super.on(event, listener);
  }

  off(event: "request" | "response", listener: (...args: any[]) => void) {
    return super.off(event, listener);
  }
}

describe("video traffic collector", () => {
  it("collects video candidates from request and response events", async () => {
    const { createVideoTrafficCollector } = await import(
      "../src/browser/video-detector.js"
    );

    const page = new FakePage();
    const collector = createVideoTrafficCollector(page, {
      taskId: "task-1",
      pageUrl: "https://example.com/watch",
      userAgent: "test-agent"
    });

    collector.start();

    page.emit("request", {
      url: () => "https://cdn.example.com/movie.mp4",
      headers: () => ({ referer: "https://example.com/watch" })
    });

    page.emit("response", {
      url: () => "https://cdn.example.com/master.m3u8",
      headers: () => ({
        "content-type": "application/vnd.apple.mpegurl"
      }),
      request: () => ({
        url: () => "https://cdn.example.com/master.m3u8",
        headers: () => ({
          referer: "https://example.com/watch",
          cookie: "session=1"
        })
      })
    });

    const candidates = collector.snapshot();

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({
      format: "mp4",
      url: "https://cdn.example.com/movie.mp4"
    });
    expect(candidates[1]).toMatchObject({
      format: "m3u8",
      url: "https://cdn.example.com/master.m3u8",
      cookie: "session=1"
    });

    collector.stop();
  });
});
