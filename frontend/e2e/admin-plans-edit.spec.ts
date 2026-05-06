import { expect, test } from "@playwright/test";

import {
  API_BASE,
  mockEffectiveAccess,
  mockUser,
  mockWorkspace,
} from "./fixtures/task-test-helpers";

const PLAN = {
  id: "plan-pro",
  name: "Pro",
  tier: "pro",
  description: "Per-seat plan for professional developers and teams",
  is_active: true,

  max_repos: 20,
  max_commits_per_repo: 5000,
  max_prs_per_repo: 1000,
  sync_history_days: 365,
  max_storage_gb: 100,

  llm_requests_per_day: 500,
  llm_requests_per_minute: 20,
  llm_tokens_per_minute: 100000,
  llm_provider_access: ["claude", "gemini", "ollama"],
  free_llm_tokens_per_month: 500000,
  llm_input_cost_per_1k_cents: 25,
  llm_output_cost_per_1k_cents: 50,
  enable_overage_billing: true,

  enable_real_time_sync: true,
  enable_advanced_analytics: true,
  enable_exports: true,
  enable_webhooks: true,
  enable_team_features: true,

  billing_model: "per_seat",
  base_fee_monthly_cents: 0,
  per_seat_price_monthly_cents: 2900,
  min_seats: 1,
  included_seats: 1,
  requires_payment_method: true,
  payment_timing: "prepaid",
  price_monthly_cents: 2900,
  price_yearly_cents: 29000,

  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-04-25T00:00:00Z",
};

test.describe("Admin /admin/plans editor", () => {
  test("super-admin can edit max_storage_gb and PATCH is sent", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem("token", "fake-test-token");
      localStorage.setItem("current_workspace_id", "ws-1");
    });

    // Auth + workspace
    await page.route(`${API_BASE}/**`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) }),
    );
    await page.route(`${API_BASE}/developers/me`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockUser) }),
    );
    await page.route(`${API_BASE}/workspaces`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([mockWorkspace]) }),
    );
    await page.route(`${API_BASE}/workspaces/ws-1`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockWorkspace) }),
    );
    await page.route(
      `${API_BASE}/workspaces/ws-1/app-access/members/dev-1/effective`,
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockEffectiveAccess),
        }),
    );

    // Admin gating — useAdmin hits /platform-admin/check.
    await page.route(`${API_BASE}/platform-admin/check`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ is_admin: true, platform_org_id: "ws-1" }),
      }),
    );

    // Plans list + update
    let lastPatch: any = null;
    await page.route(`${API_BASE}/platform-admin/plans`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ plans: [PLAN] }),
      }),
    );
    await page.route(`${API_BASE}/platform-admin/plans/plan-pro`, async (route) => {
      if (route.request().method() === "PATCH") {
        lastPatch = route.request().postDataJSON();
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ...PLAN, ...lastPatch }),
        });
      } else {
        await route.fallback();
      }
    });

    await page.goto("/admin/plans");

    const planRow = page.getByTestId("admin-plan-row").first();
    await expect(planRow).toBeVisible({ timeout: 30000 });
    await planRow.click();

    const storageField = page.getByTestId("admin-plan-max-storage-gb");
    await storageField.fill("250");
    await page.getByTestId("admin-plan-save").click();

    await expect.poll(() => lastPatch).toBeTruthy();
    expect(lastPatch).toMatchObject({ max_storage_gb: 250 });
  });
});
