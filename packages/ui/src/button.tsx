import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

import { cn } from "./cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export interface ButtonProps
  extends PropsWithChildren,
    ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-signal-accent text-ink-950 hover:bg-[#2ee6d7] border-transparent",
  secondary:
    "bg-white/6 text-ink-100 hover:bg-white/10 border-white/10",
  ghost:
    "bg-transparent text-ink-200 hover:bg-white/6 border-white/10",
  danger:
    "bg-signal-danger/15 text-[#ffc9cf] hover:bg-signal-danger/25 border-signal-danger/30"
};

export function Button({
  children,
  className,
  variant = "secondary",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        variantClasses[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
