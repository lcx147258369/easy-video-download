import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { cn } from "./cn";
const toneByStatus = {
    pending: { dot: "bg-zinc-400", text: "text-zinc-500" },
    running: { dot: "bg-slate-600", text: "text-slate-700" },
    needs_login: { dot: "bg-amber-600", text: "text-amber-700" },
    detected: { dot: "bg-teal-600", text: "text-teal-700" },
    downloading: { dot: "bg-sky-600", text: "text-sky-700" },
    completed: { dot: "bg-emerald-600", text: "text-emerald-700" },
    failed: { dot: "bg-rose-600", text: "text-rose-700" }
};
export function StatusBadge({ status, label }) {
    const tone = toneByStatus[status];
    return (_jsxs("span", { className: cn("inline-flex items-center gap-2 text-[13px] font-semibold leading-none", tone.text), children: [_jsx("span", { className: cn("h-2 w-2 shrink-0 rounded-full", tone.dot) }), label] }));
}
