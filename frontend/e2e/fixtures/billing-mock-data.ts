/**
 * Mock data fixtures for billing E2E tests
 */

export const mockUser = {
  id: "test-user-123",
  name: "Test Developer",
  email: "test@example.com",
  avatar_url: "",
  github_connection: { github_username: "testdev", github_id: 12345 },
  onboarding_completed: true,
  plan_id: "plan-free",
  llm_requests_today: 5,
  llm_tokens_used_this_month: 12000,
  repos_synced_count: 3,
};

export const mockAdminUser = {
  ...mockUser,
  id: "admin-user-123",
  email: "admin@aexy.io",
};

export const mockWorkspace = {
  id: "ws-1",
  name: "Test Workspace",
  slug: "test-ws",
  type: "internal",
  owner_id: "test-user-123",
  plan_id: "plan-free",
  member_count: 5,
  team_count: 2,
  is_active: true,
};

export const mockWorkspaceMembers = [
  {
    id: "wm-1",
    workspace_id: "ws-1",
    developer_id: "test-user-123",
    role: "owner",
    status: "active",
    is_billable: true,
  },
  {
    id: "wm-2",
    workspace_id: "ws-1",
    developer_id: "user-456",
    role: "member",
    status: "active",
    is_billable: true,
  },
];

// ──── Plans ────

export const mockFreePlan = {
  id: "plan-free",
  name: "Free",
  tier: "free",
  billing_model: "free",
  description: "All modules free with fair limits — only AI is limited",
  price_monthly_cents: 0,
  max_repos: 10,
  max_commits_per_repo: 1000,
  max_prs_per_repo: 200,
  sync_history_days: 90,
  llm_requests_per_day: 50,
  llm_provider_access: ["ollama"],
  free_llm_tokens_per_month: 50000,
  llm_input_cost_per_1k_cents: 0,
  llm_output_cost_per_1k_cents: 0,
  enable_overage_billing: false,
  enable_real_time_sync: true,
  enable_advanced_analytics: true,
  enable_exports: true,
  enable_webhooks: true,
  enable_team_features: true,
  base_fee_monthly_cents: 0,
  per_seat_price_monthly_cents: 0,
  min_seats: 1,
  included_seats: 10,
  requires_payment_method: false,
  payment_timing: "prepaid",
};

export const mockPerSeatPlan = {
  id: "plan-pro",
  name: "Pro",
  tier: "pro",
  billing_model: "per_seat",
  description: "Per-seat plan for professional developers and teams",
  price_monthly_cents: 2900,
  max_repos: 20,
  max_commits_per_repo: 5000,
  max_prs_per_repo: 1000,
  sync_history_days: 365,
  llm_requests_per_day: 500,
  llm_provider_access: ["claude", "gemini", "ollama", "openrouter"],
  free_llm_tokens_per_month: 500000,
  llm_input_cost_per_1k_cents: 25,
  llm_output_cost_per_1k_cents: 50,
  enable_overage_billing: true,
  enable_real_time_sync: true,
  enable_advanced_analytics: true,
  enable_exports: true,
  enable_webhooks: true,
  enable_team_features: true,
  base_fee_monthly_cents: 0,
  per_seat_price_monthly_cents: 2900,
  min_seats: 1,
  included_seats: 1,
  requires_payment_method: true,
  payment_timing: "prepaid",
};

export const mockFlatUsagePlan = {
  id: "plan-flat",
  name: "Flat + Usage",
  tier: "flat_plus_usage",
  billing_model: "flat_plus_usage",
  description: "Flat monthly fee plus pay-per-use AI",
  price_monthly_cents: 4900,
  max_repos: -1,
  max_commits_per_repo: -1,
  max_prs_per_repo: -1,
  sync_history_days: -1,
  llm_requests_per_day: -1,
  llm_provider_access: ["claude", "gemini", "ollama", "openrouter"],
  free_llm_tokens_per_month: 0,
  llm_input_cost_per_1k_cents: 20,
  llm_output_cost_per_1k_cents: 40,
  enable_overage_billing: true,
  enable_real_time_sync: true,
  enable_advanced_analytics: true,
  enable_exports: true,
  enable_webhooks: true,
  enable_team_features: true,
  base_fee_monthly_cents: 4900,
  per_seat_price_monthly_cents: 0,
  min_seats: 1,
  included_seats: -1,
  requires_payment_method: true,
  payment_timing: "prepaid",
};

