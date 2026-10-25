import { useEffect, useState } from "react";
import type { JobDetail } from "../api/types";
import { CompanySiteLink } from "./JobCaseFile";
import { trackEvent } from "../utils/analytics";
import { scannedPosting } from "../utils/jobPosting";

// Just under a posting's color band on the right, across from the logo
// tile (JobBoardCards.css's .board__detail-actions): Share, then Apply to
// the company's site. Used on the board (JobBoardPage, JobSwipePage) and
// the shared job page (JobDetailPage).
export function JobBandActions({ job, company }: { job: JobDetail; company: string }) {
  return (
    <div className="board__detail-actions">
      <ShareJobButton job={job} company={company} />
      <CompanySiteLink job={job} className="board__detail-apply">
        Apply ↗
      </CompanySiteLink>
    </div>
  );
}

// Shares the posting's own page (/jobs/<id>, JobDetailPage): the phone's
// share sheet where there is one, or else the link copied.
function ShareJobButton({ job, company }: { job: JobDetail; company: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function share() {
    const url = `${window.location.origin}/jobs/${job.url.id}`;
    const jobTitle = scannedPosting(job)?.title;
    const title = jobTitle ? `${jobTitle} at ${company}` : company;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        trackEvent("share", { method: "share_sheet", content_type: "job", item_id: job.url.id });
      } catch {
        // Closed without sharing.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      trackEvent("share", { method: "copy_link", content_type: "job", item_id: job.url.id });
    } catch {
      // No clipboard (an insecure page, or blocked): nothing to do.
    }
  }

  return (
    <button
      type="button"
      className="board__detail-share"
      onClick={share}
      aria-label={copied ? "Link copied" : "Share this job"}
      title={copied ? "Link copied" : "Share"}
    >
      {copied ? (
        <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true">
          <path d="M4.5 10.5l3.5 3.5 7.5-8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true">
          <path
            d="M10 12.5V2.75M6.5 6 10 2.5 13.5 6M6.75 8.5H5.5A1.5 1.5 0 0 0 4 10v6a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 16 16v-6a1.5 1.5 0 0 0-1.5-1.5h-1.25"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      {copied && <span className="board__detail-share-copied">Link copied</span>}
    </button>
  );
}
