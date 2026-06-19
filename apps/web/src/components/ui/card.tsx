import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

type Props = HTMLAttributes<HTMLDivElement> & {
  children?: ReactNode;
};

export function Card({ className, children, ...props }: Props) {
  return (
    <div className={cn("shadcn-card", className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...props }: Props) {
  return (
    <div className={cn("shadcn-card-header", className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...props }: Props) {
  return (
    <div className={cn("shadcn-card-title", className)} {...props}>
      {children}
    </div>
  );
}

export function CardDescription({ className, children, ...props }: Props) {
  return (
    <div className={cn("shadcn-card-description", className)} {...props}>
      {children}
    </div>
  );
}

export function CardContent({ className, children, ...props }: Props) {
  return (
    <div className={cn("shadcn-card-content", className)} {...props}>
      {children}
    </div>
  );
}
