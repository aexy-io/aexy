import { test, expect } from "./fixtures/base-test";
import type { Page } from "@playwright/test";
import {
  setupCommonMocks,
  API_BASE,
  mockMembers,
} from "./fixtures/shared-helpers";

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const mockDashboardStats = {
  total_reminders: 12,
  active_reminders: 8,
  paused_reminders: 2,
  pending_instances: 5,
  overdue_instances: 3,
  completed_this_week: 4,
  completion_rate: 0.72,
};

const mockDocuments = {
  items: [
    {
      id: "doc-1",
      workspace_id: "ws-1",
      name: "SOC 2 Audit Report",
      description: "Annual SOC 2 Type II audit report",
      mime_type: "application/pdf",
      file_size: 2048000,
      status: "active",
      folder_id: "folder-1",
      tags: ["soc2", "audit"],
      storage_key: "docs/soc2-report.pdf",
      uploaded_by: "test-user-123",
      created_at: "2026-01-15T10:00:00Z",
      updated_at: "2026-01-15T10:00:00Z",
    },
    {
      id: "doc-2",
      workspace_id: "ws-1",
      name: "GDPR Privacy Policy",
      description: "Company privacy policy for GDPR compliance",
      mime_type: "application/pdf",
      file_size: 512000,
      status: "active",
      folder_id: null,
      tags: ["gdpr", "privacy"],
      storage_key: "docs/gdpr-policy.pdf",
      uploaded_by: "test-user-123",
      created_at: "2026-02-01T14:30:00Z",
      updated_at: "2026-02-01T14:30:00Z",
    },
  ],
  total: 2,
  page: 1,
  page_size: 20,
};

const mockFolderTree = [
  {
    id: "folder-1",
    workspace_id: "ws-1",
    name: "Audit Reports",
    parent_id: null,
    children: [],
    document_count: 1,
  },
  {
    id: "folder-2",
    workspace_id: "ws-1",
    name: "Policies",
    parent_id: null,
    children: [],
    document_count: 0,
  },
];

const mockTags = {
  tags: ["soc2", "audit", "gdpr", "privacy", "iso27001"],
};

const mockCertifications = {
  items: [
    {
      id: "cert-type-1",
      workspace_id: "ws-1",
      name: "AWS Solutions Architect",
      description: "Professional cloud architecture certification",
      issuing_authority: "Amazon Web Services",
      validity_months: 36,
      renewal_required: true,
      category: "Cloud",
      is_required: true,
      is_active: true,
      external_url: "https://aws.amazon.com/certification/",
      active_holders: 3,
      expiring_soon_count: 1,
      expired_count: 0,
      total_holders: 4,
      created_at: "2025-06-01T00:00:00Z",
    },
    {
      id: "cert-type-2",
      workspace_id: "ws-1",
      name: "ISO 27001 Lead Auditor",
      description: "Information security management system auditor",
      issuing_authority: "PECB",
      validity_months: 36,
      renewal_required: true,
      category: "Security",
      is_required: false,
      is_active: true,
      external_url: null,
      active_holders: 1,
      expiring_soon_count: 0,
      expired_count: 0,
      total_holders: 1,
      created_at: "2025-08-15T00:00:00Z",
    },
  ],
  total: 2,
  page: 1,
  page_size: 20,
};

const mockMyCertifications = {
  items: [
    {
      id: "dev-cert-1",
      certification_id: "cert-type-1",
      developer_id: "test-user-123",
      certification_name: "AWS Solutions Architect",
      certification_issuing_authority: "Amazon Web Services",
      issued_date: "2025-03-10",
      expiry_date: "2028-03-10",
      credential_id: "AWS-SAA-98765",
      verification_url: "https://aws.amazon.com/verify/98765",
      status: "active",
      created_at: "2025-03-10T00:00:00Z",
    },
  ],
  total: 1,
  page: 1,
  page_size: 20,
};

