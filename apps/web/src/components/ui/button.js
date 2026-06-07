import { jsx as _jsx } from "react/jsx-runtime";
import { cn } from "./cn";
const variantClasses = {
    primary: "ui-button--primary",
    secondary: "ui-button--secondary",
    ghost: "ui-button--ghost",
    danger: "ui-button--danger"
};
export function Button({ children, className, variant = "secondary", ...props }) {
    return (_jsx("button", { className: cn("ui-button inline-flex min-h-10 items-center justify-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50", variantClasses[variant], className), ...props, children: children }));
}
