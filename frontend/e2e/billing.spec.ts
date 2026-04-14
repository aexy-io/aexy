import { test, expect } from "@playwright/test";
import {
  mockUser,
  mockAdminUser,
  mockWorkspace,
  allPlans,
  mockFreeSubscriptionStatus,
  mockPerSeatSubscriptionStatus,
  mockFlatUsageSubscriptionStatus,
  mockPostpaidSubscriptionStatus,
  mockPlanOverride,
  setupBillingMocks,
} from "./fixtures/billing-mock-data";

// ──────────────────────────────────────────────
// Suite 1: Plans Page — Plan Cards
// ──────────────────────────────────────────────

test.describe("Plans Page — Plan Cards", () => {
  test.beforeEach(async ({ page }) => {
    await setupBillingMocks(page);
    await page.goto("/settings/plans");
    await page.waitForSelector("h1:has-text('Subscription Plans')", { timeout: 15000 });
  });

  test("renders page heading and billing toggle", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Subscription Plans" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Monthly" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Annual" })).toBeVisible();
  });

  test("renders all plan cards with names", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Free" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pro" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Flat + Usage" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Postpaid" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Enterprise" })).toBeVisible();
  });

  test("Free plan card shows correct features", async ({ page }) => {
    await expect(page.getByText("All modules included")).toBeVisible();
    await expect(page.getByText("Limited AI (50 req/day)")).toBeVisible();
  });

  test("Per-seat plan shows per-user pricing", async ({ page }) => {
    await expect(page.getByText("/user/mo").first()).toBeVisible();
  });

  test("Flat+Usage plan shows base fee + usage pricing", async ({ page }) => {
    await expect(page.getByText("/mo + usage").first()).toBeVisible();
  });

  test("Postpaid plan shows seat + usage pricing", async ({ page }) => {
    await expect(page.getByText("/seat + usage")).toBeVisible();
  });

  test("Enterprise plan shows Contact Sales CTA", async ({ page }) => {
    await expect(page.getByText("Contact Sales")).toBeVisible();
  });

  test("current plan has badge and disabled button", async ({ page }) => {
    await expect(page.getByText("Current Plan").first()).toBeVisible();
    const currentBtn = page.getByRole("button", { name: /Current Plan/i });
    await expect(currentBtn).toBeDisabled();
  });
});

// ──────────────────────────────────────────────
// Suite 2: Plans Page — Interactions
// ──────────────────────────────────────────────

test.describe("Plans Page — Interactions", () => {
  test("billing toggle switches between monthly and annual", async ({ page }) => {
    await setupBillingMocks(page);
    await page.goto("/settings/plans");
    await page.waitForSelector("h1:has-text('Subscription Plans')", { timeout: 15000 });

    await page.getByRole("button", { name: "Annual" }).click();
    await expect(page.getByText(/Save \d+%/)).toBeVisible();
  });

  test("checkout success shows success banner", async ({ page }) => {
    await setupBillingMocks(page);
    await page.goto("/settings/plans?checkout=success");
    await page.waitForSelector("h1:has-text('Subscription Plans')", { timeout: 15000 });
    await expect(page.getByText(/activated/i)).toBeVisible();
  });

  test("checkout cancelled shows cancelled banner", async ({ page }) => {
    await setupBillingMocks(page);
    await page.goto("/settings/plans?checkout=cancelled");
    await page.waitForSelector("h1:has-text('Subscription Plans')", { timeout: 15000 });
    await expect(page.getByText(/cancelled/i)).toBeVisible();
  });

  test("non-owner sees permission message", async ({ page }) => {
    const nonOwnerWorkspace = { ...mockWorkspace, owner_id: "someone-else" };
    await setupBillingMocks(page, { workspace: nonOwnerWorkspace });
    await page.goto("/settings/plans");
    await page.waitForSelector("h1:has-text('Subscription Plans')", { timeout: 15000 });
    await expect(page.getByText("Only the workspace owner can change plans").first()).toBeVisible();
  });
});

// ──────────────────────────────────────────────
// Suite 3: Billing Page — Free Tier
// ──────────────────────────────────────────────

