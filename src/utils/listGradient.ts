// The card lists' band colors (job search, applications, the apply page's
// steps): one bold run, violet through blue and teal into green. Every band
// sweeps diagonally (BAND_ANGLE) across its own slice of the run.
export const LIST_GRADIENT = ["#7c3aed", "#2563eb", "#0d9488", "#16a34a"];

export const BAND_ANGLE = "110deg";

// The color at t (0 to 1) along the run.
export function gradientColor(t: number): string {
  const span = Math.min(Math.max(t, 0), 1) * (LIST_GRADIENT.length - 1);
  const i = Math.min(Math.floor(span), LIST_GRADIENT.length - 2);
  const mix = Math.round((span - i) * 100);
  // oklch keeps the in-between colors as saturated as the stops (oklab
  // greys them out between hues this far apart).
  return `color-mix(in oklch, ${LIST_GRADIENT[i]}, ${LIST_GRADIENT[i + 1]} ${mix}%)`;
}

// Lists walk the run from violet to green over CYCLE cards, then back again,
// and so on: each card's band ends exactly where the next card's begins, so
// the list reads as one unbroken ribbon, and neighbors always differ.
export const CYCLE = 4;

// Where card `index` sits along the run: 0, ¼, ½, ¾, 1, ¾, ½, ¼, 0, …
function walk(index: number): number {
  return 1 - Math.abs(((index / CYCLE) % 2) - 1);
}

// The card's own color: where its band starts.
export function listColor(index: number): string {
  return gradientColor(walk(index));
}

// Where the card's diagonal band ends: the next card's start.
export function listColorEnd(index: number): string {
  return gradientColor(walk(index + 1));
}

// The apply page's steps: one slice each, end to end, so the five bands join
// into one continuous sweep.
export function sliceBand(index: number, count: number): string {
  return `linear-gradient(${BAND_ANGLE}, ${gradientColor(index / count)}, ${gradientColor((index + 1) / count)})`;
}
