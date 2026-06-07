// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

describe("api error handling", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.resetModules();
  });

  it("reads non-json error bodies without consuming the response twice", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response("<!doctype html><title>500</title>", {
        status: 500,
        headers: {
          "content-type": "text/html"
        }
      })
    ) as typeof fetch;

    const { api } = await import("./api");

    await expect(api.getSettings()).rejects.toThrow("<!doctype html>");
  });
});
