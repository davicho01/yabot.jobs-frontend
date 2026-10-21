import { useCallback, useEffect, useLayoutEffect, useRef, type CSSProperties } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { jobsApi, type WorkplaceTypeFilter } from "../api/jobs";
import { adminApi } from "../api/admin";
import { applicationsApi } from "../api/applications";
import type { JobDetail, JobPosting } from "../api/types";
import { useConfirm } from "../components/ConfirmDialog";
import { CompanySiteLink, JobCaseFile } from "../components/JobCaseFile";
import { Footer } from "../components/Footer";
import { GettingStartedBanner } from "../components/GettingStarted";
import { highlightQuery } from "../utils/searchHighlight";
import {
  DEFAULT_SECTOR,
  SECTOR_SHORT_LABELS,
  boardSector,
  employmentLabel,
  sectorLabel,
  workplaceLabel,
} from "../utils/jobTags";
import { jobAge, shortLocation, type JobAgeTone } from "../utils/jobPosting";
import { fitTier } from "../utils/fitScore";
import { bandColor } from "../utils/bandColor";
import { listColor, listColorEnd } from "../utils/listGradient";
import "./JobBoardPage.css";
import "./JobBoardCards.css";
import CompanyLogo from "../components/CompanyLogo";
import { BriefcaseIcon, ListIcon } from "../components/PillIcons";

// Must match the max-width of the phone breakpoint in JobBoardPage.css, where
// the list and detail panes stop sitting side by side and take turns instead.
const SPLIT_COLLAPSED_QUERY = "(max-width: 760px)";
// A city search can be widened in steps up to the server's limit.
const RADIUS_STEP = 25;
const MAX_RADIUS = 100;

// A JobPosting row exists from the moment its URL is submitted (see
// get_or_create_job_posting) so job_posting_id is available right away —
// scanned/not-scanned is tracked by extraction_status, not by the posting
// being present at all.
function scannedPosting(job: JobDetail): JobPosting | null {
  return job.posting && job.posting.extraction_status !== "pending" ? job.posting : null;
}

// A card's pay label: "$184K–$288K" instead of the job page's "USD 184,000–287,500",
// so it fits beside the other labels. Hourly amounts stay exact ("$20–$26").
function formatSalaryShort(job: JobDetail): string | null {
  const p = scannedPosting(job);
  if (!p || (!p.salary_min && !p.salary_max)) return null;
  let format: (n: number) => string;
  try {
    const compact = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: p.salary_currency || "USD",
      notation: "compact",
      maximumFractionDigits: 0,
    });
    format = (n) => compact.format(n);
  } catch {
    // Not a currency code Intl knows: plain numbers after the code, as before.
    format = (n) => `${p.salary_currency ?? ""} ${n.toLocaleString()}`.trim();
  }
  if (p.salary_min && p.salary_max && p.salary_min !== p.salary_max) {
    return `${format(p.salary_min)}–${format(p.salary_max)}`;
  }
  return format((p.salary_min || p.salary_max)!);
}

// "Posted 1h ago" (green), "Posted 1d ago" (amber), "Posted 5d ago" (gray)
// for a job under 7 days old — same age rule and colors as the job page's
// "Found 20m ago!" badge (see jobAge) — and the date ("Posted Oct 1, 2026")
// after that.
function postedLabel(job: JobDetail): { text: string; tone: JobAgeTone | null } | null {
  const age = jobAge(job);
  if (age) return { text: `Posted ${age.ago}`, tone: age.tone };
  const p = scannedPosting(job);
  if (!p?.posted_at) return null;
  // posted_at is a date-only string (YYYY-MM-DD) — parsing it as UTC and
  // formatting with the same zone keeps the displayed day from shifting
  // backward for anyone west of UTC.
  const date = new Date(`${p.posted_at}T00:00:00Z`);
  return {
    text: `Posted ${date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}`,
    tone: null,
  };
}

