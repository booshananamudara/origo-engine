import { cn } from "@/lib/utils"
import React from "react"

interface ShimmerButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode
  shimmerColor?: string
  background?: string
  className?: string
}

export const ShimmerButton = React.forwardRef<HTMLButtonElement, ShimmerButtonProps>(
  (
    {
      children,
      shimmerColor = "rgba(255,255,255,0.4)",
      background = "hsl(var(--primary))",
      className,
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        className={cn(
          "group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-md px-4 py-2 text-sm font-medium text-primary-foreground transition-all",
          "hover:shadow-lg active:scale-[0.98]",
          className,
        )}
        style={{ background }}
        {...props}
      >
        <span
          className="pointer-events-none absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent"
          style={{ animationTimingFunction: "linear" }}
        />
        {children}
      </button>
    )
  },
)
ShimmerButton.displayName = "ShimmerButton"
