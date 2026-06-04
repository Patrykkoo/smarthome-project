import * as React from "react";
import { cn } from "@/lib/utils";

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "strong";
  hover?: boolean;
  as?: keyof JSX.IntrinsicElements;
}

export const GlassCard = React.forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, variant = "default", hover = false, as: Tag = "div", ...props }, ref) => {
    const Comp = Tag as any;
    return (
      <Comp
        ref={ref}
        className={cn(
          "rounded-[28px]",
          variant === "strong" ? "glass-strong" : "glass",
          hover && "glass-hover",
          className,
        )}
        {...props}
      />
    );
  },
);
GlassCard.displayName = "GlassCard";
