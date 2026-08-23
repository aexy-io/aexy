/**
 * Measures how ready the app is for paper.
 *
 *   AEXY_TEST_TOKEN=<jwt> npm run audit:contrast
 *
 * The Open Ledger migration has one gate that cannot be judged by eye: the app
 * was written against the dark palette, so a `text-green-400` badge that reads
 * perfectly on #0E1512 is near-invisible on #F2F3EE. There are 12,485 raw
 * palette classes still carrying that assumption, and they do not announce
 * themselves — the page looks fine, individual words just stop being legible.
 *
 * At the time this was written the answer was 49 (light) versus 1 (dark) over
 * the ten routes below, which is why DEFAULT_THEME in stores/themeStore.ts is
 * still 'dark'. That constant flips when this reports zero for light.
 *
 * Not part of the test suite: it needs the docker-compose stack, a seeded
 * workspace and a real browser, and it is a progress metric rather than a
 * pass/fail assertion. Get a token with
 *   docker exec aexy-backend python scripts/generate_test_token.py --first
 *
 * The 3:1 threshold is WCAG AA for large text — deliberately lenient. It is
 * looking for "this is unreadable", not for every AA shortfall; tightening it
 * to 4.5 before the obvious breakage is gone would just produce noise.
 */
import { chromium } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
const TOKEN = process.env.AEXY_TEST_TOKEN;
const THRESHOLD = 3.0;

/** Representative of the high-traffic surfaces, not exhaustive. */
const ROUTES = [
  "/dashboard", "/crm", "/agents", "/uptime", "/sprints",
  "/service-desk", "/docs", "/insights", "/reviews", "/leave",
];

/** Runs in the page: contrast of every rendered text node against its ground. */
function scan(threshold) {
  const relative = (css) => {
    const m = css.match(/[\d.]+/g);
    if (!m) return null;
    const [r, g, b, a = 1] = m.map(Number);
    if (a === 0) return null;
    const lin = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  };

  // Walk up for the first non-transparent ancestor background: the element's
  // own is usually rgba(0,0,0,0).
  const groundOf = (el) => {
    let n = el;
    while (n && n !== document.documentElement) {
      const c = getComputedStyle(n).backgroundColor;
      const m = c.match(/[\d.]+/g);
      if (m && (m[3] === undefined || Number(m[3]) > 0.5)) return c;
      n = n.parentElement;
    }
    return getComputedStyle(document.body).backgroundColor;
  };

  const failures = [];
  let total = 0;

  for (const el of document.querySelectorAll("main *")) {
    const text = [...el.childNodes]
      .filter((n) => n.nodeType === 3 && n.textContent.trim())
      .map((n) => n.textContent.trim())
      .join(" ");
    if (!text) continue;

    const box = el.getBoundingClientRect();
    if (box.width < 2 || box.height < 2) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.opacity === "0") continue;

    const fg = relative(cs.color);
    const bg = relative(groundOf(el));
    if (fg === null || bg === null) continue;

    total++;
    const ratio = (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
    if (ratio < threshold) {
      failures.push({ text: text.slice(0, 48), color: cs.color, ratio: +ratio.toFixed(2) });
    }
  }
  return { total, failures };
}

async function auditTheme(browser, theme) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies([{ name: "aexy_authed", value: "1", url: BASE }]);
  await context.addInitScript(
    ({ token, mode }) => {
      window.localStorage.setItem("token", token);
      window.localStorage.setItem("aexy-theme", JSON.stringify({ state: { theme: mode }, version: 0 }));
    },
    { token: TOKEN, mode: theme },
  );

  const page = await context.newPage();
  const perRoute = [];
  const worst = new Map();
  let failed = 0;
  let total = 0;

  for (const route of ROUTES) {
    try {
      await page.goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 45_000 });
      await page.waitForTimeout(1_200); // let query-driven content land
      const result = await page.evaluate(scan, THRESHOLD);
      failed += result.failures.length;
      total += result.total;
      perRoute.push([route, result.failures.length]);
      for (const f of result.failures) worst.set(f.color, (worst.get(f.color) ?? 0) + 1);
    } catch {
      perRoute.push([route, "ERR"]);
    }
  }

  await context.close();
  return { failed, total, perRoute, worst };
}

if (!TOKEN) {
  console.error("AEXY_TEST_TOKEN is required — see the header comment.");
  process.exit(1);
}

const browser = await chromium.launch();
const results = {};
for (const theme of ["light", "dark"]) {
  results[theme] = await auditTheme(browser, theme);
}
await browser.close();

for (const [theme, r] of Object.entries(results)) {
  console.log(
    `\n${theme.padEnd(5)}  ${r.failed} of ${r.total} text nodes below ${THRESHOLD}:1`,
  );
  console.log("       " + r.perRoute.map(([route, n]) => `${route}=${n}`).join("  "));
  const top = [...r.worst.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (top.length) {
    console.log("       worst colours: " + top.map(([c, n]) => `${c} ×${n}`).join(", "));
  }
}

console.log(
  `\nDEFAULT_THEME in src/stores/themeStore.ts flips to 'light' when light reads 0.` +
    ` Currently ${results.light.failed}.`,
);
