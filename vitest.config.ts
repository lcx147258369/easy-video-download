import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "apps/**/*.test.ts",
      "apps/**/*.test.tsx",
      "packages/**/*.test.ts",
      "packages/**/*.test.tsx"
    ],
    exclude: [
      "node_modules/**",
      "**/node_modules/**",
      ".tsbuild/**",
      "**/.tsbuild/**",
      "dist/**",
      "**/dist/**",
      ".ignored/**",
      "**/.ignored/**",
      "coverage/**"
    ],
    environmentMatchGlobs: [
      ["apps/web/**/*.test.ts", "jsdom"],
      ["apps/web/**/*.test.tsx", "jsdom"],
      ["packages/ui/**/*.test.ts", "jsdom"],
      ["packages/ui/**/*.test.tsx", "jsdom"]
    ],
    globals: true,
    setupFiles: ["./apps/web/src/test/setup.ts"]
  }
});
