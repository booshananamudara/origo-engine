import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type RunStatus = "pending" | "running" | "completed" | "failed"
type RecStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "revision_requested"
  | "implemented"
  | "expired"
  | "in_review"
type Priority = "high" | "medium" | "low"
type ClientStatus = "active" | "paused" | "archived"
type SchedulerStatus = "enqueued" | "started" | "completed" | "failed" | "skipped"

type StatusValue = RunStatus | RecStatus | Priority | ClientStatus | SchedulerStatus | string

interface StatusBadgeProps {
  status: StatusValue
  type?: "run" | "recommendation" | "priority" | "client" | "scheduler"
  className?: string
}

function getVariantAndLabel(status: StatusValue): {
  variant: "default" | "secondary" | "destructive" | "outline"
  className: string
  label: string
} {
  const map: Record<
    string,
    {
      variant: "default" | "secondary" | "destructive" | "outline"
      className: string
      label: string
    }
  > = {
    // Run statuses
    pending: {
      variant: "outline",
      className: "text-muted-foreground",
      label: "Pending",
    },
    running: {
      variant: "default",
      className: "bg-blue-600 text-white animate-pulse",
      label: "Running",
    },
    completed: {
      variant: "default",
      className: "bg-emerald-600 text-white",
      label: "Completed",
    },
    failed: {
      variant: "destructive",
      className: "",
      label: "Failed",
    },
    // Recommendation statuses
    approved: {
      variant: "default",
      className: "bg-emerald-600 text-white",
      label: "Approved",
    },
    rejected: {
      variant: "destructive",
      className: "",
      label: "Rejected",
    },
    revision_requested: {
      variant: "outline",
      className: "border-amber-500 text-amber-600",
      label: "Revision",
    },
    implemented: {
      variant: "default",
      className: "bg-blue-600 text-white",
      label: "Implemented",
    },
    expired: {
      variant: "secondary",
      className: "text-muted-foreground",
      label: "Expired",
    },
    in_review: {
      variant: "outline",
      className: "border-blue-400 text-blue-600",
      label: "In Review",
    },
    // Priority
    high: {
      variant: "destructive",
      className: "",
      label: "High",
    },
    medium: {
      variant: "outline",
      className: "border-amber-500 text-amber-600",
      label: "Medium",
    },
    low: {
      variant: "secondary",
      className: "",
      label: "Low",
    },
    // Client statuses
    active: {
      variant: "default",
      className: "bg-emerald-600 text-white",
      label: "Active",
    },
    paused: {
      variant: "outline",
      className: "border-amber-500 text-amber-600",
      label: "Paused",
    },
    archived: {
      variant: "secondary",
      className: "text-muted-foreground",
      label: "Archived",
    },
    // Scheduler statuses
    enqueued: {
      variant: "outline",
      className: "border-blue-400 text-blue-600",
      label: "Enqueued",
    },
    started: {
      variant: "default",
      className: "bg-blue-600 text-white animate-pulse",
      label: "Started",
    },
    skipped: {
      variant: "secondary",
      className: "text-muted-foreground",
      label: "Skipped",
    },
  }

  return (
    map[status] ?? {
      variant: "secondary",
      className: "",
      label: status,
    }
  )
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const { variant, className: variantClass, label } = getVariantAndLabel(status)

  return (
    <Badge
      variant={variant}
      className={cn("text-xs font-medium capitalize", variantClass, className)}
    >
      {label}
    </Badge>
  )
}
