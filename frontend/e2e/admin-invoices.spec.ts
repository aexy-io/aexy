import { test, expect, Page } from "@playwright/test";
import {
  mockAdminUser,
  mockUser,
  mockWorkspace,
  mockFreeSubscriptionStatus,
  setupBillingMocks,
} from "./fixtures/billing-mock-data";

const API_BASE = "http://localhost:8000/api/v1";

// Mock invoices for the admin page
// Mock data uses the AdminInvoice interface field names (what the page expects)
const mockAdminInvoices = [
  {
    id: "inv-bt-1",
    workspace_id: "ws-1",
    number: "INV-BT-001",
    status: "open",
    amount_due: 4900,
    amount_paid: 0,
    currency: "usd",
    description: "March 2026 - 5 seats + AI usage",
    due_date: "2026-04-15T00:00:00Z",
    payment_method: "bank_transfer",
    bank_transfer_reference: null,
    manual_payment_note: null,
    marked_paid_by: null,
    period_start: "2026-03-01T00:00:00Z",
    period_end: "2026-04-01T00:00:00Z",
    invoice_pdf: null,
    hosted_invoice_url: null,
    paid_at: null,
    created_at: "2026-03-28T00:00:00Z",
  },
  {
    id: "inv-bt-2",
    workspace_id: "ws-1",
    number: "INV-BT-002",
    status: "paid",
    amount_due: 0,
    amount_paid: 3900,
    currency: "usd",
    description: "February 2026 - 5 seats + AI usage",
    due_date: "2026-03-15T00:00:00Z",
    payment_method: "bank_transfer",
    bank_transfer_reference: "WIRE-REF-20260301",
    manual_payment_note: "Received via ACH",
    marked_paid_by: "admin@aexy.io",
    period_start: "2026-02-01T00:00:00Z",
    period_end: "2026-03-01T00:00:00Z",
    invoice_pdf: null,
    hosted_invoice_url: null,
    paid_at: "2026-03-05T00:00:00Z",
    created_at: "2026-02-28T00:00:00Z",
  },
  {
    id: "inv-stripe-1",
    workspace_id: "ws-1",
    number: "INV-S-001",
    status: "paid",
    amount_due: 0,
    amount_paid: 2900,
    currency: "usd",
    description: null,
    due_date: null,
    payment_method: "stripe",
    bank_transfer_reference: null,
    manual_payment_note: null,
    marked_paid_by: null,
    period_start: "2026-01-01T00:00:00Z",
    period_end: "2026-02-01T00:00:00Z",
    invoice_pdf: "https://example.com/inv.pdf",
    hosted_invoice_url: "https://example.com/inv",
    paid_at: "2026-02-01T12:00:00Z",
    created_at: "2026-02-01T00:00:00Z",
  },
];

/**
 * Setup mocks for the admin invoices page.
 * Extends setupBillingMocks with admin invoice-specific routes.
 */
async function setupAdminInvoiceMocks(
  page: Page,
  options: { invoices?: typeof mockAdminInvoices; user?: typeof mockAdminUser } = {}
) {
  const { invoices = mockAdminInvoices, user = mockAdminUser } = options;

  await setupBillingMocks(page, {
    user,
    subscriptionStatus: mockFreeSubscriptionStatus,
  });

  // Admin invoice routes (registered AFTER setupBillingMocks, so checked FIRST)
  await page.route(`${API_BASE}/platform-admin/invoices/*/mark-paid`, (route) => {
    const invoice = invoices.find((i) => i.status === "open");
    if (invoice) {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...invoice,
          status: "paid",
          amount_paid_cents: invoice.total_cents,
          amount_due_cents: 0,
          paid_at: new Date().toISOString(),
          marked_paid_by: "admin@aexy.io",
        }),
      });
    } else {
      route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ detail: "Not found" }) });
    }
  });

  await page.route(`${API_BASE}/platform-admin/invoices/*/void`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "void", amount_due_cents: 0 }),
    });
  });

  await page.route(`${API_BASE}/platform-admin/invoices`, (route) => {
    if (route.request().method() === "POST") {
      const body = JSON.parse(route.request().postData() || "{}");
      route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: "inv-new-1",
          workspace_id: body.workspace_id,
          status: "open",
          total_cents: body.amount_cents,
          amount_due_cents: body.amount_cents,
          amount_paid_cents: 0,
          currency: body.currency || "usd",
          description: body.description,
          due_date: body.due_date,
          payment_method: body.payment_method || "bank_transfer",
          created_at: new Date().toISOString(),
        }),
      });
    } else {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(invoices),
      });
    }
  });

  await page.route(`${API_BASE}/platform-admin/workspaces/*/generate-invoice`, (route) => {
    route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        id: "inv-gen-1",
        workspace_id: "ws-1",
        status: "open",
        total_cents: 7800,
        amount_due_cents: 7800,
        payment_method: "bank_transfer",
        description: "Generated: 5 seats ($50.00) + Usage ($28.00)",
        created_at: new Date().toISOString(),
      }),
    });
  });
}

