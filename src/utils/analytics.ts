// Google Analytics 4 for the app shell (app.html). The landing page (index.html)
// and the static /jobs/<country> pages load the same property with their own
// inline snippets.
//
// Page views are sent by hand (see usePageViews) rather than by gtag's own
// automatic ones, because the URL has to be cleaned first: the sign-in link
// lands on /auth/callback?token=…, and GA would otherwise store that token
// with the visit. Every event gtag sends picks up the cleaned page_location
// set here.

const MEASUREMENT_ID = "G-CDDT9RZ59T";

// Query parameters that carry credentials or one-time IDs and must never reach GA.
const PRIVATE_PARAMS = ["token", "request_id", "code", "state"];

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

// Only production builds report; local dev and previews would skew the numbers.
const enabled = import.meta.env.PROD;

export function cleanUrl(href: string): string {
  const url = new URL(href);
  for (const name of PRIVATE_PARAMS) url.searchParams.delete(name);
  url.hash = "";
  return url.toString();
}

export function initAnalytics() {
  if (!enabled) return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    // gtag.js expects the arguments object itself, not an array copy.
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", MEASUREMENT_ID, {
    send_page_view: false,
    page_location: cleanUrl(location.href),
  });

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
  document.head.appendChild(script);
}

export function trackPageView(href: string) {
  if (!enabled) return;
  const pageLocation = cleanUrl(href);
  window.gtag("set", { page_location: pageLocation });
  window.gtag("event", "page_view", { page_location: pageLocation, page_title: document.title });
}
