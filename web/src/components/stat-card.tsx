import { Card, CardContent } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { NumberTicker } from "@/components/magicui/number-ticker"
import { cn } from "@/lib/utils"
import { TrendingDown, TrendingUp } from "lucide-react"

type StatusColor = "success" | "warning" | "danger" | "info" | "neutral"

interface StatCardProps {
  label: string
  value: number
  suffix?: string
  prefix?: string
  subtitle?: string
  trend?: { value: number; direction: "up" | "down" }
  status?: StatusColor
  statusLabel?: string
  animate?: boolean
  decimalPlaces?: number
  className?: string
  children?: React.ReactNode
}

const statusDotClass: Record<StatusColor, string> = {
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
  info: "bg-blue-500",
  neutral: "bg-zinc-400",
}

export function StatCard({
  label,
  value,
  suffix = "",
  prefix = "",
  subtitle,
  trend,
  status,
  statusLabel,
  animate = true,
  decimalPlaces = 0,
  className,
  children,
}: StatCardProps) {
  return (
    <Card className={cn("min-h-[140px] p-6", className)}>
      <CardContent className="p-0 flex flex-col h-full gap-1">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>

        <div className="flex items-end gap-2 mt-1">
          <span className="text-3xl font-bold tracking-tight tabular-nums leading-none">
            {animate ? (
              <NumberTicker
                value={value}
                decimalPlaces={decimalPlaces}
                prefix={prefix}
                suffix={suffix}
              />
            ) : (
              `${prefix}${Intl.NumberFormat("en-US", {
                minimumFractionDigits: decimalPlaces,
                maximumFractionDigits: decimalPlaces,
              }).format(value)}${suffix}`
            )}
          </span>

          {trend && (
            <span
              className={cn(
                "flex items-center gap-0.5 text-xs font-medium pb-1",
                trend.direction === "up" ? "text-emerald-600" : "text-red-500",
              )}
            >
              {trend.direction === "up" ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              {trend.value}%
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 mt-1">
          {status && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className={cn(
                    "inline-block h-2 w-2 rounded-full flex-shrink-0",
                    statusDotClass[status],
                  )}
                />
              </TooltipTrigger>
              {statusLabel && (
                <TooltipContent side="bottom">
                  <p className="text-xs">{statusLabel}</p>
                </TooltipContent>
              )}
            </Tooltip>
          )}
          {statusLabel && (
            <p className="text-xs text-muted-foreground truncate max-w-[120px]">{statusLabel}</p>
          )}
          {subtitle && !statusLabel && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>

        {subtitle && statusLabel && (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        )}

        {children}
      </CardContent>
    </Card>
  )
}
