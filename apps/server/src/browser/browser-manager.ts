import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { chromium, type BrowserContext, type Page } from "playwright";

export interface BrowserManagerOptions {
  profileRootDirectory: string;
  browserExecutablePath?: string | null;
  headless?: boolean;
}

export interface BrowserSession {
  siteHost: string;
  profileDirectory: string;
  context: BrowserContext;
  page: Page;
  close(): Promise<void>;
}

export interface BrowserManager {
  openSession(options: { siteHost: string; url?: string }): Promise<BrowserSession>;
  closeAll(): Promise<void>;
}

export function createBrowserManager(options: BrowserManagerOptions): BrowserManager {
  const activeContexts = new Map<string, BrowserContext>();

  return {
    async openSession({ siteHost, url }) {
      const profileDirectory = resolveProfileDirectory(
        options.profileRootDirectory,
        siteHost
      );
      mkdirSync(profileDirectory, { recursive: true });

      const context =
        activeContexts.get(siteHost) ??
        (await chromium.launchPersistentContext(profileDirectory, {
          executablePath: options.browserExecutablePath ?? undefined,
          headless: options.headless ?? false
        }));

      activeContexts.set(siteHost, context);

      const page = context.pages()[0] ?? (await context.newPage());
      if (url) {
        await page.goto(url, { waitUntil: "domcontentloaded" });
      }

      return {
        siteHost,
        profileDirectory,
        context,
        page,
        async close() {
          if (activeContexts.get(siteHost) === context) {
            activeContexts.delete(siteHost);
          }
          await context.close();
        }
      };
    },
    async closeAll() {
      for (const context of activeContexts.values()) {
        await context.close();
      }
      activeContexts.clear();
    }
  };
}

function resolveProfileDirectory(rootDirectory: string, siteHost: string): string {
  return join(rootDirectory, siteHost.replace(/[^a-zA-Z0-9.-]+/g, "_"));
}