function JobCard({
  job,
  active,
  query,
  onSelect,
}: {
  job: JobDetail;
  active: boolean;
  query: string;
  onSelect: () => void;
}) {
  const posting = scannedPosting(job);
  return (
    <button type="button" className={`job-card${active ? " job-card--active" : ""}`} onClick={onSelect}>
      <span className="job-card__edge" data-type={posting?.workplace_type ?? "unknown"} />
      <div className="job-card__body">
        {/* Company first, logo beside its name, then the title — same order as the job page it opens. */}
        <div className="job-card__employer">
          <CompanyLogo name={posting?.company_name ?? job.url.domain} logoUrl={posting?.company_logo_url} size={32} />
          <span>{posting?.company_name ?? job.url.domain}</span>
        </div>
        <div className="job-card__title">
          {posting?.title ? highlightQuery(posting.title, query) : "Scanning posting…"}
        </div>
        {posting?.location && <div className="job-card__meta">{posting.location}</div>}
        {posting && (
          <div className="job-card__tags">
            {workplaceLabel(posting.workplace_type) && (
              <span className={`tag tag--workplace-${posting.workplace_type}`}>{workplaceLabel(posting.workplace_type)}</span>
            )}
            {/* Full-time is most jobs, so a card only calls out the exceptions; the job page shows it. */}
            {posting.employment_type !== "full_time" && employmentLabel(posting.employment_type) && (
              <span className="tag">{employmentLabel(posting.employment_type)}</span>
            )}
            {/* Same blue label as the job page's pay tag, shortened to fit a card. */}
            {formatSalaryShort(job) && <span className="tag tag--accent">{formatSalaryShort(job)}</span>}
            {postedLabel(job) && (
              <span className={`job-card__posted${postedLabel(job)!.tone ? ` job-card__posted--${postedLabel(job)!.tone}` : ""}`}>
                {postedLabel(job)!.text}
              </span>
            )}
          </div>
        )}
      </div>
    </button>
  );
}

// The board's card: a colored band (see bandColor) with the logo on a white
// tile and, for a job already scored, its best fit as a pill.
// The chips above the job cards: shortcuts for common picks from the
// header's filter panel (same URL params, so the two stay in step).
const QUICK_FILTERS: { label: string; param: string; value: string; color: string }[] = [
  { label: "Remote", param: "workplace", value: "remote", color: "#7b61ff" },
  { label: "Posted today", param: "posted", value: "1", color: "#ec008c" },
  { label: "$100K+", param: "salaryMin", value: "100000", color: "#4f8a10" },
];

function BandJobCard({
  job,
  active,
  query,
  fit,
  onSelect,
  color,
  colorEnd,
}: {
  job: JobDetail;
  color: string;
  colorEnd: string;
  active: boolean;
  query: string;
  fit: number | null;
  onSelect: () => void;
}) {
  const posting = scannedPosting(job);
  const company = posting?.company_name ?? job.url.domain;
  const salary = formatSalaryShort(job);
  const posted = postedLabel(job);
  return (
    <button
      type="button"
      className={`band-card${active ? " band-card--active" : ""}`}
      style={{ "--band-card-color": color, "--band-card-color-end": colorEnd } as CSSProperties}
      onClick={onSelect}
      aria-current={active ? "true" : undefined}
    >
      <span className="band-card__band">
        <span className="band-card__tile">
          <CompanyLogo name={company} logoUrl={posting?.company_logo_url} size={32} />
        </span>
        {fit !== null && (
          <span className={`band-card__fit band-card__fit--${fitTier(fit)}`}>
            <i aria-hidden="true" />
            {fit} fit
          </span>
        )}
      </span>
      <span className="band-card__body">
        <span className="band-card__company">{company}</span>
        <span className="band-card__title">
          {posting?.title ? highlightQuery(posting.title, query) : "Scanning posting…"}
        </span>
        {posting?.location && <span className="band-card__meta">{shortLocation(posting.location)}</span>}
        {posting && (
          <span className="band-card__tags">
            {workplaceLabel(posting.workplace_type) && (
              <span className="band-card__tag">{workplaceLabel(posting.workplace_type)}</span>
            )}
            {posting.employment_type !== "full_time" && employmentLabel(posting.employment_type) && (
              <span className="band-card__tag">{employmentLabel(posting.employment_type)}</span>
            )}
            {salary && <span className="band-card__pay">{salary}</span>}
            {posted && (
              <span className={`band-card__posted${posted.tone ? ` band-card__posted--${posted.tone}` : ""}`}>
                {posted.tone === "fresh" && <i aria-hidden="true" />}
                {posted.text}
              </span>
            )}
          </span>
        )}
      </span>
    </button>
  );
}

// How new the open job is, in the band's top-right corner, for a job found
// in the last 48 hours: the sunset and a pulsing dot under 24 hours, a white
// pill after that. Older jobs keep their "Found 3d ago" chip with the others
// (JobCaseFile).
function FoundBadge({ job }: { job: JobDetail }) {
  const age = jobAge(job);
  if (!age || age.tone === "older") return null;
  return (
    <span className={`board__detail-age board__detail-age--${age.tone}`}>
      <i aria-hidden="true" />
      {age.tone === "fresh" ? `New · Found ${age.ago}` : `Found ${age.ago}`}
    </span>
  );
}

