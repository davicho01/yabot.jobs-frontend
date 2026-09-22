import { useState, useRef, useEffect, useCallback, type FormEvent, type KeyboardEvent } from "react";
import { Link, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthContext";
import { jobsApi } from "../api/jobs";
import { describeSavedSearch, paramsToSavedSearchPayload, savedSearchesApi } from "../api/savedSearches";
import { ApiError } from "../api/client";
import type { Metro } from "../api/types";
import { BOARD_PATH } from "../routes";
import "./Header.css";

const PLACE_SUGGESTION_LIMIT = 10;

// On a phone the header is tall and covers a lot of the screen, so once it has
// slid away it only comes back after this many pixels of continuous scrolling
// up (or at the very top), not at the first flick of the thumb. Must match the
// phone breakpoint in Header.css.
const PHONE_QUERY = "(max-width: 760px)";
const PHONE_REVEAL_SCROLL_UP_PX = 700;
// Scrolled down past this, the header can hide; above it, it's always shown.
const HIDE_AFTER_SCROLL_PX = 80;

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

// Preset bands rather than a free-typed number — matches how the other
// filters here work, and sidesteps having to validate/parse arbitrary input.
const SALARY_MIN_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Any minimum" },
  { value: "40000", label: "$40,000+" },
  { value: "60000", label: "$60,000+" },
  { value: "80000", label: "$80,000+" },
  { value: "100000", label: "$100,000+" },
  { value: "120000", label: "$120,000+" },
  { value: "150000", label: "$150,000+" },
  { value: "200000", label: "$200,000+" },
];

