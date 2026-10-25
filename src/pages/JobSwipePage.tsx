import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { PAGE_SIZE, jobsApi, type WorkplaceTypeFilter } from "../api/jobs";
import type { JobDetail, JobList } from "../api/types";
import { JobCaseFile } from "../components/JobCaseFile";
import { JobBandActions } from "../components/JobBandActions";
import CompanyLogo from "../components/CompanyLogo";
import { BriefcaseIcon, ListIcon } from "../components/PillIcons";
import { boardSector } from "../utils/jobTags";
import { scannedPosting } from "../utils/jobPosting";
import { listColor, listColorEnd } from "../utils/listGradient";
import { trackEvent } from "../utils/analytics";
import { FoundBadge } from "./JobBoardPage";
import { REVEAL_HEADER_EVENT } from "../components/Header";
import { boardReturn } from "../utils/boardReturn";
import "./JobBoardPage.css";
import "./JobBoardCards.css";
import "./JobSwipePage.css";

// Fetch the next page of results once the visitor is this close to the end.
const PREFETCH_AHEAD = 3;
// Postings drawn in full on each side of the one on screen (and of the one
// the row last settled on, which a quick run of swipes gets ahead of); the
// rest are empty screens of the same width, so a long run of results stays
// light.
const RENDER_AHEAD = 2;

// How far a finger has to drag a posting on past its top to bring the
// header back.
const REVEAL_PULL_PX = 90;
// How far a finger moves before its gesture counts as a scroll or a swipe,
// and how much more sideways than up-and-down it has to be for a swipe:
// a diagonal counts as a scroll.
const DIRECTION_LOCK_PX = 8;
const SWIPE_BIAS = 1.2;
// How far sideways a swipe has to move to go to the next posting, or, for a
// quick flick, how far and how fast (px per ms).
const SWIPE_MIN_PX = 40;
const FLICK_MIN_PX = 10;
const FLICK_SPEED = 0.2;
const FLICK_WINDOW_MS = 100;
// For this long after a gesture, the row is held to the posting it chose.
const GESTURE_HOLD_MS = 1500;

// Where the visitor was, so leaving for a posting's own page (a similar job)
// and coming back lands on the same screen.
let lastPlace = { key: "", index: 0 };

