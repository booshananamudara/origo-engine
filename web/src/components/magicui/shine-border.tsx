import { cn } from "@/lib/utils"

interface ShineBorderProps {
  children: React.ReactNode
  className?: string
  duration?: number
  color?: string | string[]
  borderWidth?: number
}

export function ShineBorder({
  children,
  className,
  duration = 14,
  color = ["#4A90D9", "#10B981", "#F59E0B"],
  borderWidth = 1,
}: ShineBorderProps) {
  const colorStr = Array.isArray(color) ? color.join(", ") : color

  return (
    <div
      style={
        {
          "--shine-duration": `${duration}s`,
          "--shine-color": colorStr,
          "--border-width": `${borderWidth}px`,
        } as React.CSSProperties
      }
      className={cn(
        "relative overflow-hidden rounded-[inherit]",
        "before:absolute before:inset-0 before:rounded-[inherit]",
        "before:p-[--border-width] before:content-['']",
        "before:[background:linear-gradient(transparent,transparent)_padding-box,conic-gradient(from_var(--shine-angle,0deg),transparent_0deg,var(--shine-color),transparent_360deg)_border-box]",
        "before:[animation:shine_var(--shine-duration)_linear_infinite]",
        className,
      )}
    >
      {children}
    </div>
  )
}
