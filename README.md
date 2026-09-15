# Yabot Jobs

**You shouldn't have to pay to get a job.**

Yabot Jobs scans job postings, tracks your applications, and helps you tailor
resumes and cover letters — free, and hosted at
[yabot.jobs](https://yabot.jobs).

This repo is the frontend: a React + TypeScript single-page app that talks to
the [yabot.jobs-backend](https://github.com/davicho01/yabot.jobs-backend) API.

## Features

- **Job board** — scans a posting URL and extracts title, company, location,
  work type, and pay from the raw page.
- **Applications tracker** — one place to see everything you've saved,
  applied to, or archived.
- **Resume tools** — upload a resume (PDF/DOCX), preview it, and get an
  AI fitness report against a specific posting.
- **Bring your own AI API key** — Anthropic, OpenAI, or DeepSeek; used only
  for your own resume review, scoring, and generation requests.
- **Light/dark/system theme**, remembered across visits.

## Tech stack

- [React 19](https://react.dev) + [TypeScript](https://www.typescriptlang.org)
- [Vite](https://vite.dev) for dev server and bundling
- [React Router](https://reactrouter.com) for routing
- [TanStack Query](https://tanstack.com/query) for server state
- [Oxlint](https://oxc.rs) for linting

## Getting started

```bash
npm install
cp .env.example .env   # point VITE_API_BASE_URL at your backend
npm run dev
```

The dev server runs at `http://localhost:3000` and expects a running
[yabot.jobs-backend](https://github.com/davicho01/yabot.jobs-backend) instance
at the URL set in `VITE_API_BASE_URL` (defaults to `http://localhost:8000`).

### Other scripts

| Command           | What it does                          |
| ------------------ | -------------------------------------- |
| `npm run build`    | Type-checks, then builds to `dist/`   |
| `npm run preview`  | Serves the production build locally    |
| `npm run lint`     | Runs Oxlint                             |

## Deployment

Pushes to `main` deploy automatically via GitHub Actions: the app is built
and synced to an S3 bucket fronted by CloudFront, authenticating to AWS via
OIDC (no long-lived credentials). See `.github/workflows/deploy.yml`.

## License

MIT — see [LICENSE](./LICENSE).
