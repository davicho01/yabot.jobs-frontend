import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ApiError } from "../api/client";
import {
  surveyApi,
  type SurveyArrangement,
  type SurveyDateRating,
  type SurveyDuration,
  type SurveyIndustry,
  type SurveyLiked,
  type SurveyRating,
  type SurveySource,
  type SurveySubmitPayload,
  type SurveyTool,
  type SurveyWanted,
} from "../api/survey";
import { useAuth } from "../auth/AuthContext";
import { trackEvent } from "../utils/analytics";
import "./SurveyModal.css";

type Option<T extends string> = { value: T; label: string };

const SOURCES: Option<SurveySource>[] = [
  { value: "google", label: "Google search" },
  { value: "reddit", label: "Reddit" },
  { value: "friend", label: "Friend or coworker" },
  { value: "social", label: "Social media" },
  { value: "ai_chat", label: "AI chat (ChatGPT, Claude…)" },
  { value: "other", label: "Other" },
];

const DURATIONS: Option<SurveyDuration>[] = [
  { value: "just_started", label: "Just started" },
  { value: "lt_1m", label: "Under 1 month" },
  { value: "1_3m", label: "1–3 months" },
  { value: "3_6m", label: "3–6 months" },
  { value: "6m_plus", label: "6+ months" },
  { value: "employed_browsing", label: "Employed, just browsing" },
];

const INDUSTRIES: Option<SurveyIndustry>[] = [
  { value: "tech", label: "Tech & software" },
  { value: "healthcare", label: "Healthcare" },
  { value: "finance", label: "Finance & banking" },
  { value: "education", label: "Education" },
  { value: "retail", label: "Retail & e-commerce" },
  { value: "hospitality", label: "Hospitality & food service" },
  { value: "manufacturing_logistics", label: "Manufacturing & logistics" },
  { value: "construction_trades", label: "Construction & trades" },
  { value: "government_nonprofit", label: "Government & nonprofit" },
  { value: "marketing_media", label: "Marketing & media" },
  { value: "legal", label: "Legal" },
  { value: "energy_utilities", label: "Energy & utilities" },
  { value: "other", label: "Other" },
];
const MAX_INDUSTRIES = 3;

const ARRANGEMENTS: Option<SurveyArrangement>[] = [
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "on_site", label: "On-site" },
];

const TOOLS: Option<SurveyTool>[] = [
  { value: "linkedin", label: "LinkedIn" },
  { value: "indeed", label: "Indeed" },
  { value: "google_jobs", label: "Google Jobs" },
  { value: "glassdoor", label: "Glassdoor" },
  { value: "ziprecruiter", label: "ZipRecruiter" },
  { value: "company_sites", label: "Company career pages" },
  { value: "other", label: "Other" },
];

// One rating per date shown on a job (the Posted / First found / Verified row).
const DATE_RATINGS: Option<SurveyDateRating>[] = [
  { value: "useful", label: "Useful" },
  { value: "not_useful", label: "Not useful" },
  { value: "didnt_notice", label: "Didn't notice" },
];

const RATINGS: Option<SurveyRating>[] = [
  { value: "very_useful", label: "Very useful" },
  { value: "somewhat_useful", label: "Somewhat useful" },
  { value: "dont_care", label: "Don't care" },
  { value: "confusing", label: "Confusing" },
  { value: "didnt_notice", label: "Didn't notice" },
];

const LIKED: Option<SurveyLiked>[] = [
  { value: "fresh_jobs", label: "Fresh jobs" },
  { value: "company_sites", label: "Jobs straight from company sites" },
  { value: "search_filters", label: "Search & filters" },
  { value: "alerts", label: "Job alerts" },
  { value: "clean_site", label: "Clean, simple site" },
  { value: "no_ads", label: "No ads or spam" },
];

const WANTED: Option<SurveyWanted>[] = [
  { value: "better_search", label: "Better search" },
  { value: "salary_info", label: "Salary info" },
  { value: "resume_tools", label: "Resume tools" },
  { value: "app_tracking", label: "Application tracking" },
  { value: "more_companies", label: "More companies" },
  { value: "mobile_app", label: "Mobile app" },
];

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

// A grid of radio buttons (one answer) or checkboxes (several; `max` caps how
// many can be ticked). Short answers share a row instead of making the page long.
type OptionsProps<T extends string> = {
  type: "radio" | "checkbox";
  options: Option<T>[];
  selected: T[];
  onChange: (next: T[]) => void;
  max?: number;
  columns?: 1 | 2 | 3 | 4 | 5;
};

