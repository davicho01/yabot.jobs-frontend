// Regenerates public/og-image.png from deploy/og-image/source.html.
//
// Run with: npm run og-image
//
// When the landing page's hero copy changes (headline, subhead, CTA,
// fineprint), update source.html to match by hand, then rerun this.

import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(here, "source.html");
const outputPath = resolve(here, "../../public/og-image.png");

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.goto(`file://${sourcePath}`);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: outputPath });
  console.log(`Wrote ${outputPath}`);
} finally {
  await browser.close();
}
