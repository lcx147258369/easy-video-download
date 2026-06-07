import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#1c1917",
          900: "#292524",
          800: "#44403c",
          700: "#57534e",
          200: "#d6d3d1",
          100: "#f5f5f4"
        },
        signal: {
          info: "#0ea5e9",
          warn: "#f59e0b",
          success: "#10b981",
          danger: "#ef4444",
          accent: "#111827"
        }
      },
      fontFamily: {
        display: ["'IBM Plex Sans'", "sans-serif"],
        mono: ["'IBM Plex Mono'", "monospace"]
      },
      boxShadow: {
        panel: "0 18px 50px rgba(15, 23, 42, 0.08)"
      },
      borderRadius: {
        panel: "1.5rem"
      }
    }
  },
  plugins: []
};

export default config;