// The phone board: one row of screens, the list (JobBoardPage's, passed
// in as `list`) first, and once a card is tapped, the results from that
// posting on, one per screen, sliding in beside the list. A sideways swipe
// moves to the next posting or back to the one before, and from the first
// one back to the list, which slides in the way it slid out; so does All
// jobs. The URL says which posting was opened
// (?view=posting&job=<id>), on top of the list's own search, filters and
// page.
//
// Like the list's phone layout (JobBoardPage.css), the row of screens is the
// browser's own snapping sideways scroll, and each screen scrolls up and
// down on its own.
export function JobSwipePage({ list, firstPage }: { list: ReactNode; firstPage?: JobList }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const query = searchParams.get("q") ?? "";
  const openedId = searchParams.get("job") ?? "";
  const listPage = Number(searchParams.get("page")) || 1;
  const filters = {
    q: query || undefined,
    location: searchParams.get("location") || undefined,
    metro: searchParams.get("metro") || undefined,
    radius: Number(searchParams.get("radius")) || undefined,
    company: searchParams.get("company") || undefined,
    postedWithinDays: Number(searchParams.get("posted")) || undefined,
    workplaceType: (searchParams.get("workplace") as WorkplaceTypeFilter | null) ?? undefined,
    sector: boardSector(searchParams),
    salaryMin: Number(searchParams.get("salaryMin")) || undefined,
    salaryMax: Number(searchParams.get("salaryMax")) || undefined,
  };
  // The results from the list's page on (starting from the page the list
  // already has), more fetched as the visitor nears the end, shown from the
  // posting tapped: the ones before it are on the list, a swipe back.
  const results = useInfiniteQuery({
    queryKey: ["jobs-swipe", filters, listPage],
    queryFn: ({ pageParam }) => jobsApi.list({ ...filters, page: pageParam }),
    initialPageParam: listPage,
    initialData: firstPage ? { pages: [firstPage], pageParams: [listPage] } : undefined,
    getNextPageParam: (last) => (last.page * last.page_size < last.total ? last.page + 1 : undefined),
    enabled: !!openedId,
  });
  const { hasNextPage, isFetchingNextPage, fetchNextPage, isLoading } = results;
  const opened = !!openedId;
  const fromListPage = opened ? (results.data?.pages.flatMap((page) => page.items) ?? []) : [];
  const tapped = Math.max(0, fromListPage.findIndex((job) => job.url.id === openedId));
  const jobs: JobDetail[] = fromListPage.slice(tapped);
  const total = results.data?.pages[0]?.total ?? 0;
  // The first posting here is this far into the whole result list.
  const offset = (listPage - 1) * PAGE_SIZE + tapped;

  const placeKey = JSON.stringify([filters, listPage, openedId]);
  // Which posting the row is on (its screen is index + 1, after the list);
  // -1 on the list, and until the results are in and it's been put on the
  // first, the one tapped (or back where it was, see lastPlace).
  const [index, setIndex] = useState(() => (lastPlace.key === placeKey ? lastPlace.index : -1));
  const [placedFor, setPlacedFor] = useState<string | null>(null);
  const [shownKey, setShownKey] = useState(placeKey);
  if (shownKey !== placeKey) {
    setShownKey(placeKey);
    setIndex(-1);
    setPlacedFor(null);
  }
  const trackRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  if (opened && index >= 0) lastPlace = { key: placeKey, index };
  if (opened && index < 0 && jobs.length > 0) setIndex(0);

  // Steers the row to a screen (set by the gesture effect below, which keeps
  // track of where the row is headed).
  const goToRef = useRef<(screen: number, instant?: boolean) => void>(() => {});

  // Onto the posting tapped: sliding over from the list when it was just
  // tapped there, or straight there when the board opened on it (a link to
  // a posting, or back from a similar job's page).
  const openedOnLoad = useRef(opened ? placeKey : null);
  useLayoutEffect(() => {
    if (!opened || placedFor === placeKey || index < 0 || jobs.length <= index) return;
    setPlacedFor(placeKey);
    goToRef.current(index + 1, placeKey === openedOnLoad.current);
  }, [opened, placeKey, placedFor, jobs.length, index]);

  // Headed back to the list: it turns to the page of the posting on screen
  // (JobBoardPage, through boardReturn), or if that's the page it's on,
  // brings its card into view, before it slides in. And the header comes
  // back for it.
  const returnPage = useRef(listPage);
  const onReturn = () => {
    const at = jobs[Math.max(0, index)];
    returnPage.current = listPage + Math.floor((tapped + Math.max(0, index)) / PAGE_SIZE);
    if (returnPage.current === listPage) {
      if (at) document.querySelector(`[data-job-id="${at.url.id}"]`)?.scrollIntoView({ block: "nearest" });
    } else if (at) {
      boardReturn.jobId = at.url.id;
      boardReturn.page = returnPage.current;
    }
    window.dispatchEvent(new Event(REVEAL_HEADER_EVENT));
  };
  const onReturnRef = useRef(onReturn);
  // Back on the list: the postings close.
  const closePostings = () => {
    if (!opened) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("view");
        next.delete("job");
        if (returnPage.current > 1) next.set("page", String(returnPage.current));
        else next.delete("page");
        return next;
      },
      { replace: true },
    );
  };
  const closePostingsRef = useRef(closePostings);
  useEffect(() => {
    onReturnRef.current = onReturn;
    closePostingsRef.current = closePostings;
  });

  // A new search from the header goes back to the list with it.
  const filtersKey = JSON.stringify(filters);
  const shownFilters = useRef(filtersKey);
  useEffect(() => {
    if (shownFilters.current === filtersKey) return;
    shownFilters.current = filtersKey;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("view");
        next.delete("job");
        next.delete("page");
        return next;
      },
      { replace: true },
    );
  }, [filtersKey, setSearchParams]);

  // The count follows the swipe as it moves: whichever posting is mostly on
  // screen. The rest of the page waits for the swipe to settle (below).
  const [shown, setShown] = useState(Math.max(0, index));

  // Which screen the row has settled on, once a swipe comes to rest. The
  // row above the postings fades out as the list slides in.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let timer = 0;
    const onScroll = (event: Event) => {
      if (event.target !== track) return;
      const screens = track.scrollLeft / track.clientWidth;
      setShown(Math.max(0, Math.round(screens) - 1));
      if (topRef.current) topRef.current.style.opacity = String(Math.min(1, screens));
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const screen = Math.round(track.scrollLeft / track.clientWidth);
        if (screen === 0) closePostingsRef.current();
        else setIndex(screen - 1);
      }, 120);
    };
    track.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.clearTimeout(timer);
      track.removeEventListener("scroll", onScroll);
    };
  }, []);

  const current = index >= 0 ? jobs[index] : undefined;
  const currentId = current?.url.id;
  useEffect(() => {
    if (currentId) trackEvent("job_view", { job_id: currentId, position: offset + index + 1 });
    // Counted once per posting landed on, not again when more results load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);

  // The header slides away as soon as a posting scrolls down (Header.tsx),
  // and the postings move up with it (JobSwipePage.css), so the top of every
  // posting's scroll is always just under the count row: a flick back up
  // slows and stops there the way any scroll stops at its top. Scrolling
  // never brings the header back; pulling a posting on past its top by
  // REVEAL_PULL_PX of finger travel does.
  //
  // And each gesture moves at most one screen, decided by the finger rather
  // than by wherever the row happens to be: a sideways swipe of
  // SWIPE_MIN_PX or more, or a quick flick, goes one screen over in its
  // direction, anything less back to where it started, and a mostly
  // up-and-down one never changes screens. Each swipe counts from the screen the last one was heading
  // to, so a finger landing while a swipe is still gliding into place (which
  // the browser hands to the row, not the posting) can't send it back or on
  // to another. The row is only steered once the finger lifts: changing its
  // scrolling mid-gesture made iOS stall the scroll in progress.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    // Where the finger was when the posting under it reached its top.
    let pullFrom: number | null = null;
    let start: { x: number; y: number; index: number } | null = null;
    let lastX = 0;
    // Recent finger positions, for how fast it was going as it lifted.
    let samples: { x: number; t: number }[] = [];
    let axis: "x" | "y" | null = null;
    // The screen the row is on or gliding to.
    let target = Math.round(track.scrollLeft / track.clientWidth);
    const headerHidden = () => !!document.querySelector(".site-header--hidden");
    // When a gesture last chose `target`.
    let chosenAt = 0;
    const goTo = (i: number, instant = false) => {
      const was = target;
      target = Math.max(0, Math.min(track.children.length - 1, i));
      chosenAt = Date.now();
      if (target === 0 && was !== 0) onReturnRef.current();
      const left = target * track.clientWidth;
      if (Math.abs(track.scrollLeft - left) > 1) {
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const behavior = instant || reduced ? "auto" : "smooth";
        requestAnimationFrame(() => track.scrollTo({ left, behavior }));
      }
    };
    goToRef.current = goTo;
    // Where the row comes to rest. Just after a gesture, it has to be the
    // screen that gesture chose: the browser's own fling can start after
    // goTo and carry the row on past it, so it's brought back. Otherwise
    // (a restored place, a new search) wherever it rests is the screen now.
    let restTimer = 0;
    const onTrackScroll = (event: Event) => {
      if (event.target !== track) return;
      window.clearTimeout(restTimer);
      restTimer = window.setTimeout(() => {
        if (start) return;
        const at = Math.round(track.scrollLeft / track.clientWidth);
        if (at === target) return;
        if (Date.now() - chosenAt < GESTURE_HOLD_MS) goTo(target);
        else target = at;
      }, 120);
    };
    const onTouchStart = (event: TouchEvent) => {
      pullFrom = null;
      const touch = event.touches[0];
      start = event.touches.length === 1 && touch ? { x: touch.clientX, y: touch.clientY, index: target } : null;
      lastX = touch?.clientX ?? 0;
      samples = touch ? [{ x: touch.clientX, t: event.timeStamp }] : [];
      axis = null;
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length > 0 || !start) return;
      const dx = lastX - start.x;
      // Far enough, or a quick flick: how fast the finger was going as it
      // lifted, as the browser's own fling judges it.
      const first = samples[0];
      const latest = samples[samples.length - 1];
      const speed = first && latest ? Math.abs(latest.x - first.x) / Math.max(1, latest.t - first.t) : 0;
      const swiped = Math.abs(dx) >= SWIPE_MIN_PX || (Math.abs(dx) >= FLICK_MIN_PX && speed >= FLICK_SPEED);
      if (axis === "x" && swiped) goTo(start.index + (dx < 0 ? 1 : -1));
      else goTo(start.index);
      start = null;
      axis = null;
    };
    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (touch) {
        lastX = touch.clientX;
        samples.push({ x: touch.clientX, t: event.timeStamp });
        while (samples.length > 2 && event.timeStamp - samples[0].t > FLICK_WINDOW_MS) samples.shift();
      }
      if (start && touch && !axis) {
        const dx = Math.abs(touch.clientX - start.x);
        const dy = Math.abs(touch.clientY - start.y);
        if (Math.max(dx, dy) >= DIRECTION_LOCK_PX) {
          axis = dx > dy * SWIPE_BIAS ? "x" : "y";
        }
      }
      const slide = event.target instanceof Element ? event.target.closest(".board__detail--swipe") : null;
      const y = touch?.clientY;
      if (!slide || y === undefined) return;
      if (slide.scrollTop > 0) {
        pullFrom = null;
        return;
      }
      pullFrom ??= y;
      if (y - pullFrom > REVEAL_PULL_PX && headerHidden()) window.dispatchEvent(new Event(REVEAL_HEADER_EVENT));
    };
    track.addEventListener("scroll", onTrackScroll, { passive: true });
    track.addEventListener("touchstart", onTouchStart, { passive: true });
    track.addEventListener("touchmove", onTouchMove, { passive: true });
    track.addEventListener("touchend", onTouchEnd, { passive: true });
    track.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      window.clearTimeout(restTimer);
      track.removeEventListener("scroll", onTrackScroll);
      track.removeEventListener("touchstart", onTouchStart);
      track.removeEventListener("touchmove", onTouchMove);
      track.removeEventListener("touchend", onTouchEnd);
      track.removeEventListener("touchcancel", onTouchEnd);
    };
  }, []);

  useEffect(() => {
    if (opened && hasNextPage && !isFetchingNextPage && index >= jobs.length - PREFETCH_AHEAD) fetchNextPage();
  }, [opened, index, jobs.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div className={`board board--split board--cards board--swipe${opened ? " board--detail-open" : ""}`}>
      {/* Stays put while the cards scroll and swipe underneath: the way back
          to the list, where this posting sits in the results, and My
          applications, as on the list's open posting. */}
      {opened && (
        <div className="board__detail-top swipe__top" ref={topRef} style={{ opacity: 0 }}>
          <button type="button" className="board__back board__back--top" onClick={() => goToRef.current(0, index > 0)}>
            <ListIcon />
            All jobs
          </button>
          {jobs.length > 0 && (
            <span className="swipe__count">
              {(offset + Math.min(shown, jobs.length - 1) + 1).toLocaleString()} / {total.toLocaleString()}
              {total >= 1000 ? "+" : ""}
            </span>
          )}
          <Link to="/applications" className="board__detail-applications">
            <BriefcaseIcon />
            My applications
          </Link>
        </div>
      )}
      <div className="board__layout" ref={trackRef} data-header-reveal="hold">
        {list}
        {opened && isLoading && (
          <div className="board__detail">
            <p className="board__empty">Loading postings…</p>
          </div>
        )}
        {jobs.map((job, i) => (
          <div
            className="board__detail board__detail--swipe"
            key={job.url.id}
            aria-hidden={i !== index || undefined}
            data-header-reveal="top"
          >
            {/* Room for the header and the row above the card. */}
            <div className="swipe__spacer" />
            {index >= 0 && (Math.abs(i - index) <= RENDER_AHEAD || Math.abs(i - shown) <= RENDER_AHEAD) && (
              <SwipeCard
                job={job}
                index={offset + i}
                query={query}
                user={user}
                onSelectSimilar={(id) => navigate(`/jobs/${id}`)}
              />
            )}
          </div>
        ))}
        {isFetchingNextPage && (
          <div className="board__detail">
            <p className="board__empty">Loading more postings…</p>
          </div>
        )}
      </div>
    </div>
  );
}