const mockTrainings = {
  items: [
    {
      id: "training-1",
      workspace_id: "ws-1",
      name: "Security Awareness Training",
      description: "Annual mandatory security awareness program",
      applies_to_type: "all",
      due_days_after_assignment: 30,
      recurring_months: 12,
      is_active: true,
      total_assignments: 10,
      completed_assignments: 7,
      overdue_assignments: 1,
      created_at: "2025-01-01T00:00:00Z",
    },
    {
      id: "training-2",
      workspace_id: "ws-1",
      name: "Data Privacy Fundamentals",
      description: "GDPR and data privacy training",
      applies_to_type: "all",
      due_days_after_assignment: 14,
      recurring_months: null,
      is_active: true,
      total_assignments: 5,
      completed_assignments: 5,
      overdue_assignments: 0,
      created_at: "2025-04-01T00:00:00Z",
    },
  ],
  total: 2,
  page: 1,
  page_size: 20,
};

const mockMyAssignments = {
  items: [
    {
      id: "assign-1",
      mandatory_training_id: "training-1",
      developer_id: "test-user-123",
      training_name: "Security Awareness Training",
      status: "in_progress",
      due_date: "2026-03-01",
      progress_percentage: 60,
      assigned_at: "2026-01-15T00:00:00Z",
    },
    {
      id: "assign-2",
      mandatory_training_id: "training-2",
      developer_id: "test-user-123",
      training_name: "Data Privacy Fundamentals",
      status: "completed",
      due_date: "2026-02-10",
      progress_percentage: 100,
      assigned_at: "2026-01-20T00:00:00Z",
      completed_at: "2026-02-05T00:00:00Z",
    },
  ],
  total: 2,
  page: 1,
  page_size: 20,
};

// ---------------------------------------------------------------------------
// Helper: Setup compliance-specific mocks on top of common mocks
// ---------------------------------------------------------------------------

async function setupComplianceMocks(page: Page) {
  await setupCommonMocks(page);

  // Compliance-specific route mocks (registered AFTER common mocks,
  // so Playwright checks them BEFORE the catch-all in setupCommonMocks).

  // --- Reminder dashboard stats (used by /compliance dashboard page) ---
  await page.route(
    `${API_BASE}/workspaces/ws-1/reminders/dashboard/stats`,
    (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockDashboardStats),
      });
    }
  );

  // --- Compliance Documents (workspace-scoped URLs) ---
  await page.route(
    `${API_BASE}/workspaces/ws-1/compliance/documents/tags/all`,
    (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockTags),
      });
    }
  );

  await page.route(
    `${API_BASE}/workspaces/ws-1/compliance/folders/tree`,
    (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockFolderTree),
      });
    }
  );

  await page.route(
    `${API_BASE}/workspaces/ws-1/compliance/folders`,
    (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockFolderTree),
      });
    }
  );

  await page.route(
    `${API_BASE}/workspaces/ws-1/compliance/documents**`,
    (route) => {
      const url = route.request().url();
      // Avoid matching /tags/all (already handled above)
      if (url.includes("/tags/")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockTags),
        });
      }
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockDocuments),
      });
    }
  );

  // --- Training & Assignments (complianceApi uses query-param-based URLs) ---
  await page.route(`${API_BASE}/compliance/mandatory-training**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockTrainings),
    });
  });

  await page.route(`${API_BASE}/compliance/assignments**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockMyAssignments),
    });
  });

  // --- Certifications (complianceApi uses query-param-based URLs) ---
  await page.route(
    `${API_BASE}/compliance/developer-certifications**`,
    (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockMyCertifications),
      });
    }
  );

  await page.route(`${API_BASE}/compliance/certifications**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockCertifications),
    });
  });
}

// ---------------------------------------------------------------------------
// Empty-state variant: all compliance data empty
// ---------------------------------------------------------------------------

async function setupComplianceMocksEmpty(page: Page) {
  await setupCommonMocks(page);

  const emptyStats = {
    total_reminders: 0,
    active_reminders: 0,
    paused_reminders: 0,
    pending_instances: 0,
    overdue_instances: 0,
    completed_this_week: 0,
    completion_rate: 0,
  };

  const emptyPaginated = { items: [], total: 0, page: 1, page_size: 20 };

  await page.route(
    `${API_BASE}/workspaces/ws-1/reminders/dashboard/stats`,
    (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(emptyStats),
      });
    }
  );

  await page.route(
    `${API_BASE}/workspaces/ws-1/compliance/documents/tags/all`,
    (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ tags: [] }),
      });
    }
  );

  await page.route(
    `${API_BASE}/workspaces/ws-1/compliance/folders/tree`,
    (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    }
  );

  await page.route(
    `${API_BASE}/workspaces/ws-1/compliance/folders`,
    (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    }
  );

  await page.route(
    `${API_BASE}/workspaces/ws-1/compliance/documents**`,
    (route) => {
      const url = route.request().url();
      if (url.includes("/tags/")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ tags: [] }),
        });
      }
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(emptyPaginated),
      });
    }
  );

  await page.route(`${API_BASE}/compliance/mandatory-training**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(emptyPaginated),
    });
  });

  await page.route(`${API_BASE}/compliance/assignments**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(emptyPaginated),
    });
  });

  await page.route(
    `${API_BASE}/compliance/developer-certifications**`,
    (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(emptyPaginated),
      });
    }
  );

  await page.route(`${API_BASE}/compliance/certifications**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(emptyPaginated),
    });
  });
}

