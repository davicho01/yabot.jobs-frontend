# yabot.jobs Roadmap

Features planned across the frontend, backend, browser and MCP repos.
Sizes are rough: S (days), M (about a week), L (multiple weeks).

## Suggested order

1. [User feedback](#3-user-feedback--s): quick to build, and shows where new users struggle
2. [Guided onboarding](#1-guided-onboarding-first-job-start-to-finish--l): the free-credit step can say "coming soon" at first
3. [AI access](#2-ai-access-free-trial-then-your-own-key-or-a-paid-plan--l): free trial first, then the $5/month subscription
4. [User support](#4-user-support--sm)

---

## 1. Guided onboarding (first job, start to finish) — L

A step-by-step flow for new users:

1. Upload your first resume and set it as your main resume.
2. Set up AI access: add an LLM key, or use free credits (see #2).
3. Pick a job from the board and apply.
4. Run a job evaluation and see the result.

- [x] Show a progress checklist (e.g., "2 of 4 done") in the header or dashboard until every step is done.
  A banner under the header shows progress and the next step, and `/getting-started` walks through all four.
  Brand-new users land there after their first sign-in.
- [x] Store each step's progress on the backend so the checklist works across devices. `GET /onboarding` works
  out each step from the user's own data. Finishing or hiding the checklist is saved on the user.
- [x] Replace the dead-end `PrerequisiteNotice` ([`src/components/PrerequisiteNotice.tsx`](src/components/PrerequisiteNotice.tsx)) with "continue setup" links back into the flow.
  A missing-key error on the Apply page now links to AI API Keys. It used to link to the Resume page when the
  message mentioned resumes.

**Repos:** frontend, backend

## 2. AI access: free trial, then your own key or a paid plan — L

- [x] **Free trial:** 5 free resume evaluations using the in-house LLM. `FREE_EVALUATION_LIMIT` (backend) sets
  the number, and the trial runs on the `SYSTEM_LLM_*` key. One evaluation is a job's fit score plus its first
  breakdown. Tailoring, cover letters and re-running a breakdown still need the user's own key. A failed LLM
  call gives the evaluation back.
- [ ] **When the trial runs out, the user picks one:**
  - add their own LLM key (free, unlimited), or
  - subscribe for $5/month to keep using the in-house LLM.
- [x] **Backend:** a usage counter per user, a check before each evaluation, and a clear "out of free credits" response.
- [x] **Frontend:** a "3 of 5 free evaluations left" meter and a paywall/key prompt when they run out.
  The meter is next to the Score button and on AI API Keys. The key form now links to each provider's key console.
- [ ] **Subscription:** (not started, decision needed) Stripe checkout, a webhook for status updates, and a page to manage billing. This can come later than the trial and key prompt.

**Open question:** what does one evaluation cost on the in-house LLM? That decides whether $5/month covers heavy users, or whether you need a monthly cap.

**Repos:** frontend, backend

## 3. User feedback — S

- [x] A "Feedback" button on every page that opens a short form (text, optional rating, page URL attached automatically).
  It's "Send feedback" in the account menu and the footer.
- [x] Store submissions on the backend and show them on an admin page, next to the existing admin dashboards.
  See `/admin/feedback` and the "New feedback" tile. Admins are also emailed each submission, with the sender
  as Reply-To.
- [ ] Later: a thumbs up/down on each job evaluation to track how good the results are.

**Repos:** frontend, backend

## 4. User support — S–M

- [x] A Help/Support link in the header and footer.
- [x] Start simple: a support email plus a short FAQ covering LLM keys, resume upload and how evaluations work.
  See `/help`. The support email only appears when `VITE_SUPPORT_EMAIL` is set.
- [x] Later: a contact form that creates tickets, or a third-party chat widget. The contact form is the feedback
  form with kind "question", triaged on `/admin/feedback`.

Feedback (#3) and support can share one form with a "Bug / Question / Idea" selector.

**Repos:** frontend (backend if using a contact form)
