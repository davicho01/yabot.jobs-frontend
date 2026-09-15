import { Link } from "react-router-dom";
import { useTheme } from "../hooks/useTheme";
import "./Footer.css";

export function Footer() {
  const { theme, setTheme } = useTheme();
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="site-footer__top">
        <div className="site-footer__brand">
          <Link to="/" className="site-footer__brand-link">
            <span className="site-footer__mark" aria-hidden="true">
              <svg viewBox="0 0 48 48" fill="none" width="18" height="18">
                <path
                  d="M9 24h6l4-10 6 20 4-10h10"
                  stroke="var(--accent)"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="site-footer__title">Yabot Jobs</span>
          </Link>
          <span className="site-footer__statement">You shouldn't have to pay to get a job.</span>
        </div>

        <div className="site-footer__social">
          <span className="site-footer__nav-heading">Code</span>
          <a
            href="https://github.com/davicho01/yabot.jobs-frontend"
            target="_blank"
            rel="noopener noreferrer"
            className="site-footer__social-link"
            aria-label="Yabot Jobs on GitHub"
          >
            <svg viewBox="0 0 19 19" width="18" height="18" fill="currentColor">
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M9.356 1.85C5.05 1.85 1.57 5.356 1.57 9.694a7.84 7.84 0 0 0 5.324 7.44c.387.079.528-.168.528-.376 0-.182-.013-.805-.013-1.454-2.165.467-2.616-.935-2.616-.935-.349-.91-.864-1.143-.864-1.143-.71-.48.051-.48.051-.48.787.051 1.2.805 1.2.805.695 1.194 1.817.857 2.268.649.064-.507.27-.857.49-1.052-1.728-.182-3.545-.857-3.545-3.87 0-.857.31-1.558.8-2.104-.078-.195-.349-1 .077-2.078 0 0 .657-.208 2.14.805a7.5 7.5 0 0 1 1.946-.26c.657 0 1.328.092 1.946.26 1.483-1.013 2.14-.805 2.14-.805.426 1.078.155 1.883.078 2.078.502.546.799 1.247.799 2.104 0 3.013-1.818 3.675-3.558 3.87.284.247.528.714.528 1.454 0 1.052-.012 1.896-.012 2.156 0 .208.142.455.528.377a7.84 7.84 0 0 0 5.324-7.441c.013-4.338-3.48-7.844-7.773-7.844"
              />
            </svg>
            <span>GitHub</span>
          </a>
        </div>
      </div>

      <div className="site-footer__bottom">
        <span>© {year} Yabot Jobs</span>
        <div className="theme-toggle" role="group" aria-label="Theme">
          <button
            type="button"
            className={theme === "light" ? "is-active" : ""}
            aria-pressed={theme === "light"}
            title="Light"
            onClick={() => setTheme("light")}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
              <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.8" />
              <path
                d="M12 2.5v2.5M12 19v2.5M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M2.5 12H5M19 12h2.5M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <button
            type="button"
            className={theme === "system" ? "is-active" : ""}
            aria-pressed={theme === "system"}
            title="Match device"
            onClick={() => setTheme("system")}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
              <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
              <path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" />
            </svg>
          </button>
          <button
            type="button"
            className={theme === "dark" ? "is-active" : ""}
            aria-pressed={theme === "dark"}
            title="Dark"
            onClick={() => setTheme("dark")}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
              <path
                d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z"
                fill="currentColor"
              />
            </svg>
          </button>
        </div>
      </div>
    </footer>
  );
}