function Options<T extends string>({
  name,
  type,
  options,
  selected,
  onChange,
  max,
  columns = 2,
}: OptionsProps<T> & { name: string }) {
  const full = max !== undefined && selected.length >= max;
  return (
    <div className={`survey-modal__options survey-modal__options--${columns}`}>
      {options.map((option) => {
        const checked = selected.includes(option.value);
        const disabled = !checked && full && type === "checkbox";
        return (
          <label
            key={option.value}
            className={`survey-modal__option${checked ? " is-checked" : ""}${disabled ? " is-disabled" : ""}`}
          >
            <input
              type={type}
              name={name}
              checked={checked}
              disabled={disabled}
              onChange={() => onChange(type === "radio" ? [option.value] : toggle(selected, option.value))}
            />
            <span>{option.label}</span>
          </label>
        );
      })}
    </div>
  );
}

// One numbered question: a legend over its options.
function Question<T extends string>({
  legend,
  hint,
  ...options
}: OptionsProps<T> & { legend: string; hint?: string }) {
  return (
    <fieldset className="survey-modal__question">
      <legend className="survey-modal__legend">
        {legend}
        {hint && <span className="survey-modal__hint">{hint}</span>}
      </legend>
      <Options name={legend} {...options} />
    </fieldset>
  );
}

type Page = 1 | 2 | 3;
const PAGE_TITLES: Record<Page, string> = {
  1: "About your search",
  2: "Your job search today",
  3: "About yabot.jobs",
};

