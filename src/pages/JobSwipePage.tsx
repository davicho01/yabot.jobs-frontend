import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { jobsApi, type WorkplaceTypeFilter } from "../api/jobs";
import type { JobDetail } from "../api/types";
import { CompanySiteLink, JobCaseFile } from "../components/JobCaseFile";
import CompanyLogo from "../components/CompanyLogo";
import { BriefcaseIcon } from "../components/PillIcons";
import { boardSector } from "../utils/jobTags";
import { scannedPosting } from "../utils/jobPosting";
import { listColor, listColorEnd } from "../utils/listGradient";
import { trackEvent } from "../utils/analytics";
import { FoundBadge } from "./JobBoardPage";
import { REVEAL_HEADER_EVENT } from "../components/Header";
import { SignInModal } from "../components/SignInModal";
import { SignInPromptContext } from "../auth/signInPrompt";
import "./JobBoardPage.css";
import "./JobBoardCards.css";
import "./JobSwipePage.css";

// Fetch the next page of results once the visitor is this close to the end.
const PREFETCH_AHEAD = 3;
// Postings drawn in full on each side of the one on screen; the rest are
// empty screens of the same width, so a long run of results stays light.
const RENDER_AHEAD = 1;

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
// and coming back lands on the same screen of the same search.
let lastPlace = { filters: "", index: 0 };

