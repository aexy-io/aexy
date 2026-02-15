import { test, expect } from "./fixtures/base-test";
import type { Page } from "@playwright/test";
import { setupCommonMocks, API_BASE } from "./fixtures/shared-helpers";

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const mockDocument = {
  id: "doc-1",
  title: "API Design Guide",
  content: "# API Design Guide\n\nThis document covers best practices for API design...",
  space_id: "space-1",
  parent_id: null,
  created_by: "test-user-123",
  created_by_name: "Test Developer",
  last_edited_by: "test-user-123",
  last_edited_by_name: "Test Developer",
  is_public: false,
  status: "published",
  word_count: 1250,
  tags: ["api", "design", "best-practices"],
  created_at: "2026-01-15T00:00:00Z",
  updated_at: "2026-02-10T00:00:00Z",
};

const mockDocuments = [
  mockDocument,
  {
    id: "doc-2",
    title: "Onboarding Handbook",
    content: "# Onboarding\n\nWelcome to the team!",
    space_id: "space-1",
    parent_id: null,
    created_by: "dev-2",
    created_by_name: "Alice Johnson",
    last_edited_by: "dev-2",
    last_edited_by_name: "Alice Johnson",
    is_public: true,
    status: "published",
    word_count: 3500,
    tags: ["onboarding", "handbook"],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-02-01T00:00:00Z",
  },
];

const mockSpaces = [
  { id: "space-1", name: "Engineering", description: "Engineering docs", document_count: 12 },
  { id: "space-2", name: "Product", description: "Product documentation", document_count: 8 },
];

const mockKnowledgeGraph = {
  nodes: [
    { id: "doc-1", title: "API Design Guide", type: "document" },
    { id: "doc-2", title: "Onboarding Handbook", type: "document" },
    { id: "tag-api", title: "api", type: "tag" },
  ],
  edges: [
    { source: "doc-1", target: "tag-api", type: "tagged" },
  ],
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

async function setupDocsSubpageMocks(page: Page) {
  await setupCommonMocks(page);

  await page.route(`${API_BASE}/workspaces/ws-1/documents`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockDocuments) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/documents/doc-1`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockDocument) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/documents/**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockDocument) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/spaces`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockSpaces) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/knowledge-graph**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockKnowledgeGraph) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/docs/**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
  });
}

// ---------------------------------------------------------------------------
// Tests: Document Detail
// ---------------------------------------------------------------------------

test.describe("Docs -- Document Detail Page", () => {
  test("renders the document detail page", async ({ page }) => {
    await setupDocsSubpageMocks(page);
    await page.goto("/docs/doc-1");
    await page.waitForTimeout(5000);
    await expect(page.locator("body")).toBeVisible();
    const hasDoc = await page.getByText(/API Design Guide|document/i).isVisible().catch(() => false);
    expect(hasDoc).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Tests: Knowledge Graph
// ---------------------------------------------------------------------------

test.describe("Docs -- Knowledge Graph Page", () => {
  test("renders the knowledge graph page", async ({ page }) => {
    await setupDocsSubpageMocks(page);
    await page.goto("/docs/knowledge-graph");
    await page.waitForTimeout(5000);
    await expect(page.locator("body")).toBeVisible();
    const hasGraph = await page.getByText(/knowledge|graph/i).isVisible().catch(() => false);
    expect(hasGraph).toBeTruthy();
  });
});
