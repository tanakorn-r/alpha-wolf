import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  children?: ReactNode;
  variant?: "default" | "muted";
};

export function Badge({ className, variant = "default", children, ...props }: BadgeProps) {
  return (
    <span className={cn("shadcn-badge", `shadcn-badge-${variant}`, className)} {...props}>
      {children}
    </span>
  );
}
