import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { SHOW_HEADER_EVENT } from "../components/Header";

type Pane = "list" | "detail";

interface Options {
  /** The row that scrolls sideways between the two panes. */
  pager: RefObject<HTMLElement | null>;
  list: RefObject<HTMLElement | null>;
  detail: RefObject<HTMLElement | null>;
  /** Whether the panes take turns at all (phones); off, this does nothing. */
  enabled: () => boolean;
  selectedId: string | null;
  /** The detail was swiped (or scrolled) back off: close it. */
  onBack: () => void;
}

// How long a pane stays pinned while the page jumps under it (see goLive).
const PIN_MS = 120;

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Phone master/detail as two screens side by side in a row that scrolls
 * sideways (see the .board--split rules in JobBoardPage.css), while the page
 * itself still scrolls up and down — so the browser's own bars still shrink
 * away as you scroll, which they don't for a pane scrolling inside the page.
 *
 * The page has only one scroll position, though, and two panes that should
 * each keep their own. So only the pane on screen is "live" (in the page,
 * scrolled by it); the other is "frozen": clipped to one screen's height,
 * scrolled inside itself to the spot it was left at, and shifted down to
 * wherever the page is scrolled, so that a swipe reveals it exactly as it
 * was. Once a swipe settles on it, the two trade places in one go — the one
 * that left freezes, this one goes live, and the page jumps to its spot —
 * with nothing on screen moving.
 */
export function usePanePager({ pager, list, detail, enabled, selectedId, onBack }: Options) {
  const live = useRef<Pane>("list");
  // Where the page was scrolled to for each pane, when it last left it.
  const saved = useRef<Record<Pane, number>>({ list: 0, detail: 0 });
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;

  const el = useCallback((pane: Pane) => (pane === "list" ? list.current : detail.current), [list, detail]);
  const pagerTop = useCallback(() => (pager.current?.getBoundingClientRect().top ?? 0) + window.scrollY, [pager]);

  // Lines a frozen pane up with the screen for the page's current scroll.
  const place = useCallback(
    (pane: Pane) => {
      const node = el(pane);
      if (!node || !("frozen" in node.dataset)) return;
      const top = pagerTop();
      const spot = saved.current[pane];
      const inside = Math.max(0, spot - top);
      node.scrollTop = inside;
      node.style.transform = `translateY(${window.scrollY - spot + inside}px)`;
    },
    [el, pagerTop],
  );

  const freeze = useCallback(
    (pane: Pane) => {
      const node = el(pane);
      if (!node) return;
      node.dataset.frozen = "";
      place(pane);
    },
    [el, place],
  );

  const thaw = useCallback(
    (pane: Pane) => {
      const node = el(pane);
      if (!node) return;
      delete node.dataset.frozen;
      node.style.removeProperty("transform");
    },
    [el],
  );

  // A hand-off in progress: the pane being pinned while the page jumps.
  const handoff = useRef(0);

  const goLive = useCallback(
    (pane: Pane) => {
      const from = live.current;
      if (pane === from) return;
      const node = el(pane);
      const slot = node?.parentElement;
      if (!node || !slot) return;
      saved.current[from] = window.scrollY;
      live.current = pane;
      const target = saved.current[pane];

      // The page has to jump to this pane's spot, but a phone can draw that
      // jump a frame apart from any change to the page, which flickers. So
      // the pane is pinned to the screen exactly where it shows now (its slot
      // keeps its room in the row, and the page's length), the page jumps
      // underneath it, and only once the jump has landed does it go back into
      // the page — where it then sits exactly as it was pinned.
      const box = node.getBoundingClientRect();
      const inside = node.scrollTop;
      slot.style.minHeight = `${node.scrollHeight}px`;
      node.style.position = "fixed";
      node.style.top = `${box.top}px`;
      node.style.left = `${box.left}px`;
      node.style.width = `${box.width}px`;
      node.style.transform = "none";
      node.scrollTop = inside;
      freeze(from);
      window.scrollTo(0, target);

      // The page reports the new scroll position at once, but a phone can
      // draw it a little later, so the pane stays pinned for a beat first.
      const id = ++handoff.current;
      window.setTimeout(() => {
        requestAnimationFrame(() => {
          if (id !== handoff.current) return;
          for (const prop of ["position", "top", "left", "width"]) node.style.removeProperty(prop);
          slot.style.removeProperty("min-height");
          thaw(pane);
          place(from);
        });
      }, PIN_MS);
    },
    [el, freeze, thaw, place],
  );

  // A job opened: the detail starts frozen at its top, and the row scrolls
  // over to it (straight there for a page loaded with ?jobId=).
  const openedByTap = useRef(false);
  useLayoutEffect(() => {
    const row = pager.current;
    if (!row || !enabled()) return;
    if (!selectedId) {
      if (live.current === "detail") goLive("list");
      thaw("detail");
      return;
    }
    saved.current.detail = 0;
    if (live.current === "detail") {
      window.scrollTo(0, 0);
      return;
    }
    freeze("detail");
    // The posting opens at its top, where the header belongs.
    window.dispatchEvent(new Event(SHOW_HEADER_EVENT));
    if (openedByTap.current && !reducedMotion()) {
      row.scrollTo({ left: row.clientWidth, behavior: "smooth" });
    } else {
      row.scrollLeft = row.clientWidth;
      goLive("detail");
    }
    openedByTap.current = false;
  }, [selectedId, pager, enabled, freeze, thaw, goLive]);

  useEffect(() => {
    const row = pager.current;
    if (!row) return;
    let timer = 0;
    // Wherever the row comes to rest, that pane goes live; back on the list,
    // the job closes.
    const settle = () => {
      window.clearTimeout(timer);
      if (!enabled()) return;
      const pane: Pane = row.scrollLeft > row.clientWidth / 2 ? "detail" : "list";
      goLive(pane);
      if (pane === "list" && selectedRef.current) onBackRef.current();
    };
    const onRowScroll = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(settle, 150);
    };
    // Keep the frozen pane lined up with the page as it scrolls, ready for a swipe.
    let frame = 0;
    const onPageScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        place(live.current === "list" ? "detail" : "list");
      });
    };
    const onTouchStart = () => place(live.current === "list" ? "detail" : "list");
    row.addEventListener("scroll", onRowScroll, { passive: true });
    row.addEventListener("scrollend", settle);
    row.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("scroll", onPageScroll, { passive: true });
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
      row.removeEventListener("scroll", onRowScroll);
      row.removeEventListener("scrollend", settle);
      row.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("scroll", onPageScroll);
    };
  }, [pager, enabled, goLive, place]);

  /** Mark the next opening as a tap, which slides over rather than jumping. */
  const markTap = useCallback(() => {
    openedByTap.current = true;
  }, []);

  /** Slide back to the list (the All jobs pill); it closes once there. */
  const back = useCallback(() => {
    const row = pager.current;
    if (row && enabled() && row.scrollLeft > 0) {
      row.scrollTo({ left: 0, behavior: reducedMotion() ? "auto" : "smooth" });
    } else {
      onBackRef.current();
    }
  }, [pager, enabled]);

  return { markTap, back };
}