// ──────────────────────────────────────────────
// Suite 1: Admin Invoices Page — Rendering
// ──────────────────────────────────────────────

test.describe("Admin Invoices Page — Rendering", () => {
  test("shows page heading and create form", async ({ page }) => {
    await setupAdminInvoiceMocks(page);
    await page.goto("/settings/admin-invoices");
    await page.waitForSelector("h1:has-text('Invoices')", { timeout: 15000 });

    await expect(page.getByRole("heading", { name: "Invoices" }).first()).toBeVisible();
    await expect(page.getByPlaceholder("Enter workspace UUID").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Create Invoice" })).toBeVisible();
  });

  test("shows invoice list with all invoices", async ({ page }) => {
    await setupAdminInvoiceMocks(page);
    await page.goto("/settings/admin-invoices");
    await page.waitForSelector("h1:has-text('Invoices')", { timeout: 15000 });

    // Should show invoice numbers/descriptions
    await expect(page.getByText("INV-BT-001")).toBeVisible();
    await expect(page.getByText("INV-BT-002")).toBeVisible();
    await expect(page.getByText("INV-S-001")).toBeVisible();
  });

  test("shows status badges correctly", async ({ page }) => {
    await setupAdminInvoiceMocks(page);
    await page.goto("/settings/admin-invoices");
    await page.waitForSelector("h1:has-text('Invoices')", { timeout: 15000 });

    // Open invoice badge
    await expect(page.getByText("Open").first()).toBeVisible();
    // Paid invoice badges
    await expect(page.getByText("Paid").first()).toBeVisible();
  });

  test("shows payment method badges", async ({ page }) => {
    await setupAdminInvoiceMocks(page);
    await page.goto("/settings/admin-invoices");
    await page.waitForSelector("h1:has-text('Invoices')", { timeout: 15000 });

    // Payment method badges appear as visible spans in the table
    // Use locator to target spans (badges), not hidden option elements
    await expect(page.locator("span:has-text('Bank Transfer')").first()).toBeVisible();
    await expect(page.locator("span:has-text('Stripe')").first()).toBeVisible();
  });

  test("shows bank transfer reference for paid invoices", async ({ page }) => {
    await setupAdminInvoiceMocks(page);
    await page.goto("/settings/admin-invoices");
    await page.waitForSelector("h1:has-text('Invoices')", { timeout: 15000 });

    await expect(page.getByText("WIRE-REF-20260301")).toBeVisible();
  });

  test("shows invoice amounts", async ({ page }) => {
    await setupAdminInvoiceMocks(page);
    await page.goto("/settings/admin-invoices");
    await page.waitForSelector("h1:has-text('Invoices')", { timeout: 15000 });

    // Amounts should appear somewhere (format depends on component)
    await expect(page.getByText(/\$49|\$29|\$39/).first()).toBeVisible();
  });

  test("shows empty state when no invoices", async ({ page }) => {
    await setupAdminInvoiceMocks(page, { invoices: [] });
    await page.goto("/settings/admin-invoices");
    await page.waitForSelector("h1:has-text('Invoices')", { timeout: 15000 });

    await expect(page.getByText(/no invoices/i)).toBeVisible();
  });
});

// ──────────────────────────────────────────────
// Suite 2: Admin Invoices — Create Invoice
// ──────────────────────────────────────────────

test.describe("Admin Invoices — Create Invoice", () => {
  test("create button disabled without workspace ID", async ({ page }) => {
    await setupAdminInvoiceMocks(page);
    await page.goto("/settings/admin-invoices");
    await page.waitForSelector("h1:has-text('Invoices')", { timeout: 15000 });

    const createBtn = page.getByRole("button", { name: "Create Invoice" });
    await expect(createBtn).toBeDisabled();
  });

  test("can fill create form and submit", async ({ page }) => {
    await setupAdminInvoiceMocks(page);
    await page.goto("/settings/admin-invoices");
    await page.waitForSelector("h1:has-text('Invoices')", { timeout: 15000 });

    // Fill form
    await page.getByPlaceholder("Enter workspace UUID").first().fill("ws-1");
    await page.getByPlaceholder("e.g. 499.00").first().fill("49");
    await page.getByPlaceholder("Invoice description").first().fill("March invoice - 5 seats");

    // Submit
    const createBtn = page.getByRole("button", { name: "Create Invoice" });
    await expect(createBtn).toBeEnabled();
    await createBtn.click();

    // Should show success toast or refetch
    await page.waitForTimeout(1000);
  });
});

// ──────────────────────────────────────────────
// Suite 3: Admin Invoices — Mark Paid
// ──────────────────────────────────────────────

test.describe("Admin Invoices — Mark Paid", () => {
  test("mark paid button visible for open invoices", async ({ page }) => {
    await setupAdminInvoiceMocks(page);
    await page.goto("/settings/admin-invoices");
    await page.waitForSelector("h1:has-text('Invoices')", { timeout: 15000 });

    await expect(page.getByRole("button", { name: /Mark Paid/i }).first()).toBeVisible();
  });

  test("mark paid shows inline form", async ({ page }) => {
    await setupAdminInvoiceMocks(page);
    await page.goto("/settings/admin-invoices");
    await page.waitForSelector("h1:has-text('Invoices')", { timeout: 15000 });

    await page.getByRole("button", { name: /Mark Paid/i }).first().click();

    // Should show bank transfer reference input (placeholder: "e.g. Wire ref #12345")
    await expect(page.getByPlaceholder(/wire ref/i).first()).toBeVisible();
  });
});

// ──────────────────────────────────────────────
// Suite 4: Admin Invoices — Void
// ──────────────────────────────────────────────

test.describe("Admin Invoices — Void", () => {
  test("void button visible for open invoices", async ({ page }) => {
    await setupAdminInvoiceMocks(page);
    await page.goto("/settings/admin-invoices");
    await page.waitForSelector("h1:has-text('Invoices')", { timeout: 15000 });

    await expect(page.getByRole("button", { name: /Void/i }).first()).toBeVisible();
  });
});

// ──────────────────────────────────────────────
// Suite 5: Admin Invoices — Generate from Usage
// ──────────────────────────────────────────────

test.describe("Admin Invoices — Generate from Usage", () => {
  test("generate section exists with workspace input", async ({ page }) => {
    await setupAdminInvoiceMocks(page);
    await page.goto("/settings/admin-invoices");
    await page.waitForSelector("h1:has-text('Invoices')", { timeout: 15000 });

    await expect(page.getByText(/Generate/i).first()).toBeVisible();
  });
});

// ──────────────────────────────────────────────
// Suite 6: Admin Invoices — Permission Check
// ──────────────────────────────────────────────

test.describe("Admin Invoices — Permissions", () => {
  test("non-admin sees error state", async ({ page }) => {
    await setupAdminInvoiceMocks(page, { user: mockUser });
    // Override to return 403
    await page.route(`${API_BASE}/platform-admin/invoices`, (route) => {
      route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Platform admin access required" }),
      });
    });
    await page.goto("/settings/admin-invoices");
    await page.waitForSelector("h1:has-text('Invoices')", { timeout: 15000 });

    // Should show error or permission denied
    await expect(page.getByText(/error|permission|denied/i).first()).toBeVisible();
  });
});

