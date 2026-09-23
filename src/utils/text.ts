// Splits a dense LLM-written paragraph (ResumeScore.summary etc.) into its
// individual sentences so callers can render "one idea per line" instead of
// one hard-to-scan wall of text. Keeps the terminal punctuation on each
// sentence; trims and drops anything empty (double spaces, trailing gaps).
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
