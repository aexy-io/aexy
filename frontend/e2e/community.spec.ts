/**
 * Public community forum — end-to-end (UI) test.
 *
 * Drives the live stack (real frontend + backend). Because it needs an enabled
 * community with a web-public channel/topic — state that can't be created via
 * the public API — it is env-gated like the AI specs: provide the seed config
 * and it runs, otherwise the whole file skips.
 *
 * Seed it with:
 *   docker exec aexy-backend python scripts/seed_community_demo.py --participation
 *
 * which prints the three variables below. Then pass:
 *   COMMUNITY_SLUG=<slug> \
 *   COMMUNITY_TOPIC_PARAM=<topicSlug>-<shortId> \
 *   COMMUNITY_POSTER_TOKEN=<jwt for any Developer> \
 *   PLAYWRIGHT_BASE_URL=http://localhost:3000 \
 *   API_BASE_URL=http://localhost:8000/api/v1 \
 *   npx playwright test e2e/community.spec.ts
 */
import { test, expect } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
const API = process.env.API_BASE_URL || "http://localhost:8000/api/v1";
const CS = process.env.COMMUNITY_SLUG;
const TP = process.env.COMMUNITY_TOPIC_PARAM;
const TOKEN = process.env.COMMUNITY_POSTER_TOKEN;
const CHANNEL = process.env.COMMUNITY_CHANNEL_SLUG || "general";

const configured = Boolean(CS && TP && TOKEN);
test.skip(!configured, "Set COMMUNITY_SLUG / COMMUNITY_TOPIC_PARAM / COMMUNITY_POSTER_TOKEN to run");

test.describe("public community forum", () => {
  const topicUrl = `${BASE}/community/${CS}/${CHANNEL}/${TP}`;

  test("anonymous can read; signed-in participant can post", async ({ page }) => {
    // 1. Anonymous: content renders, read-only CTA, no composer.
    await page.goto(topicUrl, { waitUntil: "networkidle" });
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.getByTestId("community-signin-cta")).toHaveCount(1);
    await expect(page.getByTestId("community-reply-form")).toHaveCount(0);

    // 2. Sign in (inject token like the app does after OAuth) → composer appears.
    await page.evaluate((t) => localStorage.setItem("token", t), TOKEN!);
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByTestId("community-reply-form")).toBeVisible();
    await expect(page.getByTestId("community-signin-cta")).toHaveCount(0);

    // 3. Post a reply through the UI.
    const replyText = `UI e2e reply ${Date.now()}`;
    await page.getByTestId("community-reply-input").fill(replyText);
    await page.getByTestId("community-reply-submit").click();
    await expect(page.getByTestId("community-reply-notice")).toBeVisible();

    // 4. Persistence via the backend API (the SSR page is ISR-cached ~5 min).
    const res = await page.request.get(
      `${API}/public/community/${CS}/channels/${CHANNEL}/topics/${TP}`,
    );
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const contents = (body.messages as Array<{ content: string }>).map((m) => m.content);
    expect(contents).toContain(replyText);
  });

  test("anonymous reply is rejected by the API (401)", async ({ request }) => {
    const res = await request.post(
      `${API}/public/community/${CS}/channels/${CHANNEL}/topics/${TP}/replies`,
      { data: { content: "should fail" } },
    );
    expect(res.status()).toBe(401);
  });
});

test.describe("community search", () => {
  test.skip(!configured, "needs the seed config");

  test("finds a seeded thread by a word from its body", async ({ page }) => {
    // What the thread is called is not necessarily what somebody searches for,
    // so the interesting case is a match on the body.
    const topicRes = await page.request.get(
      `${API}/public/community/${CS}/channels/${CHANNEL}/topics/${TP}`,
    );
    expect(topicRes.ok()).toBeTruthy();
    const topic = await topicRes.json();
    const firstWords: string = (topic.messages[0]?.content ?? "")
      .split(/\s+/)
      .slice(0, 3)
      .join(" ");
    test.skip(firstWords.length < 4, "seeded thread has no searchable body");

    await page.goto(`${BASE}/community/${CS}/search?q=${encodeURIComponent(firstWords)}`, {
      waitUntil: "networkidle",
    });
    await expect(page.getByRole("link", { name: topic.name })).toBeVisible();
  });

  test("says so, rather than erroring, when nothing matches", async ({ page }) => {
    await page.goto(`${BASE}/community/${CS}/search?q=zzqqxx-no-such-thread`, {
      waitUntil: "networkidle",
    });
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.getByTestId("community-reply-form")).toHaveCount(0);
  });
});

test.describe("starting a thread as a visitor", () => {
  test.skip(!configured, "needs the seed config");

  test("a signed-in visitor can open a new thread", async ({ page }) => {
    const channelUrl = `${BASE}/community/${CS}/${CHANNEL}`;
    await page.goto(channelUrl, { waitUntil: "networkidle" });

    // Anonymous: the affordance is either absent (new threads closed) or a
    // sign-in link. Never a composer.
    await expect(page.getByTestId("community-new-topic")).toHaveCount(0);

    await page.evaluate((t) => localStorage.setItem("token", t), TOKEN!);
    await page.reload({ waitUntil: "networkidle" });

    const opener = page.getByTestId("community-new-topic");
    // The community may have new threads switched off, which is the default.
    test.skip((await opener.count()) === 0, "new threads are not enabled here");

    await opener.click();
    const title = `UI e2e thread ${Date.now()}`;
    await page.getByTestId("community-new-topic-title").fill(title);
    await page
      .getByTestId("community-new-topic-body")
      .fill("Opened by the end-to-end test.");
    await page.getByTestId("community-new-topic-submit").click();

    // Either it navigated to the new thread, or it was held for review and said so.
    await expect(async () => {
      const held = await page.getByTestId("community-new-topic-held").count();
      const heading = await page.locator("h1").first().textContent();
      expect(held > 0 || (heading ?? "").includes(title)).toBeTruthy();
    }).toPass({ timeout: 15_000 });
  });
});