export const mockPostpaidPlan = {
  id: "plan-postpaid",
  name: "Postpaid",
  tier: "postpaid",
  billing_model: "postpaid",
  description: "Pay after use — billed at end of billing period",
  price_monthly_cents: 0,
  max_repos: -1,
  max_commits_per_repo: -1,
  max_prs_per_repo: -1,
  sync_history_days: -1,
  llm_requests_per_day: -1,
  llm_provider_access: ["claude", "gemini", "ollama", "openrouter"],
  free_llm_tokens_per_month: 0,
  llm_input_cost_per_1k_cents: 20,
  llm_output_cost_per_1k_cents: 40,
  enable_overage_billing: true,
  enable_real_time_sync: true,
  enable_advanced_analytics: true,
  enable_exports: true,
  enable_webhooks: true,
  enable_team_features: true,
  base_fee_monthly_cents: 0,
  per_seat_price_monthly_cents: 1900,
  min_seats: 1,
  included_seats: 0,
  requires_payment_method: true,
  payment_timing: "postpaid",
};

export const mockEnterprisePlan = {
  id: "plan-enterprise",
  name: "Enterprise",
  tier: "enterprise",
  billing_model: "per_seat",
  description: "Per-seat plan for large teams and organizations",
  price_monthly_cents: 9900,
  max_repos: -1,
  max_commits_per_repo: -1,
  max_prs_per_repo: -1,
  sync_history_days: -1,
  llm_requests_per_day: -1,
  llm_provider_access: ["claude", "gemini", "ollama", "openrouter"],
  free_llm_tokens_per_month: 2000000,
  llm_input_cost_per_1k_cents: 15,
  llm_output_cost_per_1k_cents: 30,
  enable_overage_billing: true,
  enable_real_time_sync: true,
  enable_advanced_analytics: true,
  enable_exports: true,
  enable_webhooks: true,
  enable_team_features: true,
  base_fee_monthly_cents: 0,
  per_seat_price_monthly_cents: 9900,
  min_seats: 5,
  included_seats: 5,
  requires_payment_method: true,
  payment_timing: "prepaid",
};

export const allPlans = [
  mockFreePlan,
  mockPerSeatPlan,
  mockFlatUsagePlan,
  mockPostpaidPlan,
  mockEnterprisePlan,
];

// ──── Subscription Statuses ────

export const mockFreeSubscriptionStatus = {
  has_subscription: false,
  billing_model: "free",
  subscription: null,
  plan: mockFreePlan,
  customer: null,
  seat_summary: null,
  postpaid_summary: null,
};

export const mockPerSeatSubscriptionStatus = {
  has_subscription: true,
  billing_model: "per_seat",
  subscription: {
    id: "sub-123",
    status: "active",
    plan_id: "plan-pro",
    current_period_start: "2026-03-01T00:00:00Z",
    current_period_end: "2026-04-01T00:00:00Z",
  },
  plan: mockPerSeatPlan,
  customer: {
    id: "cust-123",
    stripe_customer_id: "cus_test123",
    email: "test@example.com",
  },
  seat_summary: {
    total_seats: 5,
    base_seats: 1,
    additional_seats: 4,
    per_seat_price_cents: 2900,
    included_seats: 1,
  },
  postpaid_summary: null,
};

export const mockFlatUsageSubscriptionStatus = {
  has_subscription: true,
  billing_model: "flat_plus_usage",
  subscription: {
    id: "sub-456",
    status: "active",
    plan_id: "plan-flat",
    current_period_start: "2026-03-01T00:00:00Z",
    current_period_end: "2026-04-01T00:00:00Z",
  },
  plan: mockFlatUsagePlan,
  customer: {
    id: "cust-456",
    stripe_customer_id: "cus_test456",
    email: "test@example.com",
  },
  seat_summary: null,
  postpaid_summary: null,
};

export const mockPostpaidSubscriptionStatus = {
  has_subscription: true,
  billing_model: "postpaid",
  subscription: {
    id: "sub-789",
    status: "active",
    plan_id: "plan-postpaid",
    current_period_start: "2026-03-01T00:00:00Z",
    current_period_end: "2026-04-01T00:00:00Z",
  },
  plan: mockPostpaidPlan,
  customer: {
    id: "cust-789",
    stripe_customer_id: "cus_test789",
    email: "test@example.com",
  },
  seat_summary: null,
  postpaid_summary: {
    accrued_cents: 4500,
    estimated_total_cents: 8200,
    last_settled_at: "2026-03-01T00:00:00Z",
    billing_period_start: "2026-03-01T00:00:00Z",
    billing_period_end: "2026-04-01T00:00:00Z",
  },
};

// ──── Usage & Billing Data ────

