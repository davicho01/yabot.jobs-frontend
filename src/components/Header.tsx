import { useState, useRef, useEffect, useCallback } from "react";
import { Link, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthContext";
import { jobsApi } from "../api/jobs";
import { ApiError } from "../api/client";
import "./Header.css";

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

  // These search/filter controls live in the header so they're always
  // visible, but the board state (q/location/remote/page/jobId) only makes
  // sense on "/" — everywhere else, using them starts a fresh search there
  // instead of trying to merge into whatever unrelated params the current
  // route has (or doesn't have).
  const onBoard = routerLocation.pathname === "/";
  const query = onBoard ? (searchParams.get("q") ?? "") : "";
  const locationFilter = onBoard ? (searchParams.get("location") ?? "") : "";
  const remoteOnly = onBoard ? searchParams.get("remote") === "true" : false;

  const [searchInput, setSearchInput] = useState(query);
  const [locationInput, setLocationInput] = useState(locationFilter);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locationDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (searchDebounce.current) clearTimeout(searchDebounce.current);
      if (locationDebounce.current) clearTimeout(locationDebounce.current);
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
    setLocationInput(value);
    if (locationDebounce.current) clearTimeout(locationDebounce.current);
    locationDebounce.current = setTimeout(() => {
      updateBoardParams((next) => {
        if ((next.get("location") ?? "") === value) return;
        if (value) next.set("location", value);
        else next.delete("location");
        next.delete("page");
      });
    }, 300);
  }

  function setRemoteOnly(value: boolean) {
    updateBoardParams((next) => {
      if (value) next.set("remote", "true");
      else next.delete("remote");
      next.delete("page");
    });
  }

  const { data: locationOptions } = useQuery({
    queryKey: ["job-locations"],
    queryFn: () => jobsApi.locations(),
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

  const initial = user?.email?.[0]?.toUpperCase() ?? "?";

  return (
    <header className="site-header" ref={headerRef}>
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
            placeholder="Search by location…"
            value={locationInput}
            onChange={(e) => handleLocationInputChange(e.target.value)}
          />
          <datalist id="job-location-options">
            {locationOptions?.map((loc) => (
              <option key={loc} value={loc} />
            ))}
          </datalist>
          <label className="site-header__remote-toggle">
            <input type="checkbox" checked={remoteOnly} onChange={(e) => setRemoteOnly(e.target.checked)} />
            Remote only
          </label>
          {user && (
            <button
              type="button"
              className="site-header__add-job-toggle"
              onClick={() => setAddJobOpen((o) => !o)}
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
                <div className="site-header__dropdown-email">{user.email}</div>
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
    </header>
  );
}