// variant "cards" is the board at /jobs: banded job cards and fit pills for
// jobs already scored, over the classic variant's search, filters, paging and
// detail pane.
export function JobBoardPage({ variant = "classic" }: { variant?: "classic" | "cards" }) {
  const cards = variant === "cards";
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // The URL is the source of truth for all board state (search, location,
  // remote toggle, page, selection) so refreshing the page or sharing the
  // link reproduces exactly what's on screen. The search/location/remote
  // input controls themselves live in <Header> (always visible there,
  // even off this page) — this just reads whatever they've put in the URL.
  const selectedId = searchParams.get("jobId");
  const query = searchParams.get("q") ?? "";
  const location = searchParams.get("location") ?? "";
  const metro = searchParams.get("metro") ?? "";
  // How far around a searched city to look, once someone has widened it; unset means the server's default.
  const radius = Number(searchParams.get("radius")) || undefined;
  const company = searchParams.get("company") ?? "";
  const postedWithinDays = Number(searchParams.get("posted")) || undefined;
  const workplaceType = (searchParams.get("workplace") as WorkplaceTypeFilter | null) ?? undefined;
  const sector = boardSector(searchParams);
  const salaryMin = Number(searchParams.get("salaryMin")) || undefined;
  const salaryMax = Number(searchParams.get("salaryMax")) || undefined;
  const page = Number(searchParams.get("page")) || 1;

  const updateParams = useCallback(
    (update: (next: URLSearchParams) => void) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          update(next);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  function setPage(updater: (current: number) => number) {
    updateParams((next) => {
      const newPage = updater(page);
      if (newPage <= 1) next.delete("page");
      else next.set("page", String(newPage));
    });
  }

  // The "near you" default (geolocation -> GET /jobs/places/nearest) is set in
  // <Header>, not here — it also has to land in the location box's own visible
  // text, which is Header's local state, not just this page's URL params.

  const { data, isLoading } = useQuery({
    queryKey: [
      "jobs",
      query,
      location,
      metro,
      radius,
      company,
      postedWithinDays,
      workplaceType,
      sector,
      salaryMin,
      salaryMax,
      page,
    ],
    queryFn: () =>
      jobsApi.list({
        q: query || undefined,
        location: location || undefined,
        metro: metro || undefined,
        radius,
        company: company || undefined,
        postedWithinDays,
        workplaceType,
        sector,
        salaryMin,
        salaryMax,
        page,
      }),
  });

  // Best fit per job, for the card pills — the same cached list /applications uses.
  const applicationsQuery = useQuery({
    queryKey: ["applications"],
    queryFn: applicationsApi.list,
    enabled: cards && !!user,
  });
  const fitByUrlId = new Map<string, number>();
  for (const a of applicationsQuery.data ?? []) {
    if (a.best_score !== null) fitByUrlId.set(a.job_posting.url_id, a.best_score);
  }

  const jobs = data?.items;
  const searchArea = data?.search_area;
  const widerRadius = searchArea ? searchArea.radius_miles + RADIUS_STEP : 0;

  function widenSearch() {
    updateParams((next) => {
      next.set("radius", String(widerRadius));
      next.delete("page");
    });
  }
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  // Fetched directly by id (not just looked up in the current page's
  // results) so a selected job stays visible on refresh or when the URL is
  // shared — the target job may live on a different page/filter than
  // whatever this session's board happens to be showing.
  const { data: selectedJob, isLoading: selectedJobLoading } = useQuery({
    queryKey: ["job", selectedId],
    queryFn: () => jobsApi.get(selectedId!),
    enabled: !!selectedId,
  });
  const selected = selectedId ? selectedJob : jobs?.[0];
  // The open posting's band matches its card's place in the list, diagonal
  // and all; a job not on this page (a shared link) gets its company's color.
  const selectedIndex = jobs?.findIndex((job) => job.url.id === selected?.url.id) ?? -1;
  const selectedColor =
    selectedIndex >= 0
      ? listColor(selectedIndex)
      : selected
        ? bandColor(scannedPosting(selected)?.company_name ?? selected.url.domain)
        : undefined;

  const selectedColorEnd = selectedIndex >= 0 ? listColorEnd(selectedIndex) : selectedColor;

  // A link straight to a job that doesn't say which sector (a shared link, an
  // old bookmark) opens the board on that job's own sector rather than the
  // Tech default, so the list beside it is jobs like it. Only for the page
  // as it was opened: once someone picks a sector themselves, that stays.
  const pickSectorFromJob = useRef(!!selectedId && !searchParams.has("sector"));
  useEffect(() => {
    if (!pickSectorFromJob.current || !selectedJob) return;
    pickSectorFromJob.current = false;
    const jobSector = selectedJob.posting?.sector;
    if (jobSector && jobSector !== DEFAULT_SECTOR) updateParams((next) => next.set("sector", jobSector));
  }, [selectedJob, updateParams]);

  const queryClient = useQueryClient();
  const rescanMutation = useMutation({
    mutationFn: (urlId: string) => jobsApi.rescan(urlId),
    onSuccess: (_data, urlId) => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["job", urlId] });
    },
  });
  const isRescanning = rescanMutation.isPending && rescanMutation.variables === selected?.url.id;
  const rescanFailed = rescanMutation.isError && rescanMutation.variables === selected?.url.id;

  const deleteListingMutation = useMutation({
    mutationFn: (urlId: string) => adminApi.deleteListing(urlId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      updateParams((next) => next.delete("jobId"));
    },
  });

  const { confirm, dialog } = useConfirm();

  // Phones: the list and the posting sit side by side in a row that scrolls
  // sideways a whole screen at a time (see JobBoardPage.css), each scrolling
  // up and down on its own, so each keeps its place. Tapping a card scrolls
  // the row over to the posting; swiping it back, or the All jobs pill,
  // scrolls back to the list, and once it settles there the posting closes.
  const pagerRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const isPhone = () => window.matchMedia(SPLIT_COLLAPSED_QUERY).matches;
  const smooth = (): ScrollBehavior =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  // Only a tap slides over — a page loaded with ?jobId= starts on the posting.
  const openedByTap = useRef(false);
  useLayoutEffect(() => {
    const pager = pagerRef.current;
    if (!selectedId || !pager || !isPhone()) return;
    detailRef.current?.scrollTo(0, 0);
    pager.scrollTo({ left: pager.clientWidth, behavior: openedByTap.current ? smooth() : "auto" });
    openedByTap.current = false;
  }, [selectedId]);

  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  useEffect(() => {
    const pager = pagerRef.current;
    if (!pager) return;
    let timer = 0;
    const settle = () => {
      if (pager.scrollLeft < 2 && selectedIdRef.current) {
        updateParams((next) => next.delete("jobId"));
      }
    };
    const onScroll = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(settle, 120);
    };
    pager.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.clearTimeout(timer);
      pager.removeEventListener("scroll", onScroll);
    };
  }, [updateParams]);

  function selectJob(id: string) {
    openedByTap.current = true;
    updateParams((next) => next.set("jobId", id));
  }

  function closeDetail() {
    const pager = pagerRef.current;
    if (pager && isPhone() && pager.scrollLeft > 0) pager.scrollTo({ left: 0, behavior: smooth() });
    else updateParams((next) => next.delete("jobId"));
  }

  async function deleteListing(urlId: string) {
    if (await confirm("Permanently delete this listing? This can't be undone.")) {
      deleteListingMutation.mutate(urlId);
    }
  }

  return (
    <div className={`board board--split${selectedId ? " board--detail-open" : ""}${cards ? " board--cards" : ""}`}>
      {dialog}
      <div className="board__layout" ref={pagerRef}>
        <div className="board__list">
          {/* On phones each pane is a page of its own, scrolling by itself, so
              each carries the page's footer (the list the banner too); the
              page's own are hidden there. */}
          <div className="board__phone-only">
            <GettingStartedBanner />
          </div>
          {cards ? (
            <div className="board__cards-head">
              <div className="board__cards-heading">
                <h1 className="board__cards-title">
                  {sector ? `${SECTOR_SHORT_LABELS[sector] ?? sectorLabel(sector) ?? "Matching"} jobs` : "All jobs"}
                  {location && <span> in {location === "United States" ? "the US" : location}</span>}
                </h1>
                <p className="board__cards-count">
                  {data
                    ? // GET /jobs counts at most 1,000 matches ahead (COUNT_AHEAD), so
                      // a total that reaches it means "at least".
                      `${data.total.toLocaleString()}${data.total >= 1000 ? "+" : ""} ${data.total === 1 ? "job" : "jobs"}`
                    : "Loading jobs…"}
                </p>
              </div>
              {/* One-tap versions of the header's filters; tapping an active one
                  clears it. */}
              <div className="board__quick" role="group" aria-label="Quick filters">
                {QUICK_FILTERS.map((filter) => {
                  const on = searchParams.get(filter.param) === filter.value;
                  return (
                    <button
                      key={filter.label}
                      type="button"
                      className={`board__quick-chip${on ? " board__quick-chip--on" : ""}`}
                      style={{ "--chip": filter.color } as CSSProperties}
                      aria-pressed={on}
                      onClick={() =>
                        updateParams((next) => {
                          if (on) next.delete(filter.param);
                          else next.set(filter.param, filter.value);
                          next.delete("page");
                        })
                      }
                    >
                      {filter.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <Link to="/applications" className="board__applications-link">
              My applications →
            </Link>
          )}
          <div className="board__list-scroll">
              {searchArea && (
                <p className="board__search-area">
                  Nearest first, within {searchArea.radius_miles} miles of {searchArea.label}
                  {widerRadius <= MAX_RADIUS && (
                    <>
                      {" · "}
                      <button type="button" className="board__widen" onClick={widenSearch}>
                        Search {widerRadius} miles
                      </button>
                    </>
                  )}
                </p>
              )}
              {isLoading && <p className="board__empty">Loading postings…</p>}
              {!isLoading && jobs?.length === 0 && <p className="board__empty">No postings match your filters.</p>}
              {jobs?.map((job, index) =>
                cards ? (
                  <BandJobCard
                    key={job.url.id}
                    job={job}
                    color={listColor(index)}
                    colorEnd={listColorEnd(index)}
                    // Only a job you picked is ringed, not the first one shown by default.
                    active={job.url.id === selectedId}
                    query={query}
                    fit={fitByUrlId.get(job.url.id) ?? null}
                    onSelect={() => selectJob(job.url.id)}
                  />
                ) : (
                  <JobCard
                    key={job.url.id}
                    job={job}
                    active={job.url.id === (selected?.url.id ?? "")}
                    query={query}
                    onSelect={() => selectJob(job.url.id)}
                  />
                ),
              )}
            </div>
            {data && data.total > 0 && (
              <div className="board__pagination">
                <button
                  type="button"
                  className="board__page-button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  ‹ Prev
                </button>
                <span className="board__page-status">
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  className="board__page-button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next ›
                </button>
              </div>
            )}
            <div className="board__phone-only">
              <Footer />
            </div>
          </div>

          <div className="board__detail" ref={detailRef}>
            {cards && (
              // Above the posting's card: the way back to the list (phones
              // only) on the left, My applications on the right.
              <div className="board__detail-top">
                <button type="button" className="board__back board__back--top" onClick={closeDetail}>
                  <ListIcon />
                  All jobs
                </button>
                <Link to="/applications" className="board__detail-applications">
                  <BriefcaseIcon />
                  My applications
                </Link>
              </div>
            )}
            <div className="board__detail-inner">
            {cards && selected ? (
              // The open posting's color header: its company's band color, with
              // the logo on a white tile hanging over the band's edge.
              <div
                className="board__detail-band"
                style={
                  {
                    "--band-card-color": selectedColor,
                    "--band-card-color-end": selectedColorEnd,
                  } as CSSProperties
                }
              >
                <span className="board__detail-tile">
                  <CompanyLogo
                    name={scannedPosting(selected)?.company_name ?? selected.url.domain}
                    logoUrl={scannedPosting(selected)?.company_logo_url}
                    size={40}
                  />
                </span>
                <FoundBadge job={selected} />
                {/* Apply to the company's site, just under the band on the right
                    (desktop only; phones get it under the tags, in JobCaseFile). */}
                <CompanySiteLink job={selected} className="board__detail-apply">
                  Apply ↗
                </CompanySiteLink>
              </div>
            ) : (
              !cards && (
                <button type="button" className="rescan-button board__back" onClick={closeDetail}>
                  ‹ All jobs
                </button>
              )
            )}
            {!selected && selectedJobLoading && <p className="board__empty">Loading posting…</p>}
            {!selected && !selectedJobLoading && (
              <p className="board__empty">Select a posting to open its case file.</p>
            )}
            {selected && (
              <JobCaseFile
                job={selected}
                user={user}
                isRescanning={isRescanning}
                rescanFailed={rescanFailed}
                onRescan={() => rescanMutation.mutate(selected.url.id)}
                onDelete={() => deleteListing(selected.url.id)}
                isDeleting={deleteListingMutation.isPending}
                titleHighlightQuery={query}
                onSelectSimilar={selectJob}
                boardCards={cards}
              />
            )}
            </div>
            <div className="board__phone-only">
              <Footer />
            </div>
        </div>
      </div>
    </div>
  );
}
