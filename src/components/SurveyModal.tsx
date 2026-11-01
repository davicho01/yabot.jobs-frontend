import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ApiError } from "../api/client";
import {
  surveyApi,
  type SurveyArrangement,
  type SurveyDuration,
  type SurveyIndustry,
  type SurveyLiked,
  type SurveyRating,
  type SurveySource,
  type SurveySubmitPayload,
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

// One question: radio buttons when only one answer fits, checkboxes when
// several do (`max` caps how many can be ticked). Options sit in a grid so
// short answers share a row instead of making the page long.
function Question<T extends string>({
  legend,
  hint,
  type,
  options,
  selected,
  onChange,
  max,
  columns = 2,
}: {
  legend: string;
  hint?: string;
  type: "radio" | "checkbox";
  options: Option<T>[];
  selected: T[];
  onChange: (next: T[]) => void;
  max?: number;
  columns?: 1 | 2 | 3 | 4 | 5;
}) {
  const full = max !== undefined && selected.length >= max;
  return (
    <fieldset className="survey-modal__question">
      <legend className="survey-modal__legend">
        {legend}
        {hint && <span className="survey-modal__hint">{hint}</span>}
      </legend>
      <div className={`survey-modal__options survey-modal__options--${columns}`}>
        {options.map((option) => {
          const checked = selected.includes(option.value);
          return (
            <label
              key={option.value}
              className={`survey-modal__option${checked ? " is-checked" : ""}${
                !checked && full && type === "checkbox" ? " is-disabled" : ""
              }`}
            >
              <input
                type={type}
                name={legend}
                checked={checked}
                disabled={!checked && full && type === "checkbox"}
                onChange={() => onChange(type === "radio" ? [option.value] : toggle(selected, option.value))}
              />
              <span>{option.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

// Two pages. Page 1 is saved when "Next" is pressed, so a visitor who stops
// there still counts; page 2 sends the rest with completed=true. Every
// question is optional. Backend: POST /survey (app.services.survey).
export function SurveyModal({
  visitorId,
  onDone,
  onClose,
}: {
  visitorId: string;
  // Called once page 2 is submitted (the survey won't be offered again).
  onDone: () => void;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [page, setPage] = useState<1 | 2>(1);

  const [source, setSource] = useState<SurveySource[]>([]);
  const [duration, setDuration] = useState<SurveyDuration[]>([]);
  const [industries, setIndustries] = useState<SurveyIndustry[]>([]);
  const [roleName, setRoleName] = useState("");
  const [arrangement, setArrangement] = useState<SurveyArrangement[]>([]);

  const [verification, setVerification] = useState<SurveyRating[]>([]);
  const [dedup, setDedup] = useState<SurveyRating[]>([]);
  const [liked, setLiked] = useState<SurveyLiked[]>([]);
  const [wanted, setWanted] = useState<SurveyWanted[]>([]);
  const [comments, setComments] = useState("");
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

  function showPage(target: 1 | 2) {
    setPage(target);
    bodyRef.current?.scrollTo({ top: 0 });
  }

  // Only what was answered is sent, so skipping a question saves nothing.
  function page1Payload(): SurveySubmitPayload {
    return {
      visitor_id: visitorId,
      ...(source[0] && { source: source[0] }),
      ...(duration[0] && { search_duration: duration[0] }),
      ...(industries.length > 0 && { industries }),
      ...(roleName.trim() && { role_name: roleName.trim() }),
      ...(arrangement.length > 0 && { work_arrangement: arrangement }),
    };
  }

  function page2Payload(): SurveySubmitPayload {
    return {
      visitor_id: visitorId,
      completed: true,
      ...(verification[0] && { verification_dates_rating: verification[0] }),
      ...(dedup[0] && { dedup_rating: dedup[0] }),
      ...(liked.length > 0 && { liked }),
      ...(wanted.length > 0 && { wanted }),
      ...(comments.trim() && { comments: comments.trim() }),
      // Signed-in visitors are identified by their account instead.
      ...(!user && email.trim() && { contact_email: email.trim() }),
      // Signed-in visitors say yes or no with a checkbox instead.
      ...(user && { contact_ok: contactOk }),
    };
  }

  function next() {
    submitMutation.mutate(page1Payload(), {
      onSuccess: () => {
        trackEvent("survey_page1");
        showPage(2);
      },
    });
  }

  function finish() {
    submitMutation.mutate(page2Payload(), {
      onSuccess: () => {
        trackEvent("survey_submit");
        onDone();
      },
    });
  }

  const error = submitMutation.isError
    ? submitMutation.error instanceof ApiError
      ? submitMutation.error.message
      : "Something went wrong."
    : null;

  return (
    <div className="survey-modal__overlay" onClick={onClose}>
      <div
        className="survey-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Quick survey"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header and footer stay put; only the questions scroll. */}
        <div className="survey-modal__header">
          <div>
            <h2>{done ? "Thank you!" : page === 1 ? "About your search" : "About yabot.jobs"}</h2>
            {!done && <p className="survey-modal__sub">Quick survey · every question is optional</p>}
          </div>
          <button type="button" className="survey-modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {!done && (
          <div className="survey-modal__progress" aria-label={`Page ${page} of 2`}>
            <span style={{ width: page === 1 ? "50%" : "100%" }} />
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
              <Question
                legend="Which industries?"
                hint={`Pick up to ${MAX_INDUSTRIES}`}
                type="checkbox"
                options={INDUSTRIES}
                selected={industries}
                onChange={setIndustries}
                max={MAX_INDUSTRIES}
                columns={4}
              />
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
          ) : (
            <>
              <Question
                legend="How useful are the Posted, First found and Verified dates shown on each job?"
                type="radio"
                options={RATINGS}
                selected={verification}
                onChange={setVerification}
                columns={5}
              />
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
              <div className="survey-modal__question">
                <label className="survey-modal__legend" htmlFor="survey-comments">
                  What else would make your job search easier?
                  <span className="survey-modal__hint">
                    Any features or ideas we haven&apos;t mentioned in this survey
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
              {page === 2 && (
                <button type="button" className="survey-modal__secondary" onClick={() => showPage(1)}>
                  Back
                </button>
              )}
              <button
                type="button"
                className="survey-modal__primary"
                disabled={submitMutation.isPending}
                onClick={page === 1 ? next : finish}
              >
                {submitMutation.isPending ? "Saving…" : page === 1 ? "Next" : "Submit"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
