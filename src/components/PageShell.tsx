import type { ReactNode } from "react";
import "./PageShell.css";

/**
 * Centers every page's content in a fixed-width column, leaving the
 * leftover space on wide viewports as reserved rails for future ad
 * placements. The rails render as empty containers — no visible
 * placeholder chrome — and collapse entirely below --content-max-width
 * (see index.css), where the content column takes the full viewport width.
 */
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="page-shell">
      <aside className="page-shell__rail page-shell__rail--left" aria-hidden="true" />
      <div className="page-shell__content">{children}</div>
      <aside className="page-shell__rail page-shell__rail--right" aria-hidden="true" />
    </div>
  );
}
