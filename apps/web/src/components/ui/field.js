import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cn } from "./cn";
export function Field({ label, hint, children }) {
    return (_jsxs("label", { className: "block", children: [_jsx("span", { className: "block font-mono text-[11px] uppercase tracking-[0.24em] text-stone-500", children: label }), hint ? _jsx("span", { className: "mt-1.5 block text-[13px] leading-6 text-stone-500", children: hint }) : null, _jsx("div", { className: "mt-3.5", children: children })] }));
}
export function TextInput({ className, ...props }) {
    return (_jsx("input", { className: cn("ui-input w-full rounded-2xl border px-4 py-3.5 text-sm text-stone-900 outline-none transition", className), ...props }));
}
export function TextArea({ className, ...props }) {
    return (_jsx("textarea", { className: cn("ui-input min-h-[160px] w-full rounded-[1.5rem] border px-4 py-4 text-sm text-stone-900 outline-none transition", className), ...props }));
}
