// Which blog posts send readers into the product. Every click on a link to
// another yabot.jobs page from a blog page's content sends one GA4 event,
// blog_cta_click, with:
//   post       the page it was on ("ghost-jobs-statistics-2026", "index" for /blog)
//   placement  where the link sat: "cta" (the end-of-post box), "more" (the
//              "More from the blog" cards), "card" (a post card on /blog),
//              "byline", or "body" (in the text)
//   link_url   where it went (path and query only)
//   link_text  what it said
// Links to other sites aren't counted here; GA4's enhanced measurement
// already records those as outbound clicks. The page's own gtag setup
// (consent defaults included) decides whether anything is sent.
const post = location.pathname.replace(/\/+$/, "").split("/")[2] || "index";

document.addEventListener("click", (event) => {
  const link = event.target instanceof Element ? event.target.closest("main a[href]") : null;
  if (!link || typeof window.gtag !== "function") return;
  const url = new URL(link.href, location.href);
  if (url.origin !== location.origin) return;
  const placement = link.closest(".cta")
    ? "cta"
    : link.closest(".more")
      ? "more"
      : link.closest(".post-card")
        ? "card"
        : link.closest(".byline")
        ? "byline"
        : "body";
  window.gtag("event", "blog_cta_click", {
    post,
    placement,
    link_url: url.pathname + url.search,
    // A post card's title alone, not its date and summary too.
    link_text: (link.querySelector(".post-card__title") ?? link).textContent.replace(/\s+/g, " ").trim().slice(0, 100),
  });
});
