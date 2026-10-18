// The job board's path. The site's front door ("/") is the static landing page
// (index.html); the app itself is served from app.html and its home is here.
export const BOARD_PATH = "/jobs";

// The board's old trial address, kept working for links shared while it was
// one. The header's search and filters drive it the same way as BOARD_PATH.
export const BOARD2_PATH = "/jobs2";

export function isBoardPath(pathname: string): boolean {
  return pathname === BOARD_PATH || pathname === BOARD2_PATH;
}
