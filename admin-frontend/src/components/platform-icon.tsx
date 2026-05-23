import { cn } from "@/lib/utils"

type Platform = "openai" | "anthropic" | "gemini" | "perplexity"

interface PlatformIconProps {
  platform: Platform | string
  size?: "sm" | "md" | "lg"
  className?: string
}

const platformConfig: Record<
  Platform,
  { label: string; bg: string; text: string; letter: string }
> = {
  openai: {
    label: "OpenAI",
    bg: "bg-black",
    text: "text-white",
    letter: "O",
  },
  anthropic: {
    label: "Anthropic",
    bg: "bg-amber-700",
    text: "text-white",
    letter: "A",
  },
  gemini: {
    label: "Gemini",
    bg: "bg-blue-600",
    text: "text-white",
    letter: "G",
  },
  perplexity: {
    label: "Perplexity",
    bg: "bg-teal-600",
    text: "text-white",
    letter: "P",
  },
}

const sizeClass = {
  sm: "h-5 w-5 text-[10px]",
  md: "h-7 w-7 text-xs",
  lg: "h-9 w-9 text-sm",
}

export function PlatformIcon({ platform, size = "md", className }: PlatformIconProps) {
  const config = platformConfig[platform as Platform] ?? {
    label: platform,
    bg: "bg-zinc-500",
    text: "text-white",
    letter: platform.charAt(0).toUpperCase(),
  }

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full font-semibold flex-shrink-0",
        config.bg,
        config.text,
        sizeClass[size],
        className,
      )}
      title={config.label}
    >
      {config.letter}
    </span>
  )
}
