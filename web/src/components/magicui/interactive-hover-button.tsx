import * as React from "react"
import { ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface InteractiveHoverButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  text?: string
}

export function InteractiveHoverButton({
  text = "Button",
  className,
  children,
  ...props
}: InteractiveHoverButtonProps) {
  const label = children ?? text

  return (
    <button
      className={cn(
        "group relative inline-flex w-auto cursor-pointer items-center overflow-hidden rounded-full border border-border bg-background px-5 py-1.5 text-sm font-medium text-foreground transition-colors duration-300 hover:border-primary/50",
        className,
      )}
      {...props}
    >
      <span className="flex items-center gap-1.5 transition-all duration-300 group-hover:opacity-0 group-hover:-translate-x-2">
        {label}
      </span>
      <span className="absolute inset-0 flex translate-x-full items-center justify-center gap-1.5 rounded-full bg-primary text-primary-foreground transition-all duration-300 group-hover:translate-x-0">
        {label}
        <ArrowRight className="h-3.5 w-3.5" />
      </span>
    </button>
  )
}
