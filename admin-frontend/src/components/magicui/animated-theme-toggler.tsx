import { Moon, Sun } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { cn } from "@/lib/utils"

interface AnimatedThemeTogglerProps {
  dark: boolean
  toggle: () => void
  className?: string
  variant?: "default" | "circle"
}

export function AnimatedThemeToggler({
  dark,
  toggle,
  className,
  variant = "default",
}: AnimatedThemeTogglerProps) {
  return (
    <button
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(
        "relative inline-flex items-center justify-center text-muted-foreground transition-colors hover:text-accent-foreground",
        variant === "circle"
          ? "h-9 w-9 rounded-full border border-border bg-background hover:bg-accent shadow-sm"
          : "h-8 w-8 rounded-md hover:bg-accent",
        className,
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        {dark ? (
          <motion.span
            key="moon"
            initial={{ opacity: 0, rotate: -45, scale: 0.7 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: 45, scale: 0.7 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute"
          >
            <Moon className="h-4 w-4" />
          </motion.span>
        ) : (
          <motion.span
            key="sun"
            initial={{ opacity: 0, rotate: 45, scale: 0.7 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: -45, scale: 0.7 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute"
          >
            <Sun className="h-4 w-4" />
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  )
}