// ---------------------------------------------------------------------------
// Test Suite: Compliance Dashboard
// ---------------------------------------------------------------------------

test.describe("Compliance Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await setupComplianceMocks(page);
    await page.goto("/compliance");
    await page.waitForSelector("text=Compliance", { timeout: 45000 });
  });

  test("renders the dashboard with title and description", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "Compliance" })
    ).toBeVisible();
    await expect(
      page.getByText("Manage compliance reminders, documents, training, and certifications")
    ).toBeVisible();
  });

  test("renders stat cards with correct values", async ({ page }) => {
    // Active Reminders
    await expect(page.getByText("Active Reminders")).toBeVisible();
    await expect(page.getByText("8", { exact: true }).first()).toBeVisible();

    // Pending
    await expect(page.getByText("Pending")).toBeVisible();
    await expect(page.getByText("5", { exact: true }).first()).toBeVisible();

    // Overdue
    await expect(page.getByText("Overdue")).toBeVisible();
    await expect(page.getByText("3", { exact: true }).first()).toBeVisible();

    // Completed This Week
    await expect(page.getByText("Completed This Week")).toBeVisible();
    await expect(page.getByText("4", { exact: true }).first()).toBeVisible();
  });

  test("renders all module navigation cards", async ({ page }) => {
    await expect(page.getByText("Reminders")).toBeVisible();
    await expect(page.getByText("Document Center")).toBeVisible();
    await expect(page.getByText("Questionnaires")).toBeVisible();
    await expect(page.getByText("Training")).toBeVisible();
    await expect(page.getByText("Certifications")).toBeVisible();
    await expect(page.getByText("Calendar")).toBeVisible();
  });

  test("module cards show descriptions", async ({ page }) => {
    await expect(
      page.getByText("Track compliance commitments, reviews, and recurring tasks")
    ).toBeVisible();
    await expect(
      page.getByText("Upload, organize, and link compliance documents")
    ).toBeVisible();
    await expect(
      page.getByText("Mandatory training programs and assignments")
    ).toBeVisible();
    await expect(
      page.getByText("Track employee certifications and renewals")
    ).toBeVisible();
  });

  test("Reminders card shows active count and overdue alert", async ({ page }) => {
    // The Reminders card should show "8 Active"
    await expect(page.getByText("8 Active")).toBeVisible();

    // Should show overdue alert: "3 overdue"
    await expect(page.getByText("3 overdue")).toBeVisible();
  });

  test("clicking Document Center card navigates to documents page", async ({
    page,
  }) => {
    await page.getByText("Document Center").click();
    await page.waitForURL("**/compliance/documents");
    await expect(page).toHaveURL(/\/compliance\/documents/);
  });

  test("clicking Training card navigates to training page", async ({
    page,
  }) => {
    await page.getByText("Mandatory training programs and assignments").click();
    await page.waitForURL("**/compliance/training");
    await expect(page).toHaveURL(/\/compliance\/training/);
  });

  test("clicking Certifications card navigates to certifications page", async ({
    page,
  }) => {
    await page.getByText("Track employee certifications and renewals").click();
    await page.waitForURL("**/compliance/certifications");
    await expect(page).toHaveURL(/\/compliance\/certifications/);
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Document Center
// ---------------------------------------------------------------------------

test.describe("Compliance Document Center", () => {
  test.beforeEach(async ({ page }) => {
    await setupComplianceMocks(page);
    await page.goto("/compliance/documents");
    await page.waitForSelector("text=Document Center", { timeout: 45000 });
  });

  test("renders Document Center page with title and buttons", async ({
    page,
  }) => {
    await expect(
      page.getByRole("heading", { name: "Document Center" })
    ).toBeVisible();
    await expect(
      page.getByText("Upload, organize, and link compliance documents as evidence")
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /New Folder/i })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Upload Document/i })
    ).toBeVisible();
  });

  test("shows folder tree sidebar", async ({ page }) => {
    await expect(page.getByText("Folders")).toBeVisible();
    await expect(page.getByText("Audit Reports")).toBeVisible();
    await expect(page.getByText("Policies")).toBeVisible();
  });

  test("shows documents grid with document cards", async ({ page }) => {
    await expect(page.getByText("SOC 2 Audit Report")).toBeVisible();
    await expect(page.getByText("GDPR Privacy Policy")).toBeVisible();
  });

  test("Upload Document button opens upload modal", async ({ page }) => {
    await page.getByRole("button", { name: /Upload Document/i }).click();
    // Upload modal should appear (UploadModal component)
    await expect(page.getByText("Upload Document").nth(1)).toBeVisible();
  });

  test("New Folder button opens create folder modal", async ({ page }) => {
    await page.getByRole("button", { name: /New Folder/i }).click();
    // Create folder modal should appear
    await expect(page.getByText("Create Folder")).toBeVisible();
  });
});

