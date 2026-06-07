const config = {
    content: ["./index.html", "./src/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
    theme: {
        extend: {
            colors: {
                ink: {
                    950: "#07131a",
                    900: "#0d1f28",
                    800: "#173240",
                    700: "#245164",
                    200: "#d8e7ef",
                    100: "#edf5f8"
                },
                signal: {
                    info: "#0ea5e9",
                    warn: "#f59e0b",
                    success: "#10b981",
                    danger: "#ef4444",
                    accent: "#14b8a6"
                }
            },
            fontFamily: {
                display: ["'IBM Plex Sans'", "sans-serif"],
                mono: ["'IBM Plex Mono'", "monospace"]
            },
            boxShadow: {
                panel: "0 18px 48px rgba(2, 12, 18, 0.22)"
            },
            borderRadius: {
                panel: "1.5rem"
            }
        }
    },
    plugins: []
};
export default config;
