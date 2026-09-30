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

- [ ] Show a progress checklist (e.g., "2 of 4 done") in the header or dashboard until every step is done.
- [ ] Store each step's progress on the backend so the checklist works across devices.
- [ ] Replace the dead-end `PrerequisiteNotice` ([`src/components/PrerequisiteNotice.tsx`](src/components/PrerequisiteNotice.tsx)) with "continue setup" links back into the flow.

**Repos:** frontend, backend

## 2. AI access: free trial, then your own key or a paid plan — L

- [ ] **Free trial:** 5 free resume evaluations using the in-house LLM.
- [ ] **When the trial runs out, the user picks one:**
  - add their own LLM key (free, unlimited), or
  - subscribe for $5/month to keep using the in-house LLM.
- [ ] **Backend:** a usage counter per user, a check before each evaluation, and a clear "out of free credits" response.
- [ ] **Frontend:** a "3 of 5 free evaluations left" meter and a paywall/key prompt when they run out.
- [ ] **Subscription:** Stripe checkout, a webhook for status updates, and a page to manage billing. This can come later than the trial and key prompt.

**Open question:** what does one evaluation cost on the in-house LLM? That decides whether $5/month covers heavy users, or whether you need a monthly cap.

**Repos:** frontend, backend

## 3. User feedback — S

- [ ] A "Feedback" button on every page that opens a short form (text, optional rating, page URL attached automatically).
- [ ] Store submissions on the backend and show them on an admin page, next to the existing admin dashboards.
- [ ] Later: a thumbs up/down on each job evaluation to track how good the results are.

**Repos:** frontend, backend

## 4. User support — S–M

- [ ] A Help/Support link in the header and footer.
- [ ] Start simple: a support email plus a short FAQ covering LLM keys, resume upload and how evaluations work.
- [ ] Later: a contact form that creates tickets, or a third-party chat widget.

Feedback (#3) and support can share one form with a "Bug / Question / Idea" selector.

**Repos:** frontend (backend if using a contact form)
