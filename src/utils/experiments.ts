import { useMediaQuery } from "../hooks/useMediaQuery";
import { setUserProperties, trackEvent } from "./analytics";

// Phone search layout A/B test. Both sides start on the list of job cards,
// and a card tapped opens its posting on a screen of its own (JobSwipePage);
// they differ only in what that screen does: "list" shows just that
// posting, and "swipe" swipes on sideways through the rest of the results.
// Phones only — desktop always gets the list and is never counted. A phone visitor is put on one side, at random, the first
// time they reach the board, and stays there on this browser.
//
// Read the results in GA4 by the user-scoped custom dimension
// "search_layout": engagement time per user, job_view, job_site_click,
// apply_click and save_job counts, and returning users.
export type SearchLayout = "list" | "swipe";

const EXPERIMENT = "phone_search_layout";
const STORAGE_KEY = "yabot.experiment.phone_search_layout";
const LAYOUTS: SearchLayout[] = ["list", "swipe"];

// Must match the phone breakpoint in JobBoardPage.css.
const PHONE_QUERY = "(max-width: 760px)";

function isLayout(value: string | null): value is SearchLayout {
  return LAYOUTS.includes(value as SearchLayout);
}

function readStored(): SearchLayout | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isLayout(value) ? value : null;
  } catch {
    return null;
  }
}

function store(layout: SearchLayout) {
  try {
    localStorage.setItem(STORAGE_KEY, layout);
  } catch {
    // Private mode or blocked storage: the visitor is re-drawn on each visit,
    // which only blurs the numbers a little.
  }
}

let assigned: SearchLayout | null = null;

// This visitor's side of the test. ?layout=swipe or ?layout=list forces a
// side (and keeps it), for trying both on a real phone.
export function phoneSearchLayout(): SearchLayout {
  if (assigned) return assigned;
  const forced = new URLSearchParams(window.location.search).get("layout");
  if (isLayout(forced)) {
    store(forced);
    assigned = forced;
  } else {
    assigned = readStored() ?? (Math.random() < 0.5 ? "list" : "swipe");
    store(assigned);
  }
  return assigned;
}

let exposed = false;

// Marks this visitor as in the test, once per page load: every event after
// this carries their side, so GA can compare the two.
export function reportSearchLayoutExposure(layout: SearchLayout) {
  if (exposed) return;
  exposed = true;
  setUserProperties({ search_layout: layout });
  trackEvent("experiment_exposure", { experiment: EXPERIMENT, variant: layout });
}

export function useIsPhone(): boolean {
  return useMediaQuery(PHONE_QUERY);
}