test.describe("Billing Page — Free Tier", () => {
  test.beforeEach(async ({ page }) => {
    await setupBillingMocks(page, { subscriptionStatus: mockFreeSubscriptionStatus });
    await page.goto("/settings/billing");
    await page.waitForSelector("text='See Plans'", { timeout: 15000 });
  });

  test("shows free plan upgrade CTA", async ({ page }) => {
    await expect(page.getByRole("link", { name: /See Plans/i })).toBeVisible();
  });

  test("shows all modules message", async ({ page }) => {
    await expect(page.getByText(/all modules/i).first()).toBeVisible();
  });

  test("does not show seat management section", async ({ page }) => {
    await expect(page.getByText("Seat Management")).not.toBeVisible();
  });

  test("does not show postpaid section", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Postpaid Billing" })).not.toBeVisible();
  });
});

// ──────────────────────────────────────────────
// Suite 4: Billing Page — Per-Seat
// ──────────────────────────────────────────────

test.describe("Billing Page — Per-Seat", () => {
  test.beforeEach(async ({ page }) => {
    await setupBillingMocks(page, { subscriptionStatus: mockPerSeatSubscriptionStatus });
    await page.goto("/settings/billing");
    await page.waitForSelector("text='Seat Management'", { timeout: 15000 });
  });

  test("shows per-seat price format", async ({ page }) => {
    await expect(page.getByText("/user/mo").first()).toBeVisible();
  });

  test("shows per seat billing label", async ({ page }) => {
    await expect(page.getByText(/per seat/i).first()).toBeVisible();
  });

  test("shows seat management section with metrics", async ({ page }) => {
    await expect(page.getByText("Seat Management")).toBeVisible();
    await expect(page.getByText("Total Seats")).toBeVisible();
    await expect(page.getByText("Base Seats")).toBeVisible();
    await expect(page.getByText("Additional Seats")).toBeVisible();
    await expect(page.getByText("Per Seat Price")).toBeVisible();
  });

  test("shows active subscription status", async ({ page }) => {
    await expect(page.getByText(/active/i).first()).toBeVisible();
  });

  test("shows manage billing button", async ({ page }) => {
    await expect(page.getByText("Manage Billing").first()).toBeVisible();
  });
});

// ──────────────────────────────────────────────
// Suite 5: Billing Page — Flat + Usage
// ──────────────────────────────────────────────

test.describe("Billing Page — Flat + Usage", () => {
  test.beforeEach(async ({ page }) => {
    await setupBillingMocks(page, { subscriptionStatus: mockFlatUsageSubscriptionStatus });
    await page.goto("/settings/billing");
    await page.waitForSelector("text='Billing Breakdown'", { timeout: 15000 });
  });

  test("shows flat plus usage price format", async ({ page }) => {
    await expect(page.getByText("/mo + usage").first()).toBeVisible();
  });

  test("shows flat plus usage billing label", async ({ page }) => {
    await expect(page.getByText(/flat plus usage/i).first()).toBeVisible();
  });

  test("shows billing breakdown section", async ({ page }) => {
    await expect(page.getByText("Billing Breakdown")).toBeVisible();
    await expect(page.getByText("Base Fee").first()).toBeVisible();
    await expect(page.getByText("AI Usage")).toBeVisible();
  });

  test("does not show seat management section", async ({ page }) => {
    await expect(page.getByText("Seat Management")).not.toBeVisible();
  });
});

// ──────────────────────────────────────────────
// Suite 6: Billing Page — Postpaid
// ──────────────────────────────────────────────

test.describe("Billing Page — Postpaid", () => {
  test.beforeEach(async ({ page }) => {
    await setupBillingMocks(page, { subscriptionStatus: mockPostpaidSubscriptionStatus });
    await page.goto("/settings/billing");
    await page.waitForSelector("text='Postpaid Billing'", { timeout: 15000 });
  });

  test("shows postpaid billing section", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Postpaid Billing" })).toBeVisible();
  });

  test("shows accrued and estimated amounts", async ({ page }) => {
    await expect(page.getByText("Accrued This Period")).toBeVisible();
    await expect(page.getByText("Estimated Total")).toBeVisible();
    await expect(page.getByText("Last Settled")).toBeVisible();
  });

  test("shows postpaid billing note", async ({ page }) => {
    await expect(page.getByText(/invoiced at the end/i)).toBeVisible();
  });

  test("shows accrued dollar amount", async ({ page }) => {
    await expect(page.getByText("$45")).toBeVisible();
  });
});