export const mockUsageSummary = {
  total_input_tokens: 25000,
  total_output_tokens: 8000,
  total_tokens: 33000,
  total_base_cost_cents: 120,
  total_cost_cents: 156,
  margin_percent: 30,
  by_provider: {
    ollama: { input_tokens: 25000, output_tokens: 8000, cost_cents: 0 },
  },
  period_start: "2026-03-01T00:00:00Z",
  period_end: "2026-04-01T00:00:00Z",
};

export const mockUsageEstimate = {
  current_month_cost_cents: 156,
  projected_month_cost_cents: 450,
  daily_average_cost_cents: 15,
  days_elapsed: 10,
  days_remaining: 21,
  tokens_used_this_month: 33000,
  free_tokens_remaining: 17000,
  is_on_free_tier: true,
};

export const mockLimitsUsage = {
  plan: { id: "plan-free", name: "Free", tier: "free", billing_model: "free" },
  repos: { used: 3, limit: 10, unlimited: false },
  llm: {
    used_today: 5,
    limit_per_day: 50,
    unlimited: false,
    providers: ["ollama"],
  },
  tokens: {
    free_tokens_per_month: 50000,
    tokens_used_this_month: 12000,
    input_tokens_this_month: 8000,
    output_tokens_this_month: 4000,
    tokens_remaining_free: 38000,
    is_in_overage: false,
    overage_tokens: 0,
    overage_cost_cents: 0,
    input_cost_per_1k_cents: 0,
    output_cost_per_1k_cents: 0,
    enable_overage_billing: false,
    reset_at: null,
  },
  features: {
    real_time_sync: true,
    webhooks: true,
    advanced_analytics: true,
    exports: true,
    team_features: true,
  },
};

export const mockInvoices = [
  {
    id: "inv-1",
    stripe_invoice_id: "in_test1",
    invoice_number: "INV-001",
    status: "paid",
    subtotal_cents: 2900,
    tax_cents: 0,
    total_cents: 2900,
    amount_paid_cents: 2900,
    amount_due_cents: 0,
    currency: "usd",
    invoice_pdf: "https://example.com/inv1.pdf",
    hosted_invoice_url: "https://example.com/inv1",
    period_start: "2026-02-01T00:00:00Z",
    period_end: "2026-03-01T00:00:00Z",
    paid_at: "2026-03-01T12:00:00Z",
    created_at: "2026-03-01T00:00:00Z",
  },
  {
    id: "inv-2",
    stripe_invoice_id: "in_test2",
    invoice_number: "INV-002",
    status: "open",
    subtotal_cents: 2900,
    tax_cents: 0,
    total_cents: 2900,
    amount_paid_cents: 0,
    amount_due_cents: 2900,
    currency: "usd",
    invoice_pdf: null,
    hosted_invoice_url: "https://example.com/inv2",
    period_start: "2026-03-01T00:00:00Z",
    period_end: "2026-04-01T00:00:00Z",
    paid_at: null,
    created_at: "2026-03-01T00:00:00Z",
  },
];

export const mockBillingHistory = [
  { month: "2026-03", total_tokens: 33000, total_cost_cents: 156, request_count: 45 },
  { month: "2026-02", total_tokens: 28000, total_cost_cents: 130, request_count: 38 },
  { month: "2026-01", total_tokens: 20000, total_cost_cents: 90, request_count: 25 },
];

// ──── Admin: Plan Overrides ────

export const mockPlanOverride = {
  id: "po-1",
  workspace_id: "ws-override-1",
  billing_model: "flat_plus_usage",
  price_monthly_cents: null,
  base_fee_monthly_cents: 3900,
  per_seat_price_monthly_cents: null,
  max_repos: -1,
  llm_requests_per_day: -1,
  free_llm_tokens_per_month: null,
  discount_percent: 20,
  discount_description: "Partner discount",
  notes: "Special partner pricing for Acme Corp",
  configured_by: "admin@aexy.io",
  created_at: "2026-03-15T00:00:00Z",
  updated_at: "2026-03-15T00:00:00Z",
};

export const mockEffectivePlan = {
  plan_id: "plan-flat",
  plan_name: "Flat + Usage",
  tier: "flat_plus_usage",
  billing_model: "flat_plus_usage",
  has_overrides: true,
  discount_percent: 20,
  max_repos: -1,
  max_commits_per_repo: -1,
  max_prs_per_repo: -1,
  sync_history_days: -1,
  llm_requests_per_day: -1,
  llm_requests_per_minute: 30,
  llm_tokens_per_minute: 200000,
  llm_provider_access: ["claude", "gemini", "ollama", "openrouter"],
  free_llm_tokens_per_month: 0,
  llm_input_cost_per_1k_cents: 20,
  llm_output_cost_per_1k_cents: 40,
  enable_overage_billing: true,
  enable_real_time_sync: true,
  enable_advanced_analytics: true,
  enable_exports: true,
  enable_webhooks: true,
  enable_team_features: true,
  price_monthly_cents: 4900,
  base_fee_monthly_cents: 3900,
  per_seat_price_monthly_cents: 0,
  min_seats: 1,
  included_seats: -1,
  payment_timing: "prepaid",
  requires_payment_method: true,
};