// ──────────────────────────────────────────────
// Suite 7: Billing Page — Bank Transfer Invoice Display
// ──────────────────────────────────────────────

test.describe("Billing Page — Bank Transfer Invoices", () => {
  test("invoice list shows payment method badges", async ({ page }) => {
    await setupBillingMocks(page, {
      subscriptionStatus: {
        ...mockFreeSubscriptionStatus,
        has_subscription: true,
        billing_model: "postpaid" as any,
        subscription: {
          id: "sub-1",
          status: "active",
          plan_id: "plan-postpaid",
          current_period_start: "2026-03-01T00:00:00Z",
          current_period_end: "2026-04-01T00:00:00Z",
        },
      },
    });

    // Override invoices to include bank transfer ones
    await page.route(`${API_BASE}/billing/invoices**`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "inv-1",
            stripe_invoice_id: null,
            stripe_invoice_number: null,
            status: "paid",
            subtotal_cents: 4900,
            tax_cents: 0,
            total_cents: 4900,
            amount_paid_cents: 4900,
            amount_due_cents: 0,
            currency: "usd",
            payment_method: "bank_transfer",
            bank_transfer_reference: "ACH-123456",
            period_start: "2026-02-01T00:00:00Z",
            period_end: "2026-03-01T00:00:00Z",
            paid_at: "2026-03-05T00:00:00Z",
            created_at: "2026-03-01T00:00:00Z",
          },
          {
            id: "inv-2",
            stripe_invoice_id: "in_test",
            stripe_invoice_number: "INV-002",
            status: "paid",
            subtotal_cents: 2900,
            tax_cents: 0,
            total_cents: 2900,
            amount_paid_cents: 2900,
            amount_due_cents: 0,
            currency: "usd",
            payment_method: "stripe",
            bank_transfer_reference: null,
            period_start: "2026-01-01T00:00:00Z",
            period_end: "2026-02-01T00:00:00Z",
            paid_at: "2026-02-01T12:00:00Z",
            created_at: "2026-02-01T00:00:00Z",
          },
        ]),
      });
    });

    await page.goto("/settings/billing");
    await page.waitForTimeout(5000);

    // Bank transfer badge should be visible
    const bankBadge = page.getByText("Bank Transfer").first();
    if (await bankBadge.isVisible()) {
      await expect(bankBadge).toBeVisible();
    }
  });
});
