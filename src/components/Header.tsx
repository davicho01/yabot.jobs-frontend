import { useState, useRef, useEffect, useCallback } from "react";
import { Link, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthContext";
import { jobsApi } from "../api/jobs";
import { ApiError } from "../api/client";
import type { Metro } from "../api/types";
import "./Header.css";

const PLACE_SUGGESTION_LIMIT = 10;

// What an area named by an old shared ?metro= link reads as in the search box.
function metroLabel(metro: Metro): string {
  return metro.kind === "state" ? `${metro.name} (statewide)` : `${metro.name} area`;
}

const WORKPLACE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Any workplace" },
  { value: "remote", label: "Remote only" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "On-site" },
];

const POSTED_WITHIN_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Any time posted" },
  { value: "1", label: "Last 24 hours" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
];

function FilterDropdown({
  options,
  value,
  onChange,
  defaultLabel,
  ariaLabel,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  defaultLabel: string;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const activeLabel = options.find((option) => option.value === value)?.label ?? defaultLabel;

  return (
    <div className="site-header__filter-dropdown" ref={containerRef}>
      <button
        type="button"
        className="site-header__filter-dropdown-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        {activeLabel}
        <svg viewBox="0 0 12 8" width="10" height="7" fill="none" aria-hidden="true">
          <path d="M1 1.5 6 6.5 11 1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="site-header__dropdown" role="menu">
          {options.map((option) => (
            <button
              key={option.value || "any"}
              type="button"
              role="menuitem"
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
              {option.value === value ? " ✓" : ""}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Header() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const [addJobOpen, setAddJobOpen] = useState(false);
  const [jobUrl, setJobUrl] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const lastScrollY = useRef(0);

  useEffect(() => {
    lastScrollY.current = window.scrollY;
    function onScroll() {
      const y = window.scrollY;
      // Any upward movement reveals the header immediately; only sustained
      // downward movement past the header's own height hides it, so a tiny
      // wobble near the top doesn't flicker it away.
      if (y < lastScrollY.current) {
        setHidden(false);
      } else if (y > lastScrollY.current && y > 80) {
        setHidden(true);
      }
      lastScrollY.current = y;
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // The header is position:fixed (see Header.css) so it no longer reserves
  // its own space in the document flow; PageShell reads this custom
  // property to pad the content below by exactly the header's current
  // height, which changes when the filters/add-job panels open.
  useEffect(() => {
    const node = headerRef.current;
    if (!node) return;
    const setHeightVar = () => {
      document.documentElement.style.setProperty("--header-height", `${node.offsetHeight}px`);
    };
    setHeightVar();
    const observer = new ResizeObserver(setHeightVar);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // These search/filter controls live in the header so they're always
  // visible, but the board state (q/location/company/posted/remote/page/jobId)
  // only makes sense on "/" — everywhere else, using them starts a fresh
  // search there instead of trying to merge into whatever unrelated params
  // the current route has (or doesn't have).
  const onBoard = routerLocation.pathname === "/";
  const query = onBoard ? (searchParams.get("q") ?? "") : "";
  const locationFilter = onBoard ? (searchParams.get("location") ?? "") : "";
  const metroSlug = onBoard ? (searchParams.get("metro") ?? "") : "";
  const companyFilter = onBoard ? (searchParams.get("company") ?? "") : "";
  const postedWithin = onBoard ? (searchParams.get("posted") ?? "") : "";
  const workplaceType = onBoard ? (searchParams.get("workplace") ?? "") : "";
  const activeFilterCount = [!!workplaceType, !!companyFilter, !!postedWithin].filter(Boolean).length;

  const [searchInput, setSearchInput] = useState(query);
  const [locationInput, setLocationInput] = useState(locationFilter);
  const [companyInput, setCompanyInput] = useState(companyFilter);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locationDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const companyDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (searchDebounce.current) clearTimeout(searchDebounce.current);
      if (locationDebounce.current) clearTimeout(locationDebounce.current);
      if (companyDebounce.current) clearTimeout(companyDebounce.current);
    };
  }, []);

  const updateBoardParams = useCallback(
    (update: (next: URLSearchParams) => void) => {
      if (onBoard) {
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            update(next);
            return next;
          },
          { replace: true },
        );
      } else {
        const next = new URLSearchParams();
        update(next);
        navigate(`/?${next.toString()}`);
      }
    },
    [onBoard, setSearchParams, navigate],
  );

  function handleSearchInputChange(value: string) {
    setSearchInput(value);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    // Debounced directly from the keystroke (not a useEffect keyed on
    // searchInput) so navigating between pages — which changes `onBoard`
    // and thus updateBoardParams's identity — never itself triggers a
    // pending update; only actually typing does.
    searchDebounce.current = setTimeout(() => {
      updateBoardParams((next) => {
        if ((next.get("q") ?? "") === value) return;
        if (value) next.set("q", value);
        else next.delete("q");
        next.delete("page");
      });
    }, 300);
  }

  function handleLocationInputChange(value: string) {
    if (locationDebounce.current) clearTimeout(locationDebounce.current);

    setLocationInput(value);
    // Editing away from a selected area's label turns the box back into a text
    // search straight away (not after the debounce) — otherwise the box would
    // keep showing the label and swallow the keystroke.
    if (metroSlug) {
      updateBoardParams((next) => {
        next.delete("metro");
        next.delete("page");
      });
    }
    locationDebounce.current = setTimeout(() => {
      updateBoardParams((next) => {
        if ((next.get("location") ?? "") === value) return;
        if (value) next.set("location", value);
        else next.delete("location");
        next.delete("page");
      });
    }, 300);
  }

  function handleCompanyInputChange(value: string) {
    setCompanyInput(value);
    if (companyDebounce.current) clearTimeout(companyDebounce.current);
    companyDebounce.current = setTimeout(() => {
      updateBoardParams((next) => {
        if ((next.get("company") ?? "") === value) return;
        if (value) next.set("company", value);
        else next.delete("company");
        next.delete("page");
      });
    }, 300);
  }

  function setPostedWithin(value: string) {
    updateBoardParams((next) => {
      if (value) next.set("posted", value);
      else next.delete("posted");
      next.delete("page");
    });
  }

  function setWorkplaceType(value: string) {
    updateBoardParams((next) => {
      if (value) next.set("workplace", value);
      else next.delete("workplace");
      next.delete("page");
    });
  }

  function resetFilters() {
    if (companyDebounce.current) clearTimeout(companyDebounce.current);
    setCompanyInput("");
    updateBoardParams((next) => {
      next.delete("company");
      next.delete("workplace");
      next.delete("posted");
      next.delete("page");
    });
  }

  // Suggestions follow what's been typed. Keyed on the URL's location filter
  // (not the raw input) so it only refetches once the 300ms debounce above has
  // settled — and keeps showing the previous options meanwhile so the list
  // doesn't flicker empty between keystrokes.
  const { data: placeOptions } = useQuery({
    queryKey: ["job-places", locationFilter],
    queryFn: () => jobsApi.places(locationFilter, PLACE_SUGGESTION_LIMIT),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  });
  // The area named in the URL (?metro=), so the box can show its name.
  const { data: selectedMetro } = useQuery({
    queryKey: ["job-metro", metroSlug],
    queryFn: () => jobsApi.metro(metroSlug),
    enabled: !!metroSlug,
    staleTime: 5 * 60_000,
  });

  const submitJobMutation = useMutation({
    mutationFn: (url: string) => jobsApi.submit(url),
    onSuccess: (job) => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      setJobUrl("");
      setAddJobOpen(false);
      navigate(`/jobs/${job.url.id}/apply`);
    },
  });

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    if (!addJobOpen) return;
    function onClickOutside(event: MouseEvent) {
      if (headerRef.current && !headerRef.current.contains(event.target as Node)) {
        setAddJobOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [addJobOpen]);

  useEffect(() => {
    if (!filtersOpen) return;
    function onClickOutside(event: MouseEvent) {
      if (headerRef.current && !headerRef.current.contains(event.target as Node)) {
        setFiltersOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [filtersOpen]);

  function toggleAddJob() {
    setFiltersOpen(false);
    setAddJobOpen((o) => !o);
  }

  function toggleFilters() {
    setAddJobOpen(false);
    setFiltersOpen((o) => !o);
  }

  const initial = (user?.display_name?.trim()?.[0] ?? user?.email?.[0])?.toUpperCase() ?? "?";

  return (
    <header className={`site-header${hidden ? " site-header--hidden" : ""}`} ref={headerRef}>
      <div className="site-header__row">
        <Link to="/" className="site-header__brand">
          <span className="site-header__mark" aria-hidden="true">
            <svg viewBox="0 0 48 48" fill="none" width="20" height="20">
              <path
                d="M9 24h6l4-10 6 20 4-10h10"
                stroke="var(--accent)"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="site-header__title">Yabot Jobs</span>
        </Link>

        <div className="site-header__center">
          <input
            className="site-header__search"
            type="search"
            placeholder="Search postings by title…"
            value={searchInput}
            onChange={(e) => handleSearchInputChange(e.target.value)}
          />
          <input
            className="site-header__search"
            type="search"
            list="job-location-options"
            placeholder="Search by city or state…"
            value={metroSlug && selectedMetro ? metroLabel(selectedMetro) : locationInput}
            onChange={(e) => handleLocationInputChange(e.target.value)}
          />
          <datalist id="job-location-options">
            {placeOptions?.map((place) => (
              <option key={place} value={place} />
            ))}
          </datalist>
          <button
            type="button"
            className={`site-header__filter-toggle${activeFilterCount > 0 ? " site-header__filter-toggle--active" : ""}`}
            onClick={toggleFilters}
            aria-haspopup="true"
            aria-expanded={filtersOpen}
            aria-label="More filters"
          >
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true">
              <path
                d="M3 4.5h14l-5.5 6.25V16l-3 1.5v-6.75L3 4.5z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {activeFilterCount > 0 && <span className="site-header__filter-badge">{activeFilterCount}</span>}
          </button>
          {user && (
            <button
              type="button"
              className="site-header__add-job-toggle"
              onClick={toggleAddJob}
              aria-haspopup="true"
              aria-expanded={addJobOpen}
            >
              + Add Job
            </button>
          )}
        </div>

        {user ? (
          <div className="site-header__menu" ref={menuRef}>
            <button
              type="button"
              className="site-header__avatar"
              onClick={() => setMenuOpen((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              {initial}
            </button>
            {menuOpen && (
              <div className="site-header__dropdown" role="menu">
                <div className="site-header__dropdown-profile">
                  <div className="site-header__dropdown-name">
                    <span>{user.display_name || "Missing name"}</span>
                  </div>
                  <div className="site-header__dropdown-email">{user.email}</div>
                </div>
                <Link to="/profile" role="menuitem" onClick={() => setMenuOpen(false)}>
                  Profile
                </Link>
                <Link to="/applications" role="menuitem" onClick={() => setMenuOpen(false)}>
                  My applications
                </Link>
                <Link to="/resume" role="menuitem" onClick={() => setMenuOpen(false)}>
                  My resume
                </Link>
                <Link to="/api-keys" role="menuitem" onClick={() => setMenuOpen(false)}>
                  AI API Keys
                </Link>
                {user.role === "admin" && (
                  <Link to="/admin" role="menuitem" onClick={() => setMenuOpen(false)}>
                    Admin dashboard
                  </Link>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={async () => {
                    setMenuOpen(false);
                    await logout();
                    navigate("/");
                  }}
                >
                  Log out
                </button>
              </div>
            )}
          </div>
        ) : (
          <Link to="/login" className="site-header__login">
            Log in
          </Link>
        )}
      </div>

      {user && addJobOpen && (
        <form
          className="site-header__add-job-expand"
          onSubmit={(e) => {
            e.preventDefault();
            if (jobUrl.trim()) submitJobMutation.mutate(jobUrl.trim());
          }}
        >
          <label className="site-header__add-job-label" htmlFor="add-job-url">
            Job Posting Url
          </label>
          <input
            id="add-job-url"
            type="url"
            required
            autoFocus
            placeholder="https://company.com/careers/job/123"
            value={jobUrl}
            onChange={(e) => setJobUrl(e.target.value)}
          />
          <button type="submit" className="site-header__add-job-submit" disabled={submitJobMutation.isPending}>
            {submitJobMutation.isPending ? "Adding…" : "Add & Scan"}
          </button>
          {submitJobMutation.isError && (
            <p className="site-header__add-job-error">
              {submitJobMutation.error instanceof ApiError ? submitJobMutation.error.message : "Couldn't add that URL."}
            </p>
          )}
        </form>
      )}

      {filtersOpen && (
        <div className="site-header__filters-expand">
          <FilterDropdown
            options={WORKPLACE_OPTIONS}
            value={workplaceType}
            onChange={setWorkplaceType}
            defaultLabel="Any workplace"
            ariaLabel="Workplace type"
          />
          <input
            className="site-header__filter-input"
            type="text"
            placeholder="Company"
            value={companyInput}
            onChange={(e) => handleCompanyInputChange(e.target.value)}
          />
          <FilterDropdown
            options={POSTED_WITHIN_OPTIONS}
            value={postedWithin}
            onChange={setPostedWithin}
            defaultLabel="Any time posted"
            ariaLabel="Posted date"
          />
          {activeFilterCount > 0 && (
            <button type="button" className="site-header__filter-reset" onClick={resetFilters}>
              Reset filters
            </button>
          )}
        </div>
      )}
    </header>
  );
}
