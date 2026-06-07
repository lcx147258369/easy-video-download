import { jsx as _jsx } from "react/jsx-runtime";
import { cn } from "./cn";
const toneByStatus = {
    pending: "border-white/10 bg-white/5 text-ink-200",
    running: "border-signal-info/30 bg-signal-info/10 text-[#9ddfff]",
    needs_login: "border-signal-warn/30 bg-signal-warn/10 text-[#ffe2a3]",
    detected: "border-signal-accent/30 bg-signal-accent/10 text-[#9ef4ea]",
    downloading: "border-[#25b8ff]/30 bg-[#25b8ff]/10 text-[#abddff]",
    completed: "border-signal-success/30 bg-signal-success/10 text-[#b8f5de]",
    failed: "border-signal-danger/30 bg-signal-danger/10 text-[#ffc8d0]"
};
export function StatusBadge({ status, label }) {
    return (_jsx("span", { className: cn("inline-flex rounded-full border px-3 py-1 text-xs font-semibold tracking-[0.16em] uppercase", toneByStatus[status]), children: label }));
}
