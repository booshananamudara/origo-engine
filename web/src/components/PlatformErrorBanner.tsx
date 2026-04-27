const PLATFORM_LABELS: Record<string, string> = {
  openai:     "OpenAI",
  anthropic:  "Anthropic",
  perplexity: "Perplexity",
  gemini:     "Gemini",
};

// Maps common error substrings to actionable user-facing guidance
const HINTS: Array<[string, string]> = [
  ["credit balance is too low",    "Add credits in the Anthropic console → Plans & Billing."],
  ["upgrade or purchase credits",  "Add credits in the Anthropic console → Plans & Billing."],
  ["model not available on this",  "The model is not accessible on your account tier. Contact support or upgrade your plan."],
  ["no longer available to new",   "This model is restricted to existing users. The code has been updated — restart the container."],
  ["no longer available",          "Update the model name in the platform adapter."],
  ["quota",                        "API quota exceeded. Check your plan limits."],
  ["rate limit",                   "Too many requests — reduce MAX_CONCURRENT_PER_PLATFORM in .env."],
  ["invalid api key",              "The API key is invalid. Check your .env file."],
  ["authentication",               "Authentication failed. Verify the API key in your .env file."],
  ["permission",                   "The API key does not have permission for this model or endpoint."],
  ["not found",                    "The requested model or endpoint was not found. Check the model name."],
];

function hint(message: string): string | null {
  const lower = message.toLowerCase();
  for (const [fragment, guidance] of HINTS) {
    if (lower.includes(fragment)) return guidance;
  }
  return null;
}

interface Props {
  errors: Record<string, string>;
}

export function PlatformErrorBanner({ errors }: Props) {
  const entries = Object.entries(errors);
  if (entries.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-50 dark:bg-amber-950/30 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className="text-amber-500 shrink-0">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
          {entries.length === 1 ? "1 platform failed" : `${entries.length} platforms failed`} — results below are partial
        </p>
      </div>

      <ul className="space-y-2">
        {entries.map(([platform, message]) => {
          const actionHint = hint(message);
          return (
            <li key={platform} className="text-sm">
              <span className="font-semibold text-amber-700 dark:text-amber-300">
                {PLATFORM_LABELS[platform] ?? platform}:
              </span>{" "}
              <span className="text-amber-700 dark:text-amber-400">{message}</span>
              {actionHint && (
                <span className="block mt-0.5 text-xs text-amber-600 dark:text-amber-500 pl-2 border-l-2 border-amber-400/40">
                  → {actionHint}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
