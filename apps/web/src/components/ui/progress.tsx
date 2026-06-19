import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

type ProgressProps = HTMLAttributes<HTMLDivElement> & {
  value: number;
  children?: ReactNode;
};

export function Progress({ className, value, children, ...props }: ProgressProps) {
  return (
    <div className={cn("shadcn-progress", className)} {...props}>
      <div className="shadcn-progress-track" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      {children}
    </div>
  );
}
