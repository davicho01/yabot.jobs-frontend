import { Link } from "react-router-dom";
import "./DossierAction.css";

// Renders a 422's prerequisite-missing detail text (no main resume, or no
// LLM API key) with a link to whichever settings page actually fixes it.
export function PrerequisiteNotice({ message }: { message: string }) {
  // The backend's 422 detail text names which prerequisite is missing (a
  // main resume vs. an LLM API key) — route to whichever settings page
  // actually fixes it, since those now live on separate pages.
  // Key messages are checked first: some of them mention resumes too
  // ("...before using resume features"), which used to send people to the
  // Resume page for a missing key.
  const isResumeIssue = !/api key/i.test(message) && /resume/i.test(message);
  const fixLink = isResumeIssue
    ? { to: "/resume", label: "Fix this in Resume →" }
    : { to: "/api-keys", label: "Fix this in AI API Keys →" };
  return (
    <p className="dossier-action__prereq">
      {message} <Link to={fixLink.to}>{fixLink.label}</Link>
    </p>
  );
}