// Three short pages. Each is saved when "Next" is pressed, so a visitor who
// stops partway still counts; the last page sends completed=true. Every
// question is optional. Backend: POST /survey (app.services.survey).
export function SurveyModal({
  visitorId,
  onDone,
  onClose,
}: {
  visitorId: string;
  // Called once the last page is submitted (the survey won't be offered again).
  onDone: () => void;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [page, setPage] = useState<Page>(1);

  // Page 1: about the search.
  const [source, setSource] = useState<SurveySource[]>([]);
  const [duration, setDuration] = useState<SurveyDuration[]>([]);
  const [industries, setIndustries] = useState<SurveyIndustry[]>([]);
  const [industryOther, setIndustryOther] = useState("");
  const [roleName, setRoleName] = useState("");
  const [arrangement, setArrangement] = useState<SurveyArrangement[]>([]);

  // Page 2: the job search today.
  const [tools, setTools] = useState<SurveyTool[]>([]);
  const [frustration, setFrustration] = useState("");
  const [comments, setComments] = useState("");

  // Page 3: about yabot.jobs.
  const [posted, setPosted] = useState<SurveyDateRating[]>([]);
  const [firstFound, setFirstFound] = useState<SurveyDateRating[]>([]);
  const [verified, setVerified] = useState<SurveyDateRating[]>([]);
  const [dedup, setDedup] = useState<SurveyRating[]>([]);
  const [liked, setLiked] = useState<SurveyLiked[]>([]);
  const [wanted, setWanted] = useState<SurveyWanted[]>([]);
  const [email, setEmail] = useState("");
  const [contactOk, setContactOk] = useState(false);

  const submitMutation = useMutation({
    mutationFn: (payload: SurveySubmitPayload) => surveyApi.submit(payload),
  });

  const done = submitMutation.isSuccess && submitMutation.variables?.completed === true;

  // Whether there are more questions below the visible part, so a "More
  // questions" cue can show (a phone only fits a couple of questions at once).
  const bodyRef = useRef<HTMLDivElement>(null);
  const [moreBelow, setMoreBelow] = useState(false);
  const checkMoreBelow = useCallback(() => {
    const el = bodyRef.current;
    if (el) setMoreBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 24);
  }, []);
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    // Fires once on observe and again whenever the body's size changes (a new
    // page, a window resize, the email box appearing).
    const observer = new ResizeObserver(checkMoreBelow);
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [page, done, checkMoreBelow]);

  function showPage(target: Page) {
    setPage(target);
    bodyRef.current?.scrollTo({ top: 0 });
  }

  // Only what was answered is sent, so skipping a question saves nothing.
  function payloadFor(target: Page): SurveySubmitPayload {
    if (target === 1) {
      return {
        visitor_id: visitorId,
        ...(source[0] && { source: source[0] }),
        ...(duration[0] && { search_duration: duration[0] }),
        ...(industries.length > 0 && { industries }),
        ...(industries.includes("other") && industryOther.trim() && { industry_other: industryOther.trim() }),
        ...(roleName.trim() && { role_name: roleName.trim() }),
        ...(arrangement.length > 0 && { work_arrangement: arrangement }),
      };
    }
    if (target === 2) {
      return {
        visitor_id: visitorId,
        ...(tools.length > 0 && { current_tools: tools }),
        ...(frustration.trim() && { frustration: frustration.trim() }),
        ...(comments.trim() && { comments: comments.trim() }),
      };
    }
    return {
      visitor_id: visitorId,
      completed: true,
      ...(posted[0] && { posted_date_rating: posted[0] }),
      ...(firstFound[0] && { first_found_date_rating: firstFound[0] }),
      ...(verified[0] && { verified_date_rating: verified[0] }),
      ...(dedup[0] && { dedup_rating: dedup[0] }),
      ...(liked.length > 0 && { liked }),
      ...(wanted.length > 0 && { wanted }),
      // Signed-out visitors leave an email; signed-in ones tick a box instead
      // (we already have their account email).
      ...(!user && email.trim() && { contact_email: email.trim() }),
      ...(user && { contact_ok: contactOk }),
    };
  }

  function next() {
    submitMutation.mutate(payloadFor(page), {
      onSuccess: () => {
        if (page === 3) {
          trackEvent("survey_submit");
          onDone();
        } else {
          trackEvent(`survey_page${page}`);
          showPage((page + 1) as Page);
        }
      },
    });
  }

  const error = submitMutation.isError
    ? submitMutation.error instanceof ApiError
      ? submitMutation.error.message
      : "Something went wrong."
    : null;

  const dateRows = [
    { key: "posted", label: "Posted", selected: posted, onChange: setPosted },
    { key: "first-found", label: "First found", selected: firstFound, onChange: setFirstFound },
    { key: "verified", label: "Verified", selected: verified, onChange: setVerified },
  ];

  return (
    // Not closed by clicking outside: a stray click would throw away what
    // they've typed. The × button (and Done) close it.
    <div className="survey-modal__overlay">
      <div className="survey-modal" role="dialog" aria-modal="true" aria-label="Quick survey">
        {/* Header and footer stay put; only the questions scroll. */}
        <div className="survey-modal__header">
          <div>
            <h2>{done ? "Thank you!" : PAGE_TITLES[page]}</h2>
            {!done && <p className="survey-modal__sub">Quick survey · every question is optional</p>}
          </div>
          <button type="button" className="survey-modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {!done && (
          <div className="survey-modal__progress" aria-label={`Page ${page} of 3`}>
            <span style={{ width: `${(page / 3) * 100}%` }} />
          </div>
        )}

        <div className="survey-modal__scroller">
          <div className="survey-modal__body" ref={bodyRef} onScroll={checkMoreBelow}>
            {done ? (
              <p className="survey-modal__thanks">
                Your answers help decide what we build and fix next. We read every one.
              </p>
            ) : page === 1 ? (
              <>
                <Question
                  legend="How did you find us?"
                  type="radio"
                  options={SOURCES}
                  selected={source}
                  onChange={setSource}
                  columns={3}
                />
                <Question
                  legend="How long have you been looking for work?"
                  type="radio"
                  options={DURATIONS}
                  selected={duration}
                  onChange={setDuration}
                  columns={3}
                />
                <fieldset className="survey-modal__question">
                  <legend className="survey-modal__legend">
                    Which industries?
                    <span className="survey-modal__hint">{`Pick up to ${MAX_INDUSTRIES}`}</span>
                  </legend>
                  <Options
                    name="industries"
                    type="checkbox"
                    options={INDUSTRIES}
                    selected={industries}
                    onChange={setIndustries}
                    max={MAX_INDUSTRIES}
                    columns={4}
                  />
                  {industries.includes("other") && (
                    <input
                      className="survey-modal__input"
                      type="text"
                      aria-label="Which other industry?"
                      value={industryOther}
                      maxLength={120}
                      placeholder="Which industry?"
                      onChange={(e) => setIndustryOther(e.target.value)}
                    />
                  )}
                </fieldset>
                <div className="survey-modal__question">
                  <label className="survey-modal__legend" htmlFor="survey-role">
                    What role are you looking for?
                  </label>
                  <input
                    id="survey-role"
                    className="survey-modal__input"
                    type="text"
                    value={roleName}
                    maxLength={120}
                    placeholder="e.g. ICU nurse, project manager"
                    onChange={(e) => setRoleName(e.target.value)}
                  />
                </div>
                <Question
                  legend="Where do you want to work?"
                  hint="Pick all that apply"
                  type="checkbox"
                  options={ARRANGEMENTS}
                  selected={arrangement}
                  onChange={setArrangement}
                  columns={3}
                />
              </>
            ) : page === 2 ? (
              <>
                <Question
                  legend="Which sites do you use to look for jobs today?"
                  hint="Pick all that apply"
                  type="checkbox"
                  options={TOOLS}
                  selected={tools}
                  onChange={setTools}
                  columns={4}
                />
                <div className="survey-modal__question">
                  <label className="survey-modal__legend" htmlFor="survey-frustration">
                    What&apos;s your biggest frustration with job searching?
                  </label>
                  <textarea
                    id="survey-frustration"
                    className="survey-modal__input survey-modal__textarea"
                    value={frustration}
                    maxLength={5000}
                    placeholder="e.g. fake or expired listings, no replies, too many clicks to apply"
                    onChange={(e) => setFrustration(e.target.value)}
                  />
                </div>
                <div className="survey-modal__question">
                  <label className="survey-modal__legend" htmlFor="survey-comments">
                    What would make your job search easier?
                    <span className="survey-modal__hint">
                      Any feature or idea, even one we haven&apos;t mentioned in this survey
                    </span>
                  </label>
                  <textarea
                    id="survey-comments"
                    className="survey-modal__input survey-modal__textarea"
                    value={comments}
                    maxLength={5000}
                    placeholder="e.g. a feature you wish existed, something that frustrates you, anything at all"
                    onChange={(e) => setComments(e.target.value)}
                  />
                </div>
              </>
            ) : (
              <>
                <fieldset className="survey-modal__question">
                  <legend className="survey-modal__legend">
                    How useful is each date shown on a job?
                  </legend>
                  <div className="survey-modal__rows">
                    {dateRows.map((row) => (
                      <div key={row.key} className="survey-modal__row">
                        <span className="survey-modal__row-label">{row.label}</span>
                        <Options
                          name={`date-${row.key}`}
                          type="radio"
                          options={DATE_RATINGS}
                          selected={row.selected}
                          onChange={row.onChange}
                          columns={3}
                        />
                      </div>
                    ))}
                  </div>
                </fieldset>
                <Question
                  legend="How useful is showing duplicate jobs from different sources only once?"
                  type="radio"
                  options={RATINGS}
                  selected={dedup}
                  onChange={setDedup}
                  columns={5}
                />
                <Question
                  legend="What do you like about yabot.jobs?"
                  hint="Pick all that apply"
                  type="checkbox"
                  options={LIKED}
                  selected={liked}
                  onChange={setLiked}
                  columns={3}
                />
                <Question
                  legend="What should we add?"
                  hint="Pick all that apply"
                  type="checkbox"
                  options={WANTED}
                  selected={wanted}
                  onChange={setWanted}
                  columns={3}
                />
                {user && (
                  <div className="survey-modal__question">
                    <span className="survey-modal__legend">Want to help more?</span>
                    <label className={`survey-modal__option${contactOk ? " is-checked" : ""}`}>
                      <input type="checkbox" checked={contactOk} onChange={(e) => setContactOk(e.target.checked)} />
                      <span>It&apos;s OK to email me for a short chat about this survey</span>
                    </label>
                    <p className="survey-modal__note">We&apos;d use your account email. Optional.</p>
                  </div>
                )}
                {!user && (
                  <div className="survey-modal__question">
                    <label className="survey-modal__legend" htmlFor="survey-email">
                      Want to help more?
                      <span className="survey-modal__hint">Leave your email for a short chat (optional)</span>
                    </label>
                    <input
                      id="survey-email"
                      className="survey-modal__input"
                      type="email"
                      value={email}
                      maxLength={320}
                      placeholder="you@example.com"
                      onChange={(e) => setEmail(e.target.value)}
                    />
                    <p className="survey-modal__note">Only used to contact you about this survey.</p>
                  </div>
                )}
              </>
            )}
            {error && <p className="survey-modal__error">{error}</p>}
          </div>
          {/* A fade over the bottom edge plus a pill, while more questions are
              below; tapping it scrolls down. Gone once they reach the end. */}
          {moreBelow && (
            <div className="survey-modal__more">
              <button
                type="button"
                onClick={() =>
                  bodyRef.current?.scrollBy({ top: bodyRef.current.clientHeight * 0.8, behavior: "smooth" })
                }
              >
                More questions ↓
              </button>
            </div>
          )}
        </div>

        <div className="survey-modal__footer">
          {done ? (
            <button type="button" className="survey-modal__primary" onClick={onClose}>
              Done
            </button>
          ) : (
            <>
              {page > 1 && (
                <button
                  type="button"
                  className="survey-modal__secondary"
                  onClick={() => showPage((page - 1) as Page)}
                >
                  Back
                </button>
              )}
              <button
                type="button"
                className="survey-modal__primary"
                disabled={submitMutation.isPending}
                onClick={next}
              >
                {submitMutation.isPending ? "Saving…" : page === 3 ? "Submit" : "Next"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
