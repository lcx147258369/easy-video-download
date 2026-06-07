import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

describe("browser manager", () => {
  const createdPaths: string[] = [];

  afterEach(() => {
    for (const createdPath of createdPaths.splice(0)) {
      rmSync(createdPath, { recursive: true, force: true });
    }
  });

  it("reuses a persistent browser profile for the same host", async () => {
    const { createBrowserManager } = await import(
      "../src/browser/browser-manager.js"
    );

    const rootDir = mkdtempSync(join(tmpdir(), "video-browser-"));
    createdPaths.push(rootDir);
    const htmlPath = join(rootDir, "page.html");
    writeFileSync(
      htmlPath,
      `
        <!doctype html>
        <html>
          <body>
            <strong id="count"></strong>
            <script>
              const current = Number(localStorage.getItem("seen") || "0") + 1;
              localStorage.setItem("seen", String(current));
              document.getElementById("count").textContent = String(current);
            </script>
          </body>
        </html>
      `
    );
    const url = `file://${htmlPath}`;

    const manager = createBrowserManager({
      profileRootDirectory: join(rootDir, "profiles"),
      browserExecutablePath:
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      headless: true
    });

    const firstSession = await manager.openSession({
      siteHost: "127.0.0.1",
      url
    });
    await firstSession.page.waitForSelector("#count");
    expect(await firstSession.page.textContent("#count")).toBe("1");
    await firstSession.close();

    const secondSession = await manager.openSession({
      siteHost: "127.0.0.1",
      url
    });
    await secondSession.page.waitForSelector("#count");
    expect(await secondSession.page.textContent("#count")).toBe("2");
    await secondSession.close();

    await manager.closeAll();
  }, 20000);
});