// ──── Setup Helper ────

import type { Page } from "@playwright/test";

const API_BASE = "http://localhost:8000/api/v1";

interface SetupOptions {
  subscriptionStatus?: typeof mockFreeSubscriptionStatus;
  plans?: typeof allPlans;
  user?: typeof mockUser;
  workspace?: typeof mockWorkspace;
  overrides?: (typeof mockPlanOverride)[];
  effectivePlan?: typeof mockEffectivePlan;
}

export async function setupBillingMocks(page: Page, options: SetupOptions = {}) {
  const {
    subscriptionStatus = mockFreeSubscriptionStatus,
    plans = allPlans,
    user = mockUser,
    workspace = mockWorkspace,
    overrides = [],
    effectivePlan = mockEffectivePlan,
  } = options;

  // Set auth token + workspace before navigating
  await page.addInitScript(() => {
    localStorage.setItem("token", "fake-test-token");
    localStorage.setItem("current_workspace_id", "ws-1");
  });

  // IMPORTANT: Playwright matches routes in REVERSE registration order.
  // Register catch-all FIRST so it's checked LAST.

  await page.route(`${API_BASE}/**`, (route) => {
    // Return empty array by default — many hooks expect arrays from list endpoints.
    // Returning {} causes "x.find is not a function" errors in hooks like useDocumentSpaces.
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  // Workspace routes
  await page.route(`${API_BASE}/workspaces`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([workspace]),
    });
  });

  // Workspace sub-routes: use ** to match any depth
  await page.route(`${API_BASE}/workspaces/**`, (route) => {
    const url = route.request().url();
    // Check app-access BEFORE members (URLs like /app-access/members/... contain both)
    if (url.includes("/app-access/")) {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          apps: {},
          applied_template_id: null,
          applied_template_name: null,
          has_custom_overrides: false,
          is_admin: true,
        }),
      });
    } else if (url.includes("/members")) {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockWorkspaceMembers),
      });
    } else if (url.includes("/spaces")) {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    } else if (url.includes("/documents/")) {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    } else if (url.match(/\/workspaces\/[^/]+$/)) {
      // Exact workspace fetch like /workspaces/ws-1
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(workspace),
      });
    } else {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    }
  });

  // Notifications — must return paginated object, not array
  await page.route(`${API_BASE}/notifications**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ results: [], count: 0, unread_count: 0 }),
    });
  });

  // Dashboard preferences (returns object)
  await page.route(`${API_BASE}/dashboard/preferences`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ visible_widgets: [], widget_order: [] }),
    });
  });

  // Developer profile
  await page.route(`${API_BASE}/developers/me`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(user),
    });
  });

  // Billing routes - use regex or ** glob to match with query params
  await page.route(`${API_BASE}/billing/status**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(subscriptionStatus),
    });
  });

  await page.route(`${API_BASE}/billing/plans**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(plans),
    });
  });

  await page.route(`${API_BASE}/billing/limits**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockLimitsUsage),
    });
  });

  // Usage routes — register specific routes LAST (checked FIRST)
  // /billing/usage (exact — no trailing path) returns usage summary
  await page.route(`${API_BASE}/billing/usage`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockUsageSummary),
    });
  });

  // /billing/usage/* routes — match sub-paths
  await page.route(`${API_BASE}/billing/usage/estimate**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockUsageEstimate),
    });
  });

  await page.route(`${API_BASE}/billing/usage/history**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockBillingHistory),
    });
  });

  await page.route(`${API_BASE}/billing/invoices**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockInvoices),
    });
  });

  await page.route(`${API_BASE}/billing/effective-plan**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(effectivePlan),
    });
  });

  // Admin routes
  await page.route(`${API_BASE}/platform-admin/plan-overrides`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(overrides),
    });
  });

  await page.route(`${API_BASE}/platform-admin/workspaces/*/plan-override`, (route) => {
    if (route.request().method() === "DELETE") {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "deleted" }) });
    } else if (route.request().method() === "POST") {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockPlanOverride) });
    } else {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(overrides[0] || {}) });
    }
  });

  await page.route(`${API_BASE}/platform-admin/workspaces/*/effective-plan`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(effectivePlan),
    });
  });
}
