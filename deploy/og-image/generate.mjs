// Regenerates the site's share images (og:image) from their HTML sources:
//
//   source.html          -> public/og-image.png (the landing page and most pages)
//   blog-ghost-jobs.html -> public/blog/ghost-jobs-statistics-2026.png
//
// Run with: npm run og-image
//
// When the landing page's hero copy changes (headline, subhead, CTA,
// fineprint), update source.html to match by hand, then rerun this. A blog
// post's image carries that post's numbers: keep them in step the same way.

import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const IMAGES = [
  ["source.html", "../../public/og-image.png"],
  ["blog-ghost-jobs.html", "../../public/blog/ghost-jobs-statistics-2026.png"],
];

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  for (const [source, output] of IMAGES) {
    const outputPath = resolve(here, output);
    await page.goto(`file://${resolve(here, source)}`);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: outputPath });
    console.log(`Wrote ${outputPath}`);
  }
} finally {
  await browser.close();
}
