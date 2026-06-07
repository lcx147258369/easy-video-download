import type { HTMLAttributes, PropsWithChildren } from "react";

import { cn } from "./cn";

export function Panel({
  children,
  className,
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLDivElement>>) {
  return (
    <section
      className={cn(
        "rounded-panel border border-white/10 bg-white/[0.03] p-5 shadow-panel backdrop-blur-sm",
        className
      )}
      {...props}
    >
      {children}
    </section>
  );
}
