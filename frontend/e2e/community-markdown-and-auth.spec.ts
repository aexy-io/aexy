/**
 * Markdown posts and the community header's auth control — end-to-end.
 *
 * Drives the live stack (real frontend + backend), and needs the same seeded
 * community as `community.spec.ts`, so it is env-gated the same way and skips
 * as a whole when the seed config is absent.
 *
 *   docker exec aexy-backend python scripts/seed_community_demo.py --participation
 *
 * then:
 *   COMMUNITY_SLUG=<slug> \
 *   COMMUNITY_CHANNEL_SLUG=<channel> \
 *   COMMUNITY_TOPIC_PARAM=<topicSlug>-<shortId> \
 *   COMMUNITY_POSTER_TOKEN=<jwt for a workspace member> \
 *   COMMUNITY_ONLY_TOKEN=<jwt for an account_type=community developer> \
 *   PLAYWRIGHT_BASE_URL=http://localhost:3000 \
 *   API_BASE_URL=http://localhost:8000/api/v1 \
 *   npx playwright test e2e/community-markdown-and-auth.spec.ts
 *
 * COMMUNITY_ONLY_TOKEN is optional; only the sign-out test needs it.
 */
import { test, expect, type Page } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
const API = process.env.API_BASE_URL || "http://localhost:8000/api/v1";
const CS = process.env.COMMUNITY_SLUG;
const TP = process.env.COMMUNITY_TOPIC_PARAM;
const CHANNEL = process.env.COMMUNITY_CHANNEL_SLUG || "general";
const POSTER = process.env.COMMUNITY_POSTER_TOKEN;
const COMMUNITY_ONLY = process.env.COMMUNITY_ONLY_TOKEN;

const configured = Boolean(CS && TP && POSTER);
test.skip(
  !configured,
  "Set COMMUNITY_SLUG / COMMUNITY_TOPIC_PARAM / COMMUNITY_POSTER_TOKEN to run",
);

const topicUrl = `${BASE}/community/${CS}/${CHANNEL}/${TP}`;
const channelUrl = `${BASE}/community/${CS}/${CHANNEL}`;
const communityUrl = `${BASE}/community/${CS}`;

/** The post body the markdown tests assert against. */
function markdownBody(stamp: string) {
  return [
    `## Added ${stamp}`,
    "",
    "- Ships `run_migrations.py` and handles Optional[str]",
    "- See [the docs](https://example.com/docs) and [our guide](/docs/releases)",
    "",
    "| Setting | Value |",
    "| --- | --- |",
    "| visibility | web_public |",
    "",
    "```",
    "docker compose up -d",
    "```",
    "",
    "![a screenshot](https://tracker.example/pixel.png)",
    "",
    '<img src=x onerror="alert(1)"> <b>raw html</b>',
  ].join("\n");
}

/** Sign in the way the app does after OAuth, then reload. */
async function signIn(page: Page, token: string) {
  await page.evaluate((t) => localStorage.setItem("token", t), token);
  await page.reload({ waitUntil: "networkidle" });
}

