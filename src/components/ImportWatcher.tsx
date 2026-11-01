import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { jobsApi } from "../api/jobs";
import { scannedPosting } from "../utils/jobPosting";
import { getImportWatches, IMPORT_WATCH_EVENT, removeImportWatch } from "../utils/importWatch";
import "./ImportWatcher.css";

const POLL_MS = 3000;
const TOAST_MS = 12000;

interface Toast {
  message: string;
  to: string;
}

// Watches jobs the candidate asked to hear about (the "Notify me" button on
// the import waiting page) wherever they are in the app, and tells them when
// each one finishes: a desktop notification if the tab is in the background,
// a small banner if they're on another page. On the job's own page the
// dashboard appearing is the notice, so nothing extra is shown there.
export function ImportWatcher() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const pathRef = useRef(pathname);
  const [ids, setIds] = useState<string[]>(() => getImportWatches());
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    pathRef.current = pathname;
  });

  useEffect(() => {
    const sync = () => setIds(getImportWatches());
    window.addEventListener(IMPORT_WATCH_EVENT, sync);
    return () => window.removeEventListener(IMPORT_WATCH_EVENT, sync);
  }, []);

  useEffect(() => {
    if (ids.length === 0) return;
    let cancelled = false;

    function announce(urlId: string, title: string, body: string) {
      const to = `/jobs/${urlId}/apply`;
      if (pathRef.current === to && !document.hidden) return;
      if (document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          const n = new Notification(title, { body });
          n.onclick = () => {
            window.focus();
            navigate(to);
            n.close();
          };
          return;
        } catch {
          // Mobile browsers (Android Chrome) refuse `new Notification` outside a
          // service worker — fall through to the in-app banner instead.
        }
      }
      setToast({ message: body, to });
    }

    async function check(urlId: string) {
      try {
        const job = await jobsApi.get(urlId);
        if (cancelled) return;
        const status = job.url.scan_status;
        const posting = scannedPosting(job);
        if (posting && status !== "failed" && status !== "needs_review") {
          removeImportWatch(urlId);
          void queryClient.invalidateQueries({ queryKey: ["job", urlId] });
          const what = posting.title
            ? `${posting.title}${posting.company_name ? ` at ${posting.company_name}` : ""}`
            : "Your job";
          announce(urlId, "Job imported", `${what} is ready.`);
        } else if (status === "needs_review") {
          // Retries are used up. (A plain "failed" is retried by the server, so keep watching.)
          removeImportWatch(urlId);
          void queryClient.invalidateQueries({ queryKey: ["job", urlId] });
          announce(urlId, "Import failed", `We couldn't import the job from ${job.url.domain}.`);
        }
      } catch {
        // Offline, signed out, or a blip: try again on the next tick.
      }
    }

    const tick = () => ids.forEach((id) => void check(id));
    tick();
    const timer = window.setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [ids, navigate, queryClient]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;
  return (
    <div className="import-toast" role="status" aria-live="polite">
      <span className="import-toast__message">{toast.message}</span>
      <Link className="import-toast__link" to={toast.to} onClick={() => setToast(null)}>
        View job
      </Link>
      <button type="button" className="import-toast__close" aria-label="Dismiss" onClick={() => setToast(null)}>
        ×
      </button>
    </div>
  );
}
