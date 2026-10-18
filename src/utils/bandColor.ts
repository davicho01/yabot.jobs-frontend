// The card-style pages' band colors: the eight from the landing page's
// scrolling job-card wall. A company's color is picked from a hash of its
// name, so the same company gets the same color on the board and on its
// apply page.
export const BAND_COLORS = [
  "#ec008c", // magenta
  "#364ea9", // blue
  "#fc8b67", // coral
  "#cdea8f", // lime
  "#1f1a35", // plum
  "#de588a", // rose
  "#ffd46d", // sun
  "#7b61ff", // violet
];

export function bandIndex(name: string): number {
  let h = 0;
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % BAND_COLORS.length;
}

export function bandColor(name: string): string {
  return BAND_COLORS[bandIndex(name)];
}
