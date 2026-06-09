import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

describe("video detector", () => {
  it("classifies media requests by url and content type", async () => {
    const { classifyVideoResource } = await import(
      "../src/browser/video-detector.js"
    );

    expect(
      classifyVideoResource({
        url: "https://cdn.example.com/movie.mp4",
        contentType: "video/mp4"
      })
    ).toMatchObject({
      format: "mp4",
      mimeType: "video/mp4"
    });

    expect(
      classifyVideoResource({
        url: "https://cdn.example.com/master.m3u8",
        contentType: "application/vnd.apple.mpegurl"
      })
    ).toMatchObject({
      format: "m3u8",
      mimeType: "application/vnd.apple.mpegurl"
    });
  });

  it("extracts video candidates from DOM media tags", async () => {
    const { extractDomVideoCandidates } = await import(
      "../src/browser/video-detector.js"
    );

    const dom = new JSDOM(`
      <!doctype html>
      <html>
        <body>
          <video src="https://cdn.example.com/direct.mp4" poster="/thumb.jpg">
            <source src="https://cdn.example.com/fallback.webm" type="video/webm" />
          </video>
        </body>
      </html>
    `);

    const candidates = extractDomVideoCandidates(dom.window.document, {
      taskId: "task-1",
      pageUrl: "https://example.com/watch"
    });

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({
      format: "mp4",
      url: "https://cdn.example.com/direct.mp4",
      selected: false
    });
    expect(candidates[1]).toMatchObject({
      format: "webm",
      url: "https://cdn.example.com/fallback.webm",
      selected: false
    });
  });

  it("deduplicates candidates by url and format", async () => {
    const { dedupeVideoCandidates } = await import(
      "../src/browser/video-detector.js"
    );

    expect(
      dedupeVideoCandidates([
        {
          id: "a",
          taskId: "task-1",
          url: "https://cdn.example.com/movie.mp4",
          format: "mp4",
          mimeType: "video/mp4",
          referer: null,
          userAgent: null,
          cookie: null,
          headers: {},
          titleHint: null,
          sizeHint: null,
          selected: false
        },
        {
          id: "b",
          taskId: "task-1",
          url: "https://cdn.example.com/movie.mp4",
          format: "mp4",
          mimeType: "video/mp4",
          referer: null,
          userAgent: null,
          cookie: null,
          headers: {},
          titleHint: null,
          sizeHint: null,
          selected: false
        }
      ])
    ).toHaveLength(1);
  });

  it("extracts media urls from escaped inline script text", async () => {
    const { extractVideoCandidatesFromText } = await import(
      "../src/browser/video-detector.js"
    );

    const candidates = extractVideoCandidatesFromText(
      'player={url:"https:\\/\\/cdn.example.com\\/master.m3u8?token=1"};',
      {
        taskId: "task-1",
        pageUrl: "https://example.com/watch"
      }
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      format: "m3u8",
      url: "https://cdn.example.com/master.m3u8?token=1"
    });
  });

  it("extracts media urls from performance entries", async () => {
    const { extractVideoCandidatesFromPerformanceEntries } = await import(
      "../src/browser/video-detector.js"
    );

    const candidates = extractVideoCandidatesFromPerformanceEntries(
      [
        {
          name: "https://cdn.example.com/master.m3u8?sign=abc",
          initiatorType: "fetch"
        },
        {
          name: "https://example.com/app.js",
          initiatorType: "script"
        }
      ],
      {
        taskId: "task-1",
        pageUrl: "https://example.com/watch"
      }
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      format: "m3u8",
      url: "https://cdn.example.com/master.m3u8?sign=abc"
    });
  });

  it("extracts media urls from captured fetch/xhr entries using content type", async () => {
    const { extractVideoCandidatesFromCapturedEntries } = await import(
      "../src/browser/video-detector.js"
    );

    const candidates = extractVideoCandidatesFromCapturedEntries(
      [
        {
          url: "https://example.com/api/video-source?id=1",
          contentType: "application/vnd.apple.mpegurl",
          referer: "https://example.com/watch"
        },
        {
          url: "https://example.com/assets/app.js",
          contentType: "application/javascript",
          referer: "https://example.com/watch"
        }
      ],
      {
        taskId: "task-1",
        pageUrl: "https://example.com/watch"
      }
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      format: "m3u8",
      url: "https://example.com/api/video-source?id=1",
      referer: "https://example.com/watch"
    });
  });
});