test.describe("a markdown post on a public thread", () => {
  test("renders as structure, not as source", async ({ page }) => {
    const stamp = String(Date.now());
    await page.goto(topicUrl, { waitUntil: "networkidle" });
    await signIn(page, POSTER!);

    const form = page.getByTestId("community-reply-form");
    test.skip((await form.count()) === 0, "this community does not accept replies");

    await page.getByTestId("community-reply-input").fill(markdownBody(stamp));
    await page.getByTestId("community-reply-submit").click();
    await expect(page.getByTestId("community-reply-notice")).toBeVisible();

    // The post is rendered by the same component whether it arrives optimistically
    // or from the server, so assert on whichever the page is showing. A reply held
    // for moderation never appears at all, which is a valid configuration.
    const post = page.locator("li", { hasText: `Added ${stamp}` }).last();
    test.skip((await post.count()) === 0, "replies here are held for review");

    // Headings become h4 — below the page's own h1 (topic title) and h2s.
    await expect(post.locator("h4", { hasText: `Added ${stamp}` })).toBeVisible();
    await expect(post.locator("li")).toHaveCount(2);
    await expect(post.locator("table th")).toHaveCount(2);
    await expect(post.locator("pre")).toContainText("docker compose up -d");

    // None of the source syntax survives as literal text.
    const text = (await post.innerText()).replace(`Added ${stamp}`, "");
    expect(text).not.toContain("## ");
    expect(text).not.toContain("| --- |");
    expect(text).not.toContain("```");
  });

  test("does not execute an author's HTML, and does not load their images", async ({
    page,
  }) => {
    const stamp = String(Date.now());
    const alerts: string[] = [];
    page.on("dialog", (d) => {
      alerts.push(d.message());
      void d.dismiss();
    });
    // Anything the post tried to fetch from the outside would show up here.
    const offsiteRequests: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("tracker.example")) offsiteRequests.push(r.url());
    });

    await page.goto(topicUrl, { waitUntil: "networkidle" });
    await signIn(page, POSTER!);
    const form = page.getByTestId("community-reply-form");
    test.skip((await form.count()) === 0, "this community does not accept replies");

    await page.getByTestId("community-reply-input").fill(markdownBody(stamp));
    await page.getByTestId("community-reply-submit").click();
    await expect(page.getByTestId("community-reply-notice")).toBeVisible();

    const post = page.locator("li", { hasText: `Added ${stamp}` }).last();
    test.skip((await post.count()) === 0, "replies here are held for review");

    expect(alerts).toEqual([]);
    expect(offsiteRequests).toEqual([]);
    await expect(post.locator("img")).toHaveCount(0);
    // The alt text stands in for the image that was not loaded.
    await expect(post).toContainText("a screenshot");
    // The raw tags are shown as text, never parsed into elements.
    await expect(post.locator("b")).toHaveCount(0);
    await expect(post).toContainText("<b>raw html</b>");

    // Outbound links carry ugc/nofollow; a same-site path stays an ordinary link.
    const external = post.locator('a[href="https://example.com/docs"]');
    await expect(external).toHaveAttribute("rel", "nofollow ugc noopener noreferrer");
    await expect(external).toHaveAttribute("target", "_blank");
    const internal = post.locator('a[href="/docs/releases"]');
    await expect(internal).toHaveCount(1);
    expect(await internal.getAttribute("rel")).toBeNull();
  });

  test("is quoted as plain prose where there is no renderer", async ({ page }) => {
    await page.goto(topicUrl, { waitUntil: "networkidle" });

    const description = await page
      .locator('meta[name="description"]')
      .getAttribute("content");
    expect(description).toBeTruthy();
    // Markdown syntax in a search-result snippet is the defect this guards.
    expect(description).not.toContain("##");
    expect(description).not.toMatch(/^\s*[-*]\s/);

    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    const thread = blocks
      .map((b) => JSON.parse(b))
      .find((b) => b["@type"] === "QAPage" || b["@type"] === "DiscussionForumPosting");
    expect(thread).toBeTruthy();
    const bodyText: string = thread["@type"] === "QAPage"
      ? thread.mainEntity?.text ?? ""
      : thread.text ?? "";
    if (bodyText) expect(bodyText).not.toContain("## ");
  });

  test("an RSS description carries no markdown syntax", async ({ request }) => {
    const res = await request.get(`${BASE}/community/${CS}/rss.xml`);
    expect(res.ok()).toBeTruthy();
    const xml = await res.text();
    const descriptions = [...xml.matchAll(/<description>([\s\S]*?)<\/description>/g)].map(
      (m) => m[1],
    );
    expect(descriptions.length).toBeGreaterThan(0);
    for (const d of descriptions) {
      expect(d).not.toContain("##");
      expect(d).not.toContain("```");
    }
  });
});

