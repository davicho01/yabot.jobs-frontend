import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthContext";
import { AI_ACCESS_QUERY_KEY, onboardingApi } from "../api/onboarding";
import { useFeedback } from "../components/FeedbackModal";
import { GETTING_STARTED_PATH, freeEvaluationsPhrase } from "../utils/onboarding";
import "./HelpPage.css";

// Optional public support inbox, shown to signed-out visitors who can't use
// the in-app form. Unset means the page only offers the form.
const SUPPORT_EMAIL: string | undefined = import.meta.env.VITE_SUPPORT_EMAIL || undefined;

type Faq = { question: string; answer: ReactNode };

export function HelpPage() {
  const { user } = useAuth();
  const { openFeedback } = useFeedback();
  const aiAccessQuery = useQuery({
    queryKey: AI_ACCESS_QUERY_KEY,
    queryFn: onboardingApi.aiAccess,
    enabled: !!user,
  });
  const aiAccess = aiAccessQuery.data;

  const faqs: Faq[] = [
    {
      question: "How do I get started?",
      answer: (
        <>
          Follow the <Link to={GETTING_STARTED_PATH}>getting started guide</Link>. It walks you through uploading your
          resume, setting up AI access, picking a job, and getting your first evaluation.
        </>
      ),
    },
    ...(aiAccess?.free_trial_enabled
      ? [
          {
            question: "What's a free evaluation?",
            answer: (
              <>
                Every account gets {freeEvaluationsPhrase(aiAccess.free_evaluation_limit)}, so you can try Yabot Jobs
                without an API key. Each one unlocks every AI feature for one job: the fit score and its breakdown, a
                tailored resume, a cover letter, and interview prep.
                {aiAccess.has_own_key
                  ? " You've added your own key, so your evaluations are unlimited."
                  : aiAccess.subscribed
                    ? " You're on the paid plan, so your evaluations are unlimited."
                    : ` You have ${aiAccess.free_evaluations_remaining} left.`}
              </>
            ),
          },
        ]
      : []),
    {
      question: "Why do I need an AI API key, and what does it cost?",
      answer: (
        <>
          Scoring your resume, tailoring it, and writing cover letters all run on an AI model. You add a key from
          Anthropic, OpenAI, Google, DeepSeek, or Mistral on the <Link to="/api-keys">AI access</Link> page, and
          your provider bills you directly for what you use. That's usually a few cents per job. Yabot Jobs adds
          nothing on top.
          {aiAccess?.subscription_available &&
            ` If you'd rather not deal with a key, the ${aiAccess.subscription_price_label} plan covers it instead.`}
        </>
      ),
    },
    ...(aiAccess?.subscription_available || aiAccess?.subscribed
      ? [
          {
            question: `What do I get for ${aiAccess.subscription_price_label}?`,
            answer: (
              <>
                Every AI feature (scoring, full evaluations, tailored resumes, cover letters, and interview prep)
                runs on Yabot Jobs' AI, so you don't need an account with an AI provider. Subscribe or manage your
                plan on <Link to="/api-keys">AI access</Link>. Payments go through Stripe, and you can cancel
                anytime; you keep the plan until the end of the period you paid for.
              </>
            ),
          },
        ]
      : []),
    {
      question: "Is my API key safe?",
      answer:
        "Your key is encrypted before it's stored and only used for requests you make yourself. It's never shown " +
        "back in full, and you can remove it at any time.",
    },
    {
      question: "Scoring failed with an error from my AI provider. What now?",
      answer: (
        <>
          The message comes straight from your provider. The usual causes are a key without billing or credit set
          up, a key that was revoked, or a model your account can't use. Check your provider's console, then update
          the key on <Link to="/api-keys">AI access</Link>.
        </>
      ),
    },
    {
      question: "How do I add a job I found somewhere else?",
      answer:
        "Click + Add Job in the header and paste the posting's link. Yabot Jobs scans it and adds it to the board " +
        "for everyone, and to your applications.",
    },
    {
      question: "A job's details look wrong.",
      answer:
        "Open the job and click Report a problem. Say what's wrong (the title, location, salary, a dead link) and " +
        "we'll look into it.",
    },
  ];

  return (
    <main className="help-page">
      <h1>Help &amp; support</h1>
      <p className="help-page__intro">Answers to common questions, and a way to reach us when they don't cover it.</p>

      <section className="help-page__section" aria-labelledby="help-faq">
        <h2 id="help-faq">Common questions</h2>
        <div className="help-faq">
          {faqs.map((faq) => (
            <details key={faq.question} className="help-faq__item">
              <summary>{faq.question}</summary>
              <div className="help-faq__answer">{faq.answer}</div>
            </details>
          ))}
        </div>
        <p className="help-page__more">
          Questions about the project itself (who runs it, where jobs come from, open source) are answered on the{" "}
          <a href="/#questions">home page</a>.
        </p>
      </section>

      <section className="help-page__section help-contact" aria-labelledby="help-contact">
        <h2 id="help-contact">Still stuck?</h2>
        {user ? (
          <>
            <p>Send us a message. We'll reply to {user.email}.</p>
            <div className="help-contact__actions">
              <button type="button" className="help-contact__primary" onClick={() => openFeedback("question")}>
                Ask a question
              </button>
              <button type="button" className="help-contact__secondary" onClick={() => openFeedback("bug")}>
                Report a bug
              </button>
              <button type="button" className="help-contact__secondary" onClick={() => openFeedback("idea")}>
                Suggest an idea
              </button>
            </div>
          </>
        ) : (
          <>
            <p>
              <Link to="/login">Log in</Link> to send us a message from here
              {SUPPORT_EMAIL ? (
                <>
                  , or email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
                </>
              ) : (
                "."
              )}
            </p>
          </>
        )}
      </section>
    </main>
  );
}
