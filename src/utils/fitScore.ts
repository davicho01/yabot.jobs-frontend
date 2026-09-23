// Used by ApplyPage's fitness report for its qualify/maybe cutoffs
// and verdict copy. Kept out of the page component so exporting these
// plain values doesn't break Fast Refresh for the page itself.
export const QUALIFY_THRESHOLD = 85;
export const MAYBE_THRESHOLD = 70;

// The one place these three bands are defined — fitLabel's verdict text and
// stamp color, and ApplyPage's alignment-bar color, both derive from
// this instead of repeating the 70/85 cutoffs.
export function fitTier(score: number): "positive" | "warning" | "negative" {
  if (score >= QUALIFY_THRESHOLD) return "positive";
  if (score >= MAYBE_THRESHOLD) return "warning";
  return "negative";
}

export function fitLabel(score: number): { text: string; stampClass: string } {
  const tier = fitTier(score);
  const text = tier === "positive" ? "Qualified" : tier === "warning" ? "Maybe" : "Not a match";
  return { text, stampClass: `stamp--${tier}` };
}