test.describe("Compliance Document Center - Empty State", () => {
  test("shows empty state when no documents exist", async ({ page }) => {
    await setupComplianceMocksEmpty(page);
    await page.goto("/compliance/documents");
    await page.waitForSelector("text=Document Center", { timeout: 45000 });

    await expect(page.getByText("No documents yet")).toBeVisible();
    await expect(
      page.getByText("Upload your first compliance document to get started.")
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Training Page
// ---------------------------------------------------------------------------

test.describe("Compliance Training", () => {
  test.beforeEach(async ({ page }) => {
    await setupComplianceMocks(page);
    await page.goto("/compliance/training");
    await page.waitForSelector("text=Training", { timeout: 45000 });
  });

  test("renders Training page with title and create button", async ({
    page,
  }) => {
    await expect(
      page.getByRole("heading", { name: "Training", exact: true })
    ).toBeVisible();
    await expect(
      page.getByText("Mandatory training programs and your assignments")
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /New Training/i })
    ).toBeVisible();
  });

  test("shows My Assignments section with assignment cards", async ({
    page,
  }) => {
    await expect(
      page.getByRole("heading", { name: "My Assignments" })
    ).toBeVisible();
    await expect(
      page.getByText("Security Awareness Training").first()
    ).toBeVisible();
    await expect(
      page.getByText("Data Privacy Fundamentals").first()
    ).toBeVisible();
  });

  test("shows assignment statuses", async ({ page }) => {
    // in_progress assignment should show Complete button
    await expect(
      page.getByRole("button", { name: "Complete" }).first()
    ).toBeVisible();
  });

  test("shows All Training Programs section", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "All Training Programs" })
    ).toBeVisible();
    await expect(
      page.getByText("Security Awareness Training").first()
    ).toBeVisible();
    await expect(
      page.getByText("Data Privacy Fundamentals").first()
    ).toBeVisible();
  });

  test("training program cards show assignment stats", async ({ page }) => {
    // "10 assigned" from Security Awareness Training
    await expect(page.getByText("10 assigned")).toBeVisible();
    // "7 completed"
    await expect(page.getByText("7 completed")).toBeVisible();
    // "1 overdue"
    await expect(page.getByText("1 overdue")).toBeVisible();
  });

  test("New Training button opens create modal", async ({ page }) => {
    await page.getByRole("button", { name: /New Training/i }).click();
    await expect(
      page.getByRole("heading", { name: "New Training Program" })
    ).toBeVisible();
    await expect(page.getByText("Training Name")).toBeVisible();
    await expect(
      page.getByPlaceholder("e.g., Security Awareness Training")
    ).toBeVisible();
  });

  test("create training modal can be closed with Cancel", async ({ page }) => {
    await page.getByRole("button", { name: /New Training/i }).click();
    await expect(
      page.getByRole("heading", { name: "New Training Program" })
    ).toBeVisible();

    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "New Training Program" })
    ).not.toBeVisible();
  });
});

