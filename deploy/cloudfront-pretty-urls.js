// CloudFront Function (viewer request) that sends each extensionless path to
// the file that serves it, so that anything else can be a real 404:
//
//   - the static content pages at clean URLs: /questions -> /questions.html,
//     /privacy -> /privacy.html, /about -> /about.html;
//   - the app's routes (/jobs, /jobs/<id>, /login, /profile, …) -> /app.html.
//
// Why it is needed: S3 has no object for these paths. The distribution's
// 403/404 custom error response answers missing objects with /index.html and
// status 404, so search engines see a real 404 for a URL that doesn't exist
// (an expired /job/<id>, a mistyped /jobs/us/... hub) instead of a copy of the
// landing page with a 200, a soft 404. This Function is what keeps the real
// pages out of that fallback, with a 200.
//
// Deliberately an allowlist, not a "no extension means the app" rule: the
// static job pages (/job/<id>, /jobs/us/...) are extensionless S3 objects too,
// and a missing one must reach the 404. So /jobs/<id> only matches a UUID, and
// /job/<id> is never rewritten. A route left off this list still works for
// people — index.html's own script hands it to the app — it just answers 404.
// Keep APP_ROUTES / APP_ROUTE_PATTERNS in step with src/App.tsx's routes.
//
// This file is not bundled or deployed by npm/GitHub Actions. It is kept here so
// the behavior is reviewable and versioned; attaching it is a manual AWS step:
//
//   1. CloudFront > Functions > Create function (runtime cloudfront-js-2.0),
//      or open the existing one
//   2. Paste this code, Publish
//   3. Attach to the distribution's default behavior, Viewer request
//   4. Only once 1-3 are live: distribution > Error pages, edit the 403 and the
//      404 custom error responses to keep /index.html as the page but set the
//      HTTP response code to 404
//
// Verify after deploying with:
//   curl -sI https://yabot.jobs/questions          # 200, and not the 55KB landing page
//   curl -sI https://yabot.jobs/jobs               # 200, the 2.5KB app shell
//   curl -sI https://yabot.jobs/jobs/us            # 200, the static country page
//   curl -sI https://yabot.jobs/not-a-page         # 404

var PAGES = {
  "/questions": "/questions.html",
  "/privacy": "/privacy.html",
  "/about": "/about.html",
};

var APP_ROUTES = {
  "/jobs": true,
  "/jobs2": true,
  "/login": true,
  "/help": true,
  "/auth/callback": true,
  "/oauth/authorize": true,
  "/getting-started": true,
  "/profile": true,
  "/resume": true,
  "/api-keys": true,
  "/access-tokens": true,
  "/applications": true,
  "/resume-optimization": true,
  "/saved-searches": true,
  "/admin": true,
  "/admin/jobs": true,
  "/admin/duplicates": true,
  "/admin/feedback": true,
};

var UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
var APP_ROUTE_PATTERNS = [
  new RegExp("^/jobs/" + UUID + "(/apply2?)?$"),
  /^\/admin\/crawl-sources\/[^/]+$/,
];

function handler(event) {
  var request = event.request;
  // Normalize a trailing slash so /privacy/ behaves like /privacy. "/" itself
  // normalizes to "" and simply misses every lookup, which is correct: the root
  // is already index.html.
  var uri = request.uri.replace(/\/+$/, "");

  if (PAGES[uri]) {
    request.uri = PAGES[uri];
  } else if (APP_ROUTES[uri] || APP_ROUTE_PATTERNS.some(function (re) { return re.test(uri); })) {
    request.uri = "/app.html";
  }

  return request;
}
