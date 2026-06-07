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
        "ui-panel rounded-panel border p-5",
        className
      )}
      {...props}
    >
      {children}
    </section>
  );
}