test.describe("Compliance Training - Empty State", () => {
  test("shows empty states when no training data exists", async ({ page }) => {
    await setupComplianceMocksEmpty(page);
    await page.goto("/compliance/training");
    await page.waitForSelector("text=Training", { timeout: 45000 });

    await expect(page.getByText("No training assignments")).toBeVisible();
    await expect(
      page.getByText("No training programs configured")
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Certifications Page
// ---------------------------------------------------------------------------

test.describe("Compliance Certifications", () => {
  test.beforeEach(async ({ page }) => {
    await setupComplianceMocks(page);
    await page.goto("/compliance/certifications");
    await page.waitForSelector("text=Certifications", { timeout: 45000 });
  });

  test("renders Certifications page with title and buttons", async ({
    page,
  }) => {
    await expect(
      page.getByRole("heading", { name: "Certifications", exact: true })
    ).toBeVisible();
    await expect(
      page.getByText("Track employee certifications and renewal deadlines")
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /New Type/i })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Add My Cert/i })
    ).toBeVisible();
  });

  test("shows My Certifications section with developer certs", async ({
    page,
  }) => {
    await expect(
      page.getByRole("heading", { name: "My Certifications" })
    ).toBeVisible();
    await expect(
      page.getByText("AWS Solutions Architect").first()
    ).toBeVisible();
    await expect(
      page.getByText("Amazon Web Services").first()
    ).toBeVisible();
    await expect(page.getByText("AWS-SAA-98765")).toBeVisible();
  });

  test("my certifications show status badges", async ({ page }) => {
    await expect(page.getByText("active", { exact: true }).first()).toBeVisible();
  });

  test("shows All Certification Types section", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "All Certification Types" })
    ).toBeVisible();
    await expect(
      page.getByText("AWS Solutions Architect").first()
    ).toBeVisible();
    await expect(page.getByText("ISO 27001 Lead Auditor")).toBeVisible();
  });

  test("certification type cards show holder stats", async ({ page }) => {
    // "3 active" holders for AWS cert
    await expect(page.getByText("3 active")).toBeVisible();
    // "1 expiring soon"
    await expect(page.getByText("1 expiring soon")).toBeVisible();
  });

  test("required certifications show Required badge", async ({ page }) => {
    await expect(page.getByText("Required")).toBeVisible();
  });

  test("New Type button opens create certification modal", async ({
    page,
  }) => {
    await page.getByRole("button", { name: /New Type/i }).click();
    await expect(
      page.getByRole("heading", { name: "New Certification Type" })
    ).toBeVisible();
    await expect(page.getByText("Certification Name")).toBeVisible();
    await expect(
      page.getByPlaceholder("e.g., AWS Solutions Architect")
    ).toBeVisible();
    await expect(page.getByText("Issuing Authority")).toBeVisible();
  });

  test("Add My Cert button opens add developer cert modal", async ({
    page,
  }) => {
    await page.getByRole("button", { name: /Add My Cert/i }).click();
    await expect(
      page.getByRole("heading", { name: "Add My Certification" })
    ).toBeVisible();
    await expect(page.getByText("Certification")).toBeVisible();
    await expect(page.getByText("Issued Date")).toBeVisible();
  });

  test("create certification modal can be closed with Cancel", async ({
    page,
  }) => {
    await page.getByRole("button", { name: /New Type/i }).click();
    await expect(
      page.getByRole("heading", { name: "New Certification Type" })
    ).toBeVisible();

    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "New Certification Type" })
    ).not.toBeVisible();
  });
});

test.describe("Compliance Certifications - Empty State", () => {
  test("shows empty states when no certifications exist", async ({ page }) => {
    await setupComplianceMocksEmpty(page);
    await page.goto("/compliance/certifications");
    await page.waitForSelector("text=Certifications", { timeout: 45000 });

    await expect(page.getByText("No certifications recorded")).toBeVisible();
    await expect(
      page.getByText("No certification types configured")
    ).toBeVisible();
  });
});
