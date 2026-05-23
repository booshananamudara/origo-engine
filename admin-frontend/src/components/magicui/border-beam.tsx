import { cn } from "@/lib/utils"

interface BorderBeamProps {
  className?: string
  size?: number
  duration?: number
  colorFrom?: string
  colorTo?: string
  borderWidth?: number
}

export function BorderBeam({
  className,
  size = 200,
  duration = 15,
  colorFrom = "#4A90D9",
  colorTo = "#10B981",
  borderWidth = 1.5,
}: BorderBeamProps) {
  return (
    <div
      style={
        {
          "--size": `${size}px`,
          "--duration": `${duration}s`,
          "--color-from": colorFrom,
          "--color-to": colorTo,
          "--border-width": `${borderWidth}px`,
        } as React.CSSProperties
      }
      className={cn(
        "pointer-events-none absolute inset-0 rounded-[inherit]",
        "border-[length:var(--border-width)] border-transparent",
        "[background:linear-gradient(var(--card,white),var(--card,white))_padding-box,linear-gradient(in_oklch_longer_hue,var(--color-from),var(--color-to),var(--color-from))_border-box]",
        "[animation:border-beam_var(--duration)_linear_infinite]",
        className,
      )}
    />
  )
}
