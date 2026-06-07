import type {
  InputHTMLAttributes,
  PropsWithChildren,
  TextareaHTMLAttributes
} from "react";

import { cn } from "./cn";

export function Field({
  label,
  hint,
  children
}: PropsWithChildren<{ label: string; hint?: string }>) {
  return (
    <label className="block">
      <span className="block font-mono text-[11px] uppercase tracking-[0.24em] text-ink-200">
        {label}
      </span>
      {hint ? <span className="mt-1 block text-xs text-ink-200/80">{hint}</span> : null}
      <div className="mt-3">{children}</div>
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-2xl border border-white/10 bg-ink-950/70 px-4 py-3 text-sm text-ink-100 outline-none transition placeholder:text-ink-200/40 focus:border-signal-accent/40 focus:ring-2 focus:ring-signal-accent/20",
        props.className
      )}
      {...props}
    />
  );
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-[148px] w-full rounded-[1.35rem] border border-white/10 bg-ink-950/70 px-4 py-4 text-sm text-ink-100 outline-none transition placeholder:text-ink-200/40 focus:border-signal-accent/40 focus:ring-2 focus:ring-signal-accent/20",
        props.className
      )}
      {...props}
    />
  );
}
