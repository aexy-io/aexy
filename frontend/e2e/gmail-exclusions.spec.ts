/**
 * Keeping mail out of a synced Gmail account.
 *
 * Live-mode only, and auto-skips otherwise — the same shape as the `ai-*`
 * specs. Mocking this one would prove nothing: the whole feature is what the
 * backend does with a real `GoogleIntegration` and real synced rows, and a
 * stubbed `/exclusions` would only ever confirm the stub.
 *
 * There is no API that creates a `GoogleIntegration` without a real Google
 * OAuth round trip, so the spec seeds directly and re-seeds before each test —
 * hiding and purging consume the fixtures, so without that only the first test
 * in a run would find anything to act on.
 *
 *   docker-compose up -d
 *   TOKEN=$(docker exec aexy-backend python scripts/generate_test_token.py --first | grep -A1 "^Token:" | tail -1)
 *   E2E_REAL_BACKEND=1 AEXY_TEST_TOKEN=$TOKEN \
 *     AEXY_TEST_WORKSPACE_ID=<workspace-uuid> \
 *     PLAYWRIGHT_BASE_URL=http://localhost:3000 \
 *     npx playwright test e2e/gmail-exclusions.spec.ts
 */

import { execFileSync } from "node:child_process";
import { test, expect, Page } from "@playwright/test";
import {
  USE_REAL_BACKEND,
  REAL_BACKEND_TOKEN,
  REAL_BACKEND_WORKSPACE_ID,
} from "./fixtures/env";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

// The seed script's fixtures. Messages are located by *sender*, not subject:
// "Quote for renewal" is a substring of "Re: Quote for renewal", and a card's
// accessible name carries the sender and snippet too, so subject matching is
// either ambiguous or over-anchored.
const RECEIVED_FROM = "bob@acme.com";
const SENT_SUBJECT = "Re: Quote for renewal";
const SURVIVOR_SUBJECT = "Lunch?";