function SwipeCard({
  job,
  index,
  query,
  user,
  onSelectSimilar,
}: {
  job: JobDetail;
  index: number;
  query: string;
  user: ReturnType<typeof useAuth>["user"];
  onSelectSimilar: (urlId: string) => void;
}) {
  const posting = scannedPosting(job);
  const company = posting?.company_name ?? job.url.domain;
  const queryClient = useQueryClient();
  const rescan = useMutation({
    mutationFn: () => jobsApi.rescan(job.url.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["jobs-swipe"] }),
  });
  return (
    <div className="board__detail-inner">
      <div
        className="board__detail-band"
        style={{ "--band-card-color": listColor(index), "--band-card-color-end": listColorEnd(index) } as CSSProperties}
      >
        <span className="board__detail-tile">
          <CompanyLogo name={company} logoUrl={posting?.company_logo_url} size={40} />
        </span>
        <FoundBadge job={job} />
        <JobBandActions job={job} company={company} />
      </div>
      <JobCaseFile
        job={job}
        user={user}
        isRescanning={rescan.isPending}
        rescanFailed={rescan.isError}
        onRescan={() => rescan.mutate()}
        titleHighlightQuery={query}
        onSelectSimilar={onSelectSimilar}
        boardCards
        showDates
      />
    </div>
  );
}