test.describe("the community header's sign-in link", () => {
  test("follows the reader as they move through the forum", async ({ page }) => {
    // The regression: the button lives in the community layout, which does not
    // remount between these pages, so a mount-only read of the URL pinned `next`
    // to whatever the reader first landed on. Signing in from a thread then
    // returned them to the front page.
    const nextFor = async () => {
      const href = await page.getByTestId("community-auth-signin").getAttribute("href");
      return new URL(href!, BASE).searchParams.get("next");
    };

    await page.goto(communityUrl, { waitUntil: "networkidle" });
    expect(await nextFor()).toBe(`/community/${CS}`);

    // Client-side navigation, not a fresh load — that is the case that broke.
    await page.getByRole("link", { name: new RegExp(CHANNEL, "i") }).first().click();
    await page.waitForURL(`**/community/${CS}/${CHANNEL}`);
    expect(await nextFor()).toBe(`/community/${CS}/${CHANNEL}`);

    await page.goto(channelUrl, { waitUntil: "networkidle" });
    await page.getByRole("link", { name: /.+/ }).filter({ hasText: /\S/ });
    await page.locator(`a[href*="/community/${CS}/${CHANNEL}/"]`).first().click();
    await page.waitForURL(`**/community/${CS}/${CHANNEL}/**`);
    const deep = new URL(page.url()).pathname;
    expect(await nextFor()).toBe(deep);

    // And back again.
    await page.goBack();
    await page.waitForURL(`**/community/${CS}/${CHANNEL}`);
    expect(await nextFor()).toBe(`/community/${CS}/${CHANNEL}`);
  });

  test("carries the community context that keeps a new account forum-only", async ({
    page,
  }) => {
    await page.goto(topicUrl, { waitUntil: "networkidle" });
    const href = await page.getByTestId("community-auth-signin").getAttribute("href");
    const params = new URL(href!, BASE).searchParams;
    expect(params.get("context")).toBe("community");
    expect(params.get("community")).toBe(CS);
  });

  test("stashes the thread so the OAuth callback can return to it", async ({ page }) => {
    await page.goto(topicUrl, { waitUntil: "networkidle" });
    await page.getByTestId("community-auth-signin").click();
    await page.waitForURL("**/login**");

    // What /auth/callback reads once the provider returns.
    await expect
      .poll(() => page.evaluate(() => sessionStorage.getItem("postLoginRedirect")))
      .toBe(`/community/${CS}/${CHANNEL}/${TP}`);

    // The provider links carry the markers that make the new account community-only.
    const provider = page.locator('a[href*="/auth/"][href*="context=community"]').first();
    await expect(provider).toHaveCount(1);
    expect(await provider.getAttribute("href")).toContain(`community=${CS}`);
  });
});

test.describe("the community header once someone is signed in", () => {
  test("offers the app to a workspace member", async ({ page }) => {
    await page.goto(topicUrl, { waitUntil: "networkidle" });
    await signIn(page, POSTER!);

    await expect(page.getByTestId("community-auth-openapp")).toBeVisible();
    await expect(page.getByTestId("community-auth-signout")).toHaveCount(0);
  });

  test("offers a community-only account a way out, not a door it cannot open", async ({
    page,
  }) => {
    test.skip(!COMMUNITY_ONLY, "Set COMMUNITY_ONLY_TOKEN to run");

    // A community account is 403'd across the internal API by the isolation
    // middleware, so "Open app" aimed the header's only control at the one place
    // it cannot reach — and left it no way to sign out.
    const denied = await page.request.get(`${API}/workspaces`, {
      headers: { Authorization: `Bearer ${COMMUNITY_ONLY}` },
    });
    expect(denied.status()).toBe(403);

    await page.goto(topicUrl, { waitUntil: "networkidle" });
    await signIn(page, COMMUNITY_ONLY!);

    const signOut = page.getByTestId("community-auth-signout");
    await expect(signOut).toBeVisible();
    await expect(page.getByTestId("community-auth-openapp")).toHaveCount(0);

    await signOut.click();
    // Signed out in place, still on the thread, offered the way back in.
    await expect(page.getByTestId("community-auth-signin")).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(`/community/${CS}/${CHANNEL}/${TP}`);
    expect(await page.evaluate(() => localStorage.getItem("token"))).toBeNull();
  });
});
