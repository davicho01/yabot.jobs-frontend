// CloudFront Function (viewer request) that serves the static content pages at
// clean URLs: /questions -> /questions.html, /privacy -> /privacy.html, /about -> /about.html.
//
// Why it is needed: the distribution answers unknown paths with /index.html (the
// SPA fallback), so without this rewrite /questions never reaches questions.html.
// index.html carries a matching redirect as a safety net, which costs an extra
// round trip and lands the visitor on the .html URL. This Function is what makes
// the clean URL real.
//
// Deliberately an allowlist, not a "no extension means append .html" rule: every
// app route (/jobs, /login, /jobs/<id>, /auth/callback, …) is also extensionless
// and must keep falling through to the SPA. Add a page here only once its HTML
// file is actually in the bucket.
//
// This file is not bundled or deployed by npm/GitHub Actions. It is kept here so
// the behavior is reviewable and versioned; attaching it is a manual AWS step:
//
//   1. CloudFront > Functions > Create function (runtime cloudfront-js-2.0)
//   2. Paste this code, Publish
//   3. Attach to the distribution's default behavior, Viewer request
//
// Verify after deploying with:
//   curl -sI https://yabot.jobs/questions   # 200, and not the 83KB landing page
//   curl -sI https://yabot.jobs/jobs/us     # still the app

var PAGES = {
  "/questions": "/questions.html",
  "/privacy": "/privacy.html",
  "/about": "/about.html",
};

function handler(event) {
  var request = event.request;
  // Normalize a trailing slash so /privacy/ behaves like /privacy. "/" itself
  // normalizes to "" and simply misses the lookup, which is correct: the root
  // is already index.html.
  var uri = request.uri.replace(/\/+$/, "");
  var target = PAGES[uri];

  if (target) {
    request.uri = target;
  }

  return request;
}
