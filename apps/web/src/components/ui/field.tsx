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
      <span className="block font-mono text-[11px] uppercase tracking-[0.24em] text-stone-600">
        {label}
      </span>
      {hint ? <span className="mt-1.5 block text-[13px] leading-6 text-stone-600">{hint}</span> : null}
      <div className="mt-3.5">{children}</div>
    </label>
  );
}

export function TextInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "ui-input w-full rounded-[1.15rem] border px-4 py-3.5 text-sm text-stone-900 outline-none transition",
        className
      )}
      {...props}
    />
  );
}

export function TextArea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "ui-input min-h-[160px] w-full rounded-[1.35rem] border px-4 py-4 text-sm text-stone-900 outline-none transition",
        className
      )}
      {...props}
    />
  );
}
