import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { trackPageView } from "../utils/analytics";

// Reports a GA page view for the first page and for every in-app navigation
// after it. Watches pathname and search only: a hash change isn't a new page.
export function usePageViews() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    trackPageView(location.href);
  }, [pathname, search]);
}