// The phone board's "swipe" side of the search layout test (see
// utils/experiments): one posting per screen, the same card the list opens,
// and a sideways swipe moves to the next result or back to the one before.
// Reads the same URL search and filters as JobBoardPage, set from <Header>.
//
// Like the list's phone layout (JobBoardPage.css), the row of screens is the
// browser's own snapping sideways scroll, and each screen scrolls up and
// down on its own.
export function JobSwipePage() {
  const { user } = useAuth();
  // Signed out, Apply ↗ signs in right here, then goes on to the company.
  const [signInFor, setSignInFor] = useState<JobDetail | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const query = searchParams.get("q") ?? "";
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

  const { data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } = useInfiniteQuery({
    queryKey: ["jobs-swipe", filters],
    queryFn: ({ pageParam }) => jobsApi.list({ ...filters, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.page_size < last.total ? last.page + 1 : undefined),
  });
  const jobs: JobDetail[] = data?.pages.flatMap((page) => page.items) ?? [];
  const total = data?.pages[0]?.total ?? 0;

  const filtersKey = JSON.stringify(filters);
  const [index, setIndex] = useState(() => (lastPlace.filters === filtersKey ? lastPlace.index : 0));
  const trackRef = useRef<HTMLDivElement>(null);
  lastPlace = { filters: filtersKey, index };

  // A new search starts again at its first result.
  const shownFilters = useRef(filtersKey);
  useEffect(() => {
    if (shownFilters.current === filtersKey) return;
    shownFilters.current = filtersKey;
    setIndex(0);
    setShown(0);
    trackRef.current?.scrollTo({ left: 0 });
  }, [filtersKey]);

  // Back from elsewhere: once the results are drawn, return to the screen
  // the visitor left.
  const restored = useRef(index === 0);
  useLayoutEffect(() => {
    const track = trackRef.current;
    if (restored.current || !track || jobs.length <= index) return;
    restored.current = true;
    track.scrollTo({ left: index * track.clientWidth });
  }, [jobs.length, index]);

  // The count follows the swipe as it moves: whichever posting is mostly on
  // screen. The rest of the page waits for the swipe to settle (below).
  const [shown, setShown] = useState(index);

  // Which screen the row has settled on, once a swipe comes to rest.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let timer = 0;
    const onScroll = () => {
      setShown(Math.round(track.scrollLeft / track.clientWidth));
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        setIndex(Math.round(track.scrollLeft / track.clientWidth));
      }, 120);
    };
    track.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.clearTimeout(timer);
      track.removeEventListener("scroll", onScroll);
    };
  }, []);

  const current = jobs[index];
  const currentId = current?.url.id;
  useEffect(() => {
    if (currentId) trackEvent("job_view", { job_id: currentId, layout: "swipe", position: index + 1 });
    // Counted once per posting landed on, not again when more results load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);

  // The header slides away as soon as a posting scrolls down (Header.tsx),
  // and the row of postings moves up with it (JobSwipePage.css), so the
  // top of every posting's scroll is always just under the count row: a
  // flick back up slows and stops there the way any scroll stops at its top.
  // Scrolling never brings the header back; pulling a posting on past its
  // top by REVEAL_PULL_PX of finger travel does.
  //
  // And each gesture moves at most one posting, decided by the finger rather
  // than by wherever the row happens to be: a sideways swipe of
  // SWIPE_MIN_PX or more, or a quick flick, goes one posting over in its
  // direction, anything less back to where it started, and a mostly
  // up-and-down one never changes postings. Each swipe counts from the posting the last one was heading
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
    // The posting the row is on or gliding to.
    let target = Math.round(track.scrollLeft / track.clientWidth);
    const headerHidden = () => !!document.querySelector(".site-header--hidden");
    // When a gesture last chose `target`.
    let chosenAt = 0;
    const goTo = (i: number) => {
      const last = track.querySelectorAll(".board__detail").length - 1;
      target = Math.max(0, Math.min(last, i));
      chosenAt = Date.now();
      const left = target * track.clientWidth;
      if (Math.abs(track.scrollLeft - left) > 1) {
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        requestAnimationFrame(() => track.scrollTo({ left, behavior: reduced ? "auto" : "smooth" }));
      }
    };
    // Where the row comes to rest. Just after a gesture, it has to be the
    // posting that gesture chose: the browser's own fling can start after
    // goTo and carry the row on past it, so it's brought back. Otherwise
    // (a restored place, a new search) wherever it rests is the posting now.
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
    if (hasNextPage && !isFetchingNextPage && index >= jobs.length - PREFETCH_AHEAD) fetchNextPage();
  }, [index, jobs.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <SignInPromptContext.Provider value={setSignInFor}>
    <div className="board board--split board--detail-open board--cards board--swipe">
      {/* Stays put while the cards swipe underneath: where this posting sits
          in the results, and My applications, as on the list's open posting. */}
      {jobs.length > 0 && (
        <div className="board__detail-top swipe__top">
          <span className="swipe__count">
            {(Math.min(shown, jobs.length - 1) + 1).toLocaleString()} / {total.toLocaleString()}
            {total >= 1000 ? "+" : ""}
          </span>
          <Link to="/applications" className="board__detail-applications">
            <BriefcaseIcon />
            My applications
          </Link>
        </div>
      )}
      <div className="board__layout" ref={trackRef} data-header-reveal="hold">
        {isLoading && (
          <div className="board__detail">
            <p className="board__empty">Loading postings…</p>
          </div>
        )}
        {!isLoading && jobs.length === 0 && (
          <div className="board__detail">
            <p className="board__empty">No postings match your filters.</p>
          </div>
        )}
        {jobs.map((job, i) => (
          <div
            className="board__detail board__detail--swipe"
            key={job.url.id}
            aria-hidden={i !== index || undefined}
            data-header-reveal="top"
          >
            {/* Room for the header and the count row. */}
            <div className="swipe__spacer" />
            {Math.abs(i - index) <= RENDER_AHEAD && (
              <SwipeCard job={job} index={i} query={query} user={user} onSelectSimilar={(id) => navigate(`/jobs/${id}`)} />
            )}
          </div>
        ))}
        {isFetchingNextPage && (
          <div className="board__detail">
            <p className="board__empty">Loading more postings…</p>
          </div>
        )}
      </div>

      {signInFor && <SignInModal job={signInFor} onClose={() => setSignInFor(null)} />}
    </div>
    </SignInPromptContext.Provider>
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
        <CompanySiteLink job={job} className="board__detail-apply">
          Apply ↗
        </CompanySiteLink>
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