test.describe("Gmail sync exclusions", () => {
  test.skip(
    !USE_REAL_BACKEND,
    "Needs a real backend and a seeded Google integration — see the header.",
  );

  test.beforeEach(async ({ page }) => {
    // Re-seed, because hiding and purging delete rows. Without this only the
    // first test in a run has anything to act on and the rest fail on an empty
    // inbox, which reads like a product bug rather than a spent fixture.
    execFileSync(
      "docker",
      [
        "exec",
        "aexy-backend",
        "python",
        "scripts/seed_gmail_exclusions_e2e.py",
        REAL_BACKEND_WORKSPACE_ID,
      ],
      { stdio: "pipe" },
    );

    await page.addInitScript(
      ([token, workspaceId]) => {
        localStorage.setItem("token", token);
        localStorage.setItem("current_workspace_id", workspaceId);
        localStorage.setItem("aexy_onboarding_complete", "true");
      },
      [REAL_BACKEND_TOKEN, REAL_BACKEND_WORKSPACE_ID] as const,
    );
  });

  async function openInboxMessage(page: Page, matcher: RegExp) {
    await page.goto("/crm/inbox");
    await page.getByRole("button", { name: matcher }).first().click();
    await expect(page.getByTestId("hide-email")).toBeVisible({ timeout: 20000 });
  }

  test("the settings page offers exclusions and says who can see them", async ({ page }) => {
    await page.goto("/settings/crm/integrations");
    await expect(page.getByTestId("gmail-exclusions")).toBeVisible({ timeout: 20000 });

    // The disclosure has to be on screen *before* anyone adds a rule. Somebody
    // hiding a correspondent would otherwise reasonably assume it was private,
    // and learning afterwards that their department head was told is the
    // failure this feature most needs to avoid.
    const disclosure = page.getByTestId("exclusion-disclosure");
    await expect(disclosure).toContainText("visible to workspace admins");
    await expect(disclosure).toContainText("department head");
  });

  test("adding a domain exclusion lists it and removes the mail it covers", async ({ page }) => {
    await page.goto("/settings/crm/integrations");
    await expect(page.getByTestId("gmail-exclusions")).toBeVisible({ timeout: 20000 });

    // Typed with capitals on purpose — it is stored lowercase and bare, the one
    // shape matching compares against.
    await page.getByTestId("exclusion-kind").selectOption("domain");
    await page.getByTestId("exclusion-value").fill("ACME.com");
    await page.getByTestId("exclusion-add").click();

    await expect(page.getByTestId("exclusion-list")).toContainText("acme.com", { timeout: 20000 });

    // Two, not one: the received mail *and* the reply that only has Acme as a
    // recipient. Sender-only matching would have left half the thread behind,
    // and the count is what makes that visible to the person who asked.
    await expect(page.getByText(/2 already-synced emails removed/)).toBeVisible({ timeout: 20000 });
  });

  test("an excluded domain's mail is gone from the inbox", async ({ page }) => {
    await page.goto("/settings/crm/integrations");
    await expect(page.getByTestId("gmail-exclusions")).toBeVisible({ timeout: 20000 });
    await page.getByTestId("exclusion-kind").selectOption("domain");
    await page.getByTestId("exclusion-value").fill("acme.com");
    await page.getByTestId("exclusion-add").click();
    await expect(page.getByTestId("exclusion-list")).toContainText("acme.com", { timeout: 20000 });

    await page.goto("/crm/inbox");
    // "Lunch?" is from an unrelated domain and must survive, so an empty inbox
    // cannot pass this test by accident.
    await expect(page.getByText(SURVIVOR_SUBJECT).first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(RECEIVED_FROM)).toHaveCount(0);
  });

  test("hiding a received email offers to exclude its sender in future", async ({ page }) => {
    await openInboxMessage(page, new RegExp(RECEIVED_FROM));
    await page.getByTestId("hide-email").click();

    const followUp = page.getByTestId("hide-followup");
    await expect(followUp).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("followup-address")).toContainText("bob@acme.com");
    await expect(page.getByTestId("followup-domain")).toContainText("acme.com");

    // Repeated here because this is the moment somebody is most likely to
    // assume a hide is private — and the one-off hide is, while the rule is not.
    await expect(followUp).toContainText("notifies your department head");
  });

  test("hiding your own sent mail offers the recipient, never your own address", async ({ page }) => {
    await openInboxMessage(page, new RegExp(SENT_SUBJECT));
    await page.getByTestId("hide-email").click();
    await expect(page.getByTestId("hide-followup")).toBeVisible({ timeout: 20000 });

    // The sender of sent mail is the connected account itself. Offering to
    // exclude that would exclude every thread the person takes part in, so the
    // follow-up has to name whoever they wrote to.
    await expect(page.getByTestId("followup-address")).toContainText("sue@acme.com");
    await expect(page.getByTestId("followup-address")).not.toContainText("e2e-exclusions@");
    await expect(page.getByTestId("followup-domain")).not.toContainText("example.test");
  });

  test("the follow-up turns one hide into a standing rule", async ({ page }) => {
    await openInboxMessage(page, new RegExp(RECEIVED_FROM));
    await page.getByTestId("hide-email").click();
    await expect(page.getByTestId("hide-followup")).toBeVisible({ timeout: 20000 });

    const created = page.waitForResponse(
      (res) =>
        res.url().includes("/exclusions") &&
        res.request().method() === "POST" &&
        res.status() === 201,
    );
    await page.getByTestId("followup-domain").click();
    await created;

    await page.goto("/settings/crm/integrations");
    await expect(page.getByTestId("exclusion-list")).toContainText("acme.com", { timeout: 20000 });
  });

  test("a hidden email does not come back", async ({ page }) => {
    await openInboxMessage(page, new RegExp(RECEIVED_FROM));
    await page.getByTestId("hide-email").click();
    await expect(page.getByTestId("hide-followup")).toBeVisible({ timeout: 20000 });

    // The row is deleted server-side, and the row is also the "already synced"
    // marker — so this is the assertion that would fail if the tombstone were
    // ever dropped and a re-sync brought the message back.
    await page.goto("/crm/inbox");
    await expect(page.getByText(SURVIVOR_SUBJECT).first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(RECEIVED_FROM)).toHaveCount(0);

    const remaining = await page.request.get(
      `${API_BASE}/workspaces/${REAL_BACKEND_WORKSPACE_ID}/integrations/google/gmail/emails?page=1&page_size=50`,
      { headers: { Authorization: `Bearer ${REAL_BACKEND_TOKEN}` } },
    );
    const body = (await remaining.json()) as { emails: Array<{ gmail_id: string }> };
    expect(body.emails.map((e) => e.gmail_id)).not.toContain("e2e-msg-acme-1");
  });
});
