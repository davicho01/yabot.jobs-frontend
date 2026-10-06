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

// EEA + UK + Switzerland: analytics cookies are off by default there (GDPR/ePrivacy),
// so those visitors are only counted by cookieless pings; Google resolves the region
// from the IP. The inline snippets in index.html, about.html, questions.html and
// privacy.html, and the backend's static pages (templates/seo/assets/analytics.js),
// copy this list, so keep them in step.
export const CONSENT_REGIONS = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV",
  "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO", "GB", "CH",
];
// Nothing is ever used for ads.
const NO_ADS = { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" };

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
  window.gtag("consent", "default", { analytics_storage: "denied", region: CONSENT_REGIONS, ...NO_ADS });
  // Global Privacy Control: the visitor asked not to be tracked, wherever they are.
  const gpc = (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
  window.gtag("consent", "default", { analytics_storage: gpc ? "denied" : "granted", ...NO_ADS });
  window.gtag("js", new Date());
  window.gtag("config", MEASUREMENT_ID, {
    send_page_view: false,
    page_location: cleanUrl(location.href),
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
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
