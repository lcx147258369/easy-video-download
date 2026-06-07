import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vite";

export default defineConfig({
  esbuild: {
    jsx: "automatic"
  },
  resolve: {
    alias: {
      "@video/shared": fileURLToPath(
        new URL("../../packages/shared/src/index.ts", import.meta.url)
      ),
      "@video/ui": fileURLToPath(
        new URL("../../packages/ui/src/index.ts", import.meta.url)
      )
    }
  },
  server: {
    port: 4173,
    host: "0.0.0.0",
    proxy: {
      "/api": "http://localhost:4318",
      "/health": "http://localhost:4318"
    }
  }
});