// ──────────────────────────────────────────────
// Suite 7: Plan Overrides Page — Admin
// ──────────────────────────────────────────────

test.describe("Plan Overrides Page — Admin", () => {
  test("shows page heading for admin with overrides", async ({ page }) => {
    await setupBillingMocks(page, {
      user: mockAdminUser,
      overrides: [mockPlanOverride],
    });
    await page.goto("/settings/plan-overrides");
    await page.waitForSelector("h1:has-text('Plan Overrides')", { timeout: 15000 });

    await expect(page.getByRole("heading", { name: "Plan Overrides" }).first()).toBeVisible();
    await expect(page.getByText("Configure custom pricing")).toBeVisible();
  });

  test("shows permission error for non-admin users", async ({ page }) => {
    await setupBillingMocks(page);
    await page.route("http://localhost:8000/api/v1/platform-admin/plan-overrides", (route) => {
      route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Platform admin access required" }),
      });
    });
    await page.goto("/settings/plan-overrides");
    await page.waitForSelector("h1:has-text('Plan Overrides')", { timeout: 15000 });
    await expect(page.getByText(/permission/i).first()).toBeVisible();
  });

  test("shows create form with workspace ID input", async ({ page }) => {
    await setupBillingMocks(page, { user: mockAdminUser, overrides: [] });
    await page.goto("/settings/plan-overrides");
    await page.waitForSelector("h1:has-text('Plan Overrides')", { timeout: 15000 });

    await expect(page.getByPlaceholder("Enter workspace UUID")).toBeVisible();
  });

  test("save button disabled without workspace ID", async ({ page }) => {
    await setupBillingMocks(page, { user: mockAdminUser, overrides: [] });
    await page.goto("/settings/plan-overrides");
    await page.waitForSelector("h1:has-text('Plan Overrides')", { timeout: 15000 });

    const saveBtn = page.getByRole("button", { name: "Save Override" });
    await expect(saveBtn).toBeDisabled();
  });

  test("shows existing overrides with details", async ({ page }) => {
    await setupBillingMocks(page, {
      user: mockAdminUser,
      overrides: [mockPlanOverride],
    });
    await page.goto("/settings/plan-overrides");
    await page.waitForSelector("text='Active Overrides'", { timeout: 15000 });

    await expect(page.getByText("ws-overr")).toBeVisible();
    await expect(page.getByText("flat_plus_usage")).toBeVisible();
    await expect(page.getByText("20% off")).toBeVisible();
  });
});

// ──────────────────────────────────────────────
// Suite 8: Feature Flags — Free tier has all modules
// ──────────────────────────────────────────────

test.describe("Feature Flags — Free tier modules", () => {
  test("free tier billing page shows all features enabled", async ({ page }) => {
    await setupBillingMocks(page, { subscriptionStatus: mockFreeSubscriptionStatus });
    await page.goto("/settings/billing");
    await page.waitForSelector("text='See Plans'", { timeout: 15000 });

    await expect(page.getByText("Real-time Sync")).toBeVisible();
    await expect(page.getByText("Advanced Analytics")).toBeVisible();
    await expect(page.getByText("Team Features")).toBeVisible();
    await expect(page.getByText("Data Exports")).toBeVisible();
    await expect(page.getByText("Webhooks").first()).toBeVisible();
  });
});

// ──────────────────────────────────────────────
// Suite 9: Billing page — upgrade vs paid
// ──────────────────────────────────────────────

test.describe("Billing Page — Upgrade messaging", () => {
  test("free tier shows upgrade CTA", async ({ page }) => {
    await setupBillingMocks(page, { subscriptionStatus: mockFreeSubscriptionStatus });
    await page.goto("/settings/billing");
    await page.waitForSelector("text='See Plans'", { timeout: 15000 });
    await expect(page.getByRole("link", { name: /See Plans/i })).toBeVisible();
  });

  test("paid tier does not show free upgrade message", async ({ page }) => {
    await setupBillingMocks(page, { subscriptionStatus: mockPerSeatSubscriptionStatus });
    await page.goto("/settings/billing");
    await page.waitForSelector("text='Seat Management'", { timeout: 15000 });
    await expect(page.getByText("all modules free")).not.toBeVisible();
  });
});
