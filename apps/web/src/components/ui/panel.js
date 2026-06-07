import { jsx as _jsx } from "react/jsx-runtime";
import { cn } from "./cn";
export function Panel({ children, className, ...props }) {
    return (_jsx("section", { className: cn("ui-panel rounded-panel border p-5", className), ...props, children: children }));
}