const SALARY_MAX_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Any maximum" },
  { value: "60000", label: "Up to $60,000" },
  { value: "80000", label: "Up to $80,000" },
  { value: "100000", label: "Up to $100,000" },
  { value: "120000", label: "Up to $120,000" },
  { value: "150000", label: "Up to $150,000" },
  { value: "200000", label: "Up to $200,000" },
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
  const [saveSearchOpen, setSaveSearchOpen] = useState(false);
  const [saveSearchName, setSaveSearchName] = useState("");
  const [hidden, setHidden] = useState(false);
  const lastScrollY = useRef(0);

  useEffect(() => {
    lastScrollY.current = window.scrollY;
    // How far the page has been scrolled up in one go; a change of direction starts it over.
    let scrolledUp = 0;
    function onScroll() {
      const y = window.scrollY;
      const delta = y - lastScrollY.current;
      lastScrollY.current = y;

      if (y <= HIDE_AFTER_SCROLL_PX) {
        setHidden(false);
        scrolledUp = 0;
      } else if (delta > 0) {
        scrolledUp = 0;
        // Never slide the header away while a search field is being used: the
        // phone scrolls the page to bring a focused field into view, which
        // would otherwise take the field with it.
        if (!headerRef.current?.contains(document.activeElement)) setHidden(true);
      } else if (delta < 0) {
        scrolledUp -= delta;
        // Desktop: any upward movement brings it back. Phone: only a sustained one.
        if (!window.matchMedia(PHONE_QUERY).matches || scrolledUp >= PHONE_REVEAL_SCROLL_UP_PX) setHidden(false);
      }
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
  // only makes sense on the board — everywhere else, using them starts a fresh
  // search there instead of trying to merge into whatever unrelated params
  // the current route has (or doesn't have).
  const onBoard = routerLocation.pathname === BOARD_PATH;
  const query = onBoard ? (searchParams.get("q") ?? "") : "";
  const locationFilter = onBoard ? (searchParams.get("location") ?? "") : "";
  const metroSlug = onBoard ? (searchParams.get("metro") ?? "") : "";
  const companyFilter = onBoard ? (searchParams.get("company") ?? "") : "";
  const postedWithin = onBoard ? (searchParams.get("posted") ?? "") : "";
  const workplaceType = onBoard ? (searchParams.get("workplace") ?? "") : "";
  const salaryMinFilter = onBoard ? (searchParams.get("salaryMin") ?? "") : "";
  const salaryMaxFilter = onBoard ? (searchParams.get("salaryMax") ?? "") : "";
  const activeFilterCount = [
    !!workplaceType,
    !!companyFilter,
    !!postedWithin,
    !!salaryMinFilter,
    !!salaryMaxFilter,
  ].filter(Boolean).length;

  const [searchInput, setSearchInput] = useState(query);
  const [locationInput, setLocationInput] = useState(locationFilter);
  const [placesOpen, setPlacesOpen] = useState(false);
  const [activePlace, setActivePlace] = useState(-1);
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
        navigate(`${BOARD_PATH}?${next.toString()}`);
      }
    },
    [onBoard, setSearchParams, navigate],
  );

  // Defaults the location box to "near you" on a fresh visit to the board —
  // set via both the URL and setLocationInput, exactly as selectPlace does
  // for a picked suggestion, so the box actually shows it rather than just
  // quietly filtering behind an empty-looking field. Never overrides an
  // explicit search or a shared link's own ?location=/?metro=. Silently does
  // nothing without geolocation support, on denial/error, or when nothing's
  // close enough to guess (see GET /jobs/places/nearest).
  useEffect(() => {
    if (!onBoard || locationFilter || metroSlug) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (cancelled) return;
        jobsApi
          .nearestPlace(position.coords.latitude, position.coords.longitude)
          .then((label) => {
            if (cancelled || !label) return;
            setLocationInput(label);
            updateBoardParams((next) => {
              // Someone may have typed their own search while this was in flight.
              if (next.get("location") || next.get("metro")) return;
              next.set("location", label);
              next.delete("radius");
              next.delete("page");
            });
          })
          .catch(() => {}); // best-effort — no default is fine
      },
      () => {}, // denied or unavailable — no default, same as not knowing
      { maximumAge: 30 * 60_000, timeout: 8000 },
    );
    return () => {
      cancelled = true;
    };
    // Re-attempts whenever arriving at the board fresh (onBoard flips to
    // true), not on every keystroke that changes locationFilter/metroSlug
    // afterward (including from this effect's own update) — deliberately
    // not in deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onBoard]);

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
    setPlacesOpen(true);
    setActivePlace(-1);
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
        next.delete("radius"); // a widened search belongs to the place it was widened for
        next.delete("page");
      });
    }, 300);
  }

  // A suggestion is applied at once (no debounce — it's a finished answer, not
  // a keystroke) and closes the list.
  function selectPlace(place: string) {
    if (locationDebounce.current) clearTimeout(locationDebounce.current);
    setLocationInput(place);
    setPlacesOpen(false);
    setActivePlace(-1);
    updateBoardParams((next) => {
      next.delete("metro");
      next.set("location", place);
      next.delete("radius");
      next.delete("page");
    });
  }

  function handleLocationKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const count = placeOptions?.length ?? 0;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (count === 0) return;
      event.preventDefault();
      setPlacesOpen(true);
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActivePlace((index) => (index === -1 ? (step === 1 ? 0 : count - 1) : (index + step + count) % count));
    } else if (event.key === "Enter") {
      if (placesOpen && activePlace >= 0 && placeOptions?.[activePlace]) {
        event.preventDefault();
        selectPlace(placeOptions[activePlace]);
      } else {
        setPlacesOpen(false);
      }
    } else if (event.key === "Escape" && showPlaces) {
      // First Escape closes the list; without this the search field's own
      // Escape (clear the text) would also fire, and its change event would
      // reopen the list. A second Escape, with the list shut, clears as usual.
      event.preventDefault();
      setPlacesOpen(false);
      setActivePlace(-1);
    }
  }

  // The Search button (and Enter in either field) applies what's typed right now,
  // instead of waiting out the typing debounce, and from any other page carries the
  // search over to the board.
  function handleSearchSubmit(event: FormEvent) {
    event.preventDefault();
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    if (locationDebounce.current) clearTimeout(locationDebounce.current);
    setPlacesOpen(false);
    setActivePlace(-1);
    updateBoardParams((next) => {
      if (searchInput) next.set("q", searchInput);
      else next.delete("q");
      // The box shows an area's label while ?metro= is set, so leave the place alone
      // until it's edited (which clears the area).
      if (!metroSlug) {
        // A widened search belongs to the place it was widened for.
        if ((next.get("location") ?? "") !== locationInput) next.delete("radius");
        if (locationInput) next.set("location", locationInput);
        else next.delete("location");
      }
      next.delete("page");
    });
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

  function setSalaryMin(value: string) {
    updateBoardParams((next) => {
      if (value) next.set("salaryMin", value);
      else next.delete("salaryMin");
      next.delete("page");
    });
  }

  function setSalaryMax(value: string) {
    updateBoardParams((next) => {
      if (value) next.set("salaryMax", value);
      else next.delete("salaryMax");
      next.delete("page");
    });
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
      next.delete("salaryMin");
      next.delete("salaryMax");
      next.delete("page");
    });
  }

  // Suggestions follow what's been typed, keystroke by keystroke (they come from
  // an in-memory list on the server, so it's cheap), and keep showing the
  // previous options meanwhile so the list doesn't flicker empty in between.
  const { data: placeOptions } = useQuery({
    queryKey: ["job-places", locationInput],
    queryFn: () => jobsApi.places(locationInput, PLACE_SUGGESTION_LIMIT),
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

  const showPlaces = placesOpen && !!placeOptions?.length && !(metroSlug && selectedMetro);

  const submitJobMutation = useMutation({
    mutationFn: (url: string) => jobsApi.submit(url),
    onSuccess: (job) => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      setJobUrl("");
      setAddJobOpen(false);
      navigate(`/jobs/${job.url.id}/apply`);
    },
  });

  const saveSearchMutation = useMutation({
    mutationFn: () => savedSearchesApi.create(paramsToSavedSearchPayload(searchParams, saveSearchName)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["savedSearches"] });
      setSaveSearchOpen(false);
      setSaveSearchName("");
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

  useEffect(() => {
    if (!saveSearchOpen) return;
    function onClickOutside(event: MouseEvent) {
      if (headerRef.current && !headerRef.current.contains(event.target as Node)) {
        setSaveSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [saveSearchOpen]);

  function toggleAddJob() {
    setFiltersOpen(false);
    setSaveSearchOpen(false);
    setAddJobOpen((o) => !o);
  }

  function toggleFilters() {
    setAddJobOpen(false);
    setSaveSearchOpen(false);
    setFiltersOpen((o) => !o);
  }

  function toggleSaveSearch() {
    setAddJobOpen(false);
    setFiltersOpen(false);
    setSaveSearchOpen((open) => {
      // Suggest a name from the current filters each time it's freshly
      // opened, not while it's already open (would stomp on typing).
      if (!open) setSaveSearchName(describeSavedSearch(paramsToSavedSearchPayload(searchParams, "")));
      return !open;
    });
  }

  const initial = (user?.display_name?.trim()?.[0] ?? user?.email?.[0])?.toUpperCase() ?? "?";

  return (
    <header className={`site-header${hidden ? " site-header--hidden" : ""}`} ref={headerRef}>
      <div className="site-header__row">
        <Link to={BOARD_PATH} className="site-header__brand">
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
          <form className="site-header__searchbar" role="search" onSubmit={handleSearchSubmit}>
            <input
              className="site-header__search"
              type="search"
              aria-label="Job title or keyword"
              placeholder="Search postings by title…"
              value={searchInput}
              onChange={(e) => handleSearchInputChange(e.target.value)}
            />
            <span className="site-header__searchbar-rule" aria-hidden="true" />
            <div className="site-header__combobox">
              <input
                className="site-header__search"
                type="search"
                role="combobox"
                aria-label="City or state"
                aria-expanded={showPlaces}
                aria-controls="job-location-options"
                aria-autocomplete="list"
                aria-activedescendant={showPlaces && activePlace >= 0 ? `job-location-option-${activePlace}` : undefined}
                autoComplete="off"
                placeholder="Search by city or state…"
                value={metroSlug && selectedMetro ? metroLabel(selectedMetro) : locationInput}
                onChange={(e) => handleLocationInputChange(e.target.value)}
                onFocus={() => setPlacesOpen(true)}
                onBlur={() => setPlacesOpen(false)}
                onKeyDown={handleLocationKeyDown}
              />
              {showPlaces && (
                <ul className="site-header__combobox-list" id="job-location-options" role="listbox">
                  {placeOptions?.map((place, index) => {
                    // "Bountiful, Utah, United States": the place stands out, the
                    // state and country after it are context.
                    const [name, ...rest] = place.split(", ");
                    return (
                      <li
                        key={place}
                        id={`job-location-option-${index}`}
                        role="option"
                        aria-selected={index === activePlace}
                        className={`site-header__combobox-option${index === activePlace ? " site-header__combobox-option--active" : ""}`}
                        // mousedown, not click: it fires before the input's blur closes the list.
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectPlace(place);
                        }}
                        onMouseEnter={() => setActivePlace(index)}
                      >
                        <span>{name}</span>
                        {rest.length > 0 && <span className="site-header__combobox-context">, {rest.join(", ")}</span>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <button type="submit" className="site-header__search-submit">
              Search
            </button>
          </form>
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
          {user && onBoard && (
            <button
              type="button"
              className="site-header__filter-toggle"
              onClick={toggleSaveSearch}
              aria-haspopup="true"
              aria-expanded={saveSearchOpen}
              aria-label="Save this search"
              title="Save this search"
            >
              <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true">
                <path
                  d="M5 3.5h10a1 1 0 0 1 1 1V17l-6-3.5L4 17V4.5a1 1 0 0 1 1-1z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
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
                <Link to="/saved-searches" role="menuitem" onClick={() => setMenuOpen(false)}>
                  Saved searches
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
                    navigate(BOARD_PATH);
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

      {user && onBoard && saveSearchOpen && (
        <form
          className="site-header__add-job-expand"
          onSubmit={(e) => {
            e.preventDefault();
            saveSearchMutation.mutate();
          }}
        >
          <label className="site-header__add-job-label" htmlFor="save-search-name">
            Name
          </label>
          <input
            id="save-search-name"
            type="text"
            required
            autoFocus
            maxLength={120}
            placeholder="e.g. Remote frontend roles"
            value={saveSearchName}
            onChange={(e) => setSaveSearchName(e.target.value)}
          />
          <button type="submit" className="site-header__add-job-submit" disabled={saveSearchMutation.isPending}>
            {saveSearchMutation.isPending ? "Saving…" : "Save search"}
          </button>
          {saveSearchMutation.isError && (
            <p className="site-header__add-job-error">
              {saveSearchMutation.error instanceof ApiError
                ? saveSearchMutation.error.message
                : "Couldn't save that search."}
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
          <FilterDropdown
            options={POSTED_WITHIN_OPTIONS}
            value={postedWithin}
            onChange={setPostedWithin}
            defaultLabel="Any time posted"
            ariaLabel="Posted date"
          />
          <input
            className="site-header__filter-input"
            type="text"
            placeholder="Company"
            value={companyInput}
            onChange={(e) => handleCompanyInputChange(e.target.value)}
          />
          {/* Grouped so the pair wraps to a new line together on a phone,
              instead of "Min pay" and "Max pay" splitting across two lines
              like every other filter here is free to do independently. */}
          <div className="site-header__salary-group">
            <FilterDropdown
              options={SALARY_MIN_OPTIONS}
              value={salaryMinFilter}
              onChange={setSalaryMin}
              defaultLabel="Any minimum"
              ariaLabel="Minimum pay"
            />
            <FilterDropdown
              options={SALARY_MAX_OPTIONS}
              value={salaryMaxFilter}
              onChange={setSalaryMax}
              defaultLabel="Any maximum"
              ariaLabel="Maximum pay"
            />
          </div>
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
