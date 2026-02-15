import { test, expect } from "./fixtures/base-test";
import type { Page } from "@playwright/test";
import { setupCommonMocks, API_BASE } from "./fixtures/shared-helpers";

// ── Mock Data ──────────────────────────────────────────────────────────────────

const mockRequirements = [
  {
    id: "req-1",
    role_title: "Senior Frontend Engineer",
    status: "active",
    priority: "high",
    timeline: "Q1 2026",
    workspace_id: "ws-1",
  },
  {
    id: "req-2",
    role_title: "Backend Developer",
    status: "active",
    priority: "medium",
    timeline: "Q2 2026",
    workspace_id: "ws-1",
  },
  {
    id: "req-3",
    role_title: "DevOps Engineer",
    status: "closed",
    priority: "low",
    timeline: null,
    workspace_id: "ws-1",
  },
];

const mockAssessmentMetrics = {
  total_candidates: 48,
  unique_attempts: 32,
  attempt_rate: 67,
};

const mockOrgMetrics = {
  total_candidates: 48,
  total_tests: 3,
  unique_attempts: 32,
  attempt_rate: 67,
};

const mockAssessments = [
  {
    id: "assess-1",
    title: "React Frontend Assessment",
    job_designation: "Frontend Engineer",
    status: "active",
    total_candidates: 15,
    completed_candidates: 10,
    total_questions: 20,
    total_duration_minutes: 60,
    average_score: 72,
    created_at: "2026-01-15T00:00:00Z",
  },
  {
    id: "assess-2",
    title: "Python Backend Assessment",
    job_designation: "Backend Developer",
    status: "active",
    total_candidates: 22,
    completed_candidates: 18,
    total_questions: 15,
    total_duration_minutes: 45,
    average_score: 65,
    created_at: "2026-02-01T00:00:00Z",
  },
  {
    id: "assess-3",
    title: "System Design",
    job_designation: "Senior Engineer",
    status: "draft",
    total_candidates: 0,
    completed_candidates: 0,
    total_questions: 5,
    total_duration_minutes: 90,
    average_score: null,
    created_at: "2026-02-10T00:00:00Z",
  },
];

const mockCandidates = [
  {
    id: "cand-1",
    name: "Alice Johnson",
    email: "alice@example.com",
    phone: "+1 555-0101",
    role: "Senior Frontend Engineer",
    stage: "interview",
    source: "LinkedIn",
    score: 85,
    applied_at: "2026-01-10T00:00:00Z",
    tags: ["React", "TypeScript"],
  },
  {
    id: "cand-2",
    name: "Bob Smith",
    email: "bob@example.com",
    phone: "+1 555-0102",
    role: "Backend Developer",
    stage: "assessment",
    source: "Referral",
    score: 72,
    applied_at: "2026-01-12T00:00:00Z",
    tags: ["Python", "Go"],
  },
  {
    id: "cand-3",
    name: "Carol Davis",
    email: "carol@example.com",
    phone: null,
    role: "DevOps Engineer",
    stage: "applied",
    source: "Direct",
    score: null,
    applied_at: "2026-02-05T00:00:00Z",
    tags: [],
  },
  {
    id: "cand-4",
    name: "David Lee",
    email: "david@example.com",
    phone: "+1 555-0104",
    role: "Senior Frontend Engineer",
    stage: "hired",
    source: "LinkedIn",
    score: 92,
    applied_at: "2025-12-01T00:00:00Z",
    tags: ["React", "Next.js", "GraphQL"],
  },
  {
    id: "cand-5",
    name: "Eva Martinez",
    email: "eva@example.com",
    phone: null,
    role: "Backend Developer",
    stage: "rejected",
    source: "Job Board",
    score: 38,
    applied_at: "2026-01-20T00:00:00Z",
    tags: ["Java"],
  },
];

const mockQuestions = [
  {
    id: "q-1",
    title: "Implement a React Hook for debounced search",
    question_type: "coding",
    difficulty: "medium",
    total_attempts: 25,
    average_score_percent: 68,
    average_time_seconds: 420,
    is_ai_generated: false,
    assessment_id: "assess-1",
    assessment_title: "React Frontend Assessment",
    topic_name: "React Hooks",
    deleted_at: null,
  },
  {
    id: "q-2",
    title: "What is the virtual DOM?",
    question_type: "mcq",
    difficulty: "easy",
    total_attempts: 30,
    average_score_percent: 85,
    average_time_seconds: 60,
    is_ai_generated: true,
    assessment_id: "assess-1",
    assessment_title: "React Frontend Assessment",
    topic_name: "Fundamentals",
    deleted_at: null,
  },
  {
    id: "q-3",
    title: "Explain the Python GIL",
    question_type: "short_answer",
    difficulty: "hard",
    total_attempts: 18,
    average_score_percent: 45,
    average_time_seconds: 300,
    is_ai_generated: false,
    assessment_id: "assess-2",
    assessment_title: "Python Backend Assessment",
    topic_name: "Python Internals",
    deleted_at: null,
  },
  {
    id: "q-4",
    title: "Design a REST API for a todo app",
    question_type: "essay",
    difficulty: "medium",
    total_attempts: 0,
    average_score_percent: 0,
    average_time_seconds: 0,
    is_ai_generated: true,
    assessment_id: "assess-3",
    assessment_title: "System Design",
    topic_name: null,
    deleted_at: null,
  },
  {
    id: "q-5",
    title: "Deleted question about closures",
    question_type: "mcq",
    difficulty: "easy",
    total_attempts: 10,
    average_score_percent: 90,
    average_time_seconds: 45,
    is_ai_generated: false,
    assessment_id: "assess-1",
    assessment_title: "React Frontend Assessment",
    topic_name: "JavaScript",
    deleted_at: "2026-02-12T00:00:00Z",
  },
];

const mockQuestionDetail = {
  id: "q-1",
  title: "Implement a React Hook for debounced search",
  question_type: "coding",
  difficulty: "medium",
  max_marks: 100,
  estimated_time_minutes: 7,
  problem_statement:
    "Create a custom React hook called useDebounce that takes a value and a delay in ms.",
  options: [],
  constraints: ["Must use useEffect", "Must clean up timeouts"],
  tags: ["React", "Hooks", "Debounce"],
  is_ai_generated: false,
  assessment_id: "assess-1",
  assessment_title: "React Frontend Assessment",
  topic_name: "React Hooks",
  deleted_at: null,
  analytics: {
    total_attempts: 25,
    average_score_percent: 68,
    average_time_seconds: 420,
    completion_rate: 88,
    skip_rate: 4.2,
    partial_credit_rate: 32.5,
    median_score_percent: 70,
    median_time_seconds: 400,
    stated_difficulty: "medium",
    calculated_difficulty: "medium",
    difficulty_accuracy: 0.85,
    score_distribution: {
      "0-20": 2,
      "21-40": 3,
      "41-60": 5,
      "61-80": 10,
      "81-100": 5,
    },
    time_distribution: {
      "0-60": 1,
      "61-120": 3,
      "121-300": 8,
      "301-600": 10,
      "600+": 3,
    },
    option_selection_distribution: null,
    test_case_pass_rates: [
      { test_id: "tc-1", pass_rate: 0.92 },
      { test_id: "tc-2", pass_rate: 0.76 },
      { test_id: "tc-3", pass_rate: 0.6 },
    ],
  },
};

const mockQuestionSubmissions = [
  {
    submission_id: "sub-1",
    candidate_id: "cand-1",
    candidate_name: "Alice Johnson",
    candidate_email: "alice@example.com",
    score_percent: 85,
    time_taken_seconds: 380,
    status: "evaluated",
    submitted_at: "2026-01-20T14:30:00Z",
  },
  {
    submission_id: "sub-2",
    candidate_id: "cand-2",
    candidate_name: "Bob Smith",
    candidate_email: "bob@example.com",
    score_percent: 55,
    time_taken_seconds: 510,
    status: "evaluated",
    submitted_at: "2026-01-21T10:00:00Z",
  },
];

const mockAssessmentDetail = {
  id: "assess-1",
  title: "React Frontend Assessment",
  job_designation: "Frontend Engineer",
  status: "active",
  total_candidates: 15,
  completed_candidates: 10,
  total_questions: 20,
  total_duration_minutes: 60,
  average_score: 72,
  created_at: "2026-01-15T00:00:00Z",
};

const mockAssessmentCandidates = [
  {
    id: "inv-1",
    candidate: { name: "Alice Johnson", email: "alice@example.com" },
    status: "completed",
    latest_score: 85,
    latest_trust_score: 92,
    started_at: "2026-01-18T09:00:00Z",
    completed_at: "2026-01-18T10:15:00Z",
  },
  {
    id: "inv-2",
    candidate: { name: "Bob Smith", email: "bob@example.com" },
    status: "completed",
    latest_score: 62,
    latest_trust_score: 78,
    started_at: "2026-01-19T14:00:00Z",
    completed_at: "2026-01-19T14:50:00Z",
  },
  {
    id: "inv-3",
    candidate: { name: "Carol Davis", email: "carol@example.com" },
    status: "invited",
    latest_score: null,
    latest_trust_score: null,
    started_at: null,
    completed_at: null,
  },
  {
    id: "inv-4",
    candidate: { name: "David Lee", email: "david@example.com" },
    status: "started",
    latest_score: null,
    latest_trust_score: null,
    started_at: "2026-01-22T11:00:00Z",
    completed_at: null,
  },
];

const mockPipelineMetrics = {
  total: 48,
  by_stage: {
    applied: 15,
    screening: 10,
    assessment: 8,
    interview: 6,
    offer: 5,
    hired: 4,
  },
  conversion_rates: {
    applied_to_screening: 67,
    screening_to_assessment: 80,
    assessment_to_interview: 75,
    interview_to_offer: 83,
    offer_to_hired: 80,
  },
};

const mockDevelopers = [
  { id: "dev-1", name: "Test Developer", email: "test@example.com" },
];

const mockTeams = [
  { id: "team-1", name: "Engineering", workspace_id: "ws-1", member_count: 5 },
  { id: "team-2", name: "Design", workspace_id: "ws-1", member_count: 3 },
];

// ── Setup Helpers ──────────────────────────────────────────────────────────────

async function setupHiringMocks(page: Page) {
  await setupCommonMocks(page);

  // Hiring requirements
  await page.route(`${API_BASE}/workspaces/ws-1/hiring/requirements**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockRequirements),
    });
  });

  // Assessment org metrics
  await page.route(`${API_BASE}/workspaces/ws-1/assessments/organization/ws-1/metrics**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockOrgMetrics),
    });
  });

  // Assessment metrics (per assessment and org-level)
  await page.route(`${API_BASE}/workspaces/ws-1/assessments/metrics**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockAssessmentMetrics),
    });
  });

  // Assessments list
  await page.route(`${API_BASE}/workspaces/ws-1/assessments`, (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ id: "assess-new", title: "New Assessment" }),
      });
    }
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockAssessments),
    });
  });

  // Assessments catch-all (for IDs, etc.)
  await page.route(`${API_BASE}/workspaces/ws-1/assessments/**`, (route) => {
    const url = route.request().url();

    // Single assessment detail
    if (/\/assessments\/assess-\d+$/.test(url) || url.includes("/assessments/assess-1?")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockAssessmentDetail),
      });
    }

    // Assessment-specific metrics
    if (url.includes("/metrics")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockAssessmentMetrics),
      });
    }

    // Assessment candidates
    if (url.includes("/candidates")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockAssessmentCandidates),
      });
    }

    // Clone
    if (url.includes("/clone")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: "assess-cloned", title: "React Frontend Assessment (Copy)" }),
      });
    }

    // Wizard status
    if (url.includes("/wizard/status")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ current_step: 1, completed_steps: [] }),
      });
    }

    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });

  // Hiring candidates
  await page.route(`${API_BASE}/workspaces/ws-1/hiring/candidates**`, (route) => {
    const url = route.request().url();

    // Pipeline metrics
    if (url.includes("/pipeline-metrics")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockPipelineMetrics),
      });
    }

    // Single candidate
    if (/\/candidates\/cand-\d+$/.test(url)) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockCandidates[0]),
      });
    }

    // List
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockCandidates),
    });
  });

  // Questions API
  await page.route(`${API_BASE}/workspaces/ws-1/questions**`, (route) => {
    const url = route.request().url();

    // Single question detail
    if (/\/questions\/q-\d+$/.test(url) || /\/questions\/q-\d+\?/.test(url)) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockQuestionDetail),
      });
    }

    // Submissions
    if (url.includes("/submissions")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: mockQuestionSubmissions,
          total: mockQuestionSubmissions.length,
          page: 1,
          per_page: 10,
          total_pages: 1,
        }),
      });
    }

    // List
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: mockQuestions.filter((q) => !q.deleted_at),
        total: mockQuestions.filter((q) => !q.deleted_at).length,
        page: 1,
        per_page: 20,
        total_pages: 1,
      }),
    });
  });

  // Developers list (for analytics)
  await page.route(`${API_BASE}/developers`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockDevelopers),
    });
  });

  // Teams (for analytics)
  await page.route(`${API_BASE}/workspaces/ws-1/teams**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockTeams),
    });
  });

  // Team gap analysis
  await page.route(`${API_BASE}/workspaces/ws-1/hiring/team-gaps**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        skill_gaps: [
          {
            skill: "Kubernetes",
            gap_severity: "critical",
            current_coverage: 0.1,
            average_proficiency: 20,
          },
          {
            skill: "Rust",
            gap_severity: "moderate",
            current_coverage: 0.3,
            average_proficiency: 40,
          },
        ],
        bus_factor_risks: [
          {
            skill_or_area: "Database Migrations",
            risk_level: "high",
            impact_description: "Only one developer handles migrations",
            developer_name: "Alice Johnson",
            mitigation_suggestion: "Cross-train team members on migration workflows",
          },
        ],
      }),
    });
  });
}

// ── Test Suites ────────────────────────────────────────────────────────────────

// ---- 1. HIRING DASHBOARD ----

test.describe("Hiring Dashboard — Overview", () => {
  test.beforeEach(async ({ page }) => {
    await setupHiringMocks(page);
    await page.goto("/hiring/dashboard");
    await page.waitForSelector("text=Hiring Dashboard", { timeout: 45000 });
  });

  test("renders the hiring dashboard with heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Hiring Dashboard" })).toBeVisible();
  });

  test("shows quick stats cards", async ({ page }) => {
    await expect(page.getByText("Open Positions")).toBeVisible();
    await expect(page.getByText("Total Candidates")).toBeVisible();
    await expect(page.getByText("Completed")).toBeVisible();
    await expect(page.getByText("Completion Rate")).toBeVisible();
  });

  test("shows correct stat values", async ({ page }) => {
    // 2 active requirements
    await expect(page.getByText("2").first()).toBeVisible();
    // 48 candidates
    await expect(page.getByText("48")).toBeVisible();
    // 32 completed
    await expect(page.getByText("32")).toBeVisible();
    // 67% rate
    await expect(page.getByText("67%")).toBeVisible();
  });

  test("shows quick action cards", async ({ page }) => {
    await expect(page.getByText("Add Candidate")).toBeVisible();
    await expect(page.getByText("Create Assessment")).toBeVisible();
    await expect(page.getByText("View Analytics")).toBeVisible();
  });

  test("shows Recent Assessments section", async ({ page }) => {
    await expect(page.getByText("Recent Assessments")).toBeVisible();
    await expect(page.getByText("React Frontend Assessment")).toBeVisible();
    await expect(page.getByText("Python Backend Assessment")).toBeVisible();
  });

  test("shows Open Positions section", async ({ page }) => {
    await expect(page.getByText("Open Positions")).toBeVisible();
    await expect(page.getByText("Senior Frontend Engineer")).toBeVisible();
    await expect(page.getByText("Backend Developer")).toBeVisible();
  });

  test("shows Hiring Funnel section", async ({ page }) => {
    await expect(page.getByText("Hiring Funnel")).toBeVisible();
    await expect(page.getByText("Applied")).toBeVisible();
    await expect(page.getByText("Hired")).toBeVisible();
  });

  test("does not display closed positions in Open Positions", async ({ page }) => {
    // DevOps Engineer has status "closed" - should not appear in Open Positions list
    const openPositionsSection = page.locator("text=Open Positions").locator("..");
    // The closed DevOps Engineer requirement should not appear
    await expect(page.getByText("DevOps Engineer")).not.toBeVisible();
  });

  test("hiring funnel shows all 6 pipeline stages", async ({ page }) => {
    await expect(page.getByText("Applied")).toBeVisible();
    await expect(page.getByText("Screening")).toBeVisible();
    await expect(page.getByText("Assessment")).toBeVisible();
    await expect(page.getByText("Interview")).toBeVisible();
    await expect(page.getByText("Offer")).toBeVisible();
    await expect(page.getByText("Hired")).toBeVisible();
  });

  test("quick action links have correct hrefs", async ({ page }) => {
    const addCandidateLink = page.locator('a:has-text("Add Candidate")');
    await expect(addCandidateLink).toHaveAttribute("href", "/hiring/candidates");

    const createAssessmentLink = page.locator('a:has-text("Create Assessment")');
    await expect(createAssessmentLink).toHaveAttribute("href", "/hiring/assessments/new");

    const viewAnalyticsLink = page.locator('a:has-text("View Analytics")');
    await expect(viewAnalyticsLink).toHaveAttribute("href", "/hiring/analytics");
  });
});

// ---- 2. ASSESSMENTS PAGE ----

test.describe("Assessments Page — List & Management", () => {
  test.beforeEach(async ({ page }) => {
    await setupHiringMocks(page);
    await page.goto("/hiring/assessments");
    await page.waitForSelector("text=Assessments", { timeout: 45000 });
  });

  test("renders assessments page heading and description", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Assessments" })).toBeVisible();
    await expect(
      page.getByText("Create and manage technical assessments for candidates")
    ).toBeVisible();
  });

  test("shows metric cards with correct values", async ({ page }) => {
    await expect(page.getByText("Total Candidates")).toBeVisible();
    await expect(page.getByText("Total Tests")).toBeVisible();
    await expect(page.getByText("Unique Attempts")).toBeVisible();
    await expect(page.getByText("Attempt Rate")).toBeVisible();
  });

  test("lists all assessments as cards", async ({ page }) => {
    await expect(page.getByText("React Frontend Assessment")).toBeVisible();
    await expect(page.getByText("Python Backend Assessment")).toBeVisible();
    await expect(page.getByText("System Design")).toBeVisible();
  });

  test("assessment cards show status badges", async ({ page }) => {
    // Active assessments
    const activeBadges = page.locator("text=Active");
    await expect(activeBadges.first()).toBeVisible();

    // Draft assessment
    await expect(page.getByText("Draft")).toBeVisible();
  });

  test("assessment cards show question count and duration", async ({ page }) => {
    // Questions column
    await expect(page.getByText("Questions").first()).toBeVisible();
    // Duration column
    await expect(page.getByText("Duration").first()).toBeVisible();
    // The card shows "60 min" for React Frontend Assessment
    await expect(page.getByText("60 min")).toBeVisible();
  });

  test("assessment cards show candidate counts", async ({ page }) => {
    // React Frontend Assessment: 10/15
    await expect(page.getByText("10/15")).toBeVisible();
    // Python Backend Assessment: 18/22
    await expect(page.getByText("18/22")).toBeVisible();
  });

  test("search input is present and functional", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Search assessments...");
    await expect(searchInput).toBeVisible();
    await searchInput.fill("React");
    // Verify the search value was set
    await expect(searchInput).toHaveValue("React");
  });

  test("status filter dropdown has all options", async ({ page }) => {
    const select = page.locator("select").first();
    await expect(select).toBeVisible();
    await expect(page.locator("option", { hasText: "All Status" })).toBeAttached();
    await expect(page.locator("option", { hasText: "Draft" })).toBeAttached();
    await expect(page.locator("option", { hasText: "Active" })).toBeAttached();
    await expect(page.locator("option", { hasText: "Completed" })).toBeAttached();
    await expect(page.locator("option", { hasText: "Archived" })).toBeAttached();
  });

  test("Create Assessment button opens modal", async ({ page }) => {
    await page.getByRole("button", { name: "Create Assessment" }).click();
    await expect(page.getByText("Create New Assessment")).toBeVisible();
    await expect(page.getByLabel("Assessment Title")).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create" })).toBeVisible();
  });

  test("create assessment modal can be dismissed with Cancel", async ({ page }) => {
    await page.getByRole("button", { name: "Create Assessment" }).click();
    await expect(page.getByText("Create New Assessment")).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText("Create New Assessment")).not.toBeVisible();
  });

  test("create assessment button is disabled when title is empty", async ({ page }) => {
    await page.getByRole("button", { name: "Create Assessment" }).click();
    const createBtn = page.locator("button", { hasText: "Create" }).last();
    await expect(createBtn).toBeDisabled();
  });

  test("draft assessment shows Continue Editing link", async ({ page }) => {
    await expect(page.getByText("Continue Editing")).toBeVisible();
  });

  test("active assessment shows View Details link", async ({ page }) => {
    const viewDetailsLinks = page.locator("text=View Details");
    await expect(viewDetailsLinks.first()).toBeVisible();
  });

  test("shows pagination info when assessments exist", async ({ page }) => {
    await expect(page.getByText(/Showing \d+ of \d+ assessments/)).toBeVisible();
  });
});

// ---- 3. CANDIDATES PAGE ----

test.describe("Candidates Page — Pipeline View", () => {
  test.beforeEach(async ({ page }) => {
    await setupHiringMocks(page);
    await page.goto("/hiring/candidates");
    await page.waitForSelector("text=Candidate Pipeline", { timeout: 45000 });
  });

  test("renders the candidates page with heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Candidate Pipeline" })).toBeVisible();
  });

  test("shows candidate count in subtitle", async ({ page }) => {
    await expect(page.getByText(/\d+ candidates in pipeline/)).toBeVisible();
  });

  test("shows Add Candidate button", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Add Candidate" })).toBeVisible();
  });

  test("search input is present", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Search candidates...");
    await expect(searchInput).toBeVisible();
  });

  test("stage filter dropdown has all stages", async ({ page }) => {
    await expect(page.locator("option", { hasText: "All Stages" })).toBeAttached();
    await expect(page.locator("option", { hasText: "Applied" })).toBeAttached();
    await expect(page.locator("option", { hasText: "Screening" })).toBeAttached();
    await expect(page.locator("option", { hasText: "Assessment" })).toBeAttached();
    await expect(page.locator("option", { hasText: "Interview" })).toBeAttached();
    await expect(page.locator("option", { hasText: "Offer" })).toBeAttached();
    await expect(page.locator("option", { hasText: "Hired" })).toBeAttached();
    await expect(page.locator("option", { hasText: "Rejected" })).toBeAttached();
  });

  test("kanban board shows stage columns", async ({ page }) => {
    // Default view is kanban - stage column headers should appear
    await expect(page.getByText("Applied").first()).toBeVisible();
    await expect(page.getByText("Screening").first()).toBeVisible();
    await expect(page.getByText("Interview").first()).toBeVisible();
    await expect(page.getByText("Hired").first()).toBeVisible();
  });

  test("candidate cards display names", async ({ page }) => {
    await expect(page.getByText("Alice Johnson")).toBeVisible();
    await expect(page.getByText("Bob Smith")).toBeVisible();
    await expect(page.getByText("Carol Davis")).toBeVisible();
    await expect(page.getByText("David Lee")).toBeVisible();
  });

  test("Add Candidate button opens modal", async ({ page }) => {
    await page.getByRole("button", { name: "Add Candidate" }).click();
    await expect(page.getByRole("heading", { name: "Add Candidate" })).toBeVisible();
    await expect(page.getByPlaceholder("Enter candidate name")).toBeVisible();
    await expect(page.getByPlaceholder("candidate@example.com")).toBeVisible();
  });

  test("add candidate modal has source dropdown", async ({ page }) => {
    await page.getByRole("button", { name: "Add Candidate" }).click();
    await expect(page.locator("option", { hasText: "LinkedIn" })).toBeAttached();
    await expect(page.locator("option", { hasText: "Referral" })).toBeAttached();
    await expect(page.locator("option", { hasText: "Direct" })).toBeAttached();
    await expect(page.locator("option", { hasText: "Job Board" })).toBeAttached();
  });

  test("add candidate modal can be closed", async ({ page }) => {
    await page.getByRole("button", { name: "Add Candidate" }).click();
    await expect(page.getByRole("heading", { name: "Add Candidate" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("heading", { name: "Add Candidate" })).not.toBeVisible();
  });
});

// ---- 4. CANDIDATE DETAIL PAGE ----

test.describe("Candidate Detail Page", () => {
  test.beforeEach(async ({ page }) => {
    await setupHiringMocks(page);
    await page.goto("/hiring/candidates/cand-1");
    await page.waitForSelector("text=Sarah Chen", { timeout: 45000 });
  });

  test("renders candidate name and role", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Sarah Chen" })).toBeVisible();
    await expect(page.getByText("Senior Frontend Engineer")).toBeVisible();
  });

  test("shows pipeline progress timeline", async ({ page }) => {
    await expect(page.getByText("Pipeline Progress")).toBeVisible();
  });

  test("shows back to pipeline link", async ({ page }) => {
    await expect(page.getByText("Back to Pipeline")).toBeVisible();
  });

  test("shows candidate action buttons", async ({ page }) => {
    await expect(page.getByText("Send Assessment")).toBeVisible();
    await expect(page.getByText("Schedule Interview")).toBeVisible();
    await expect(page.getByText("Send Email")).toBeVisible();
    await expect(page.getByText("Move Forward")).toBeVisible();
    await expect(page.getByText("Reject")).toBeVisible();
  });

  test("shows tabs for Overview, Activity, Assessments, Notes", async ({ page }) => {
    await expect(page.getByText("Overview")).toBeVisible();
    await expect(page.getByText("Activity")).toBeVisible();
    await expect(page.getByText("Assessments")).toBeVisible();
    await expect(page.getByText("Notes")).toBeVisible();
  });

  test("shows contact information sidebar", async ({ page }) => {
    await expect(page.getByText("Contact Information")).toBeVisible();
    await expect(page.getByText("sarah.chen@example.com")).toBeVisible();
    await expect(page.getByText("+1 (555) 123-4567")).toBeVisible();
    await expect(page.getByText("LinkedIn Profile")).toBeVisible();
  });

  test("shows application details sidebar", async ({ page }) => {
    await expect(page.getByText("Application Details")).toBeVisible();
    await expect(page.getByText("LinkedIn").last()).toBeVisible();
  });

  test("shows documents section", async ({ page }) => {
    await expect(page.getByText("Documents")).toBeVisible();
    await expect(page.getByText("Resume.pdf")).toBeVisible();
  });

  test("overview tab shows candidate information by default", async ({ page }) => {
    await expect(page.getByText("Candidate Information")).toBeVisible();
    await expect(page.getByText("Current Position")).toBeVisible();
    await expect(page.getByText("TechCorp Inc.")).toBeVisible();
    await expect(page.getByText("8 years")).toBeVisible();
    await expect(page.getByText("MS Computer Science, Stanford University")).toBeVisible();
    await expect(page.getByText("San Francisco, CA")).toBeVisible();
  });

  test("clicking Activity tab shows activity timeline", async ({ page }) => {
    await page.getByText("Activity").click();
    await expect(page.getByText("Activity Timeline")).toBeVisible();
    await expect(page.getByText("Technical Interview Completed")).toBeVisible();
    await expect(page.getByText("Assessment Completed")).toBeVisible();
    await expect(page.getByText("Application Received")).toBeVisible();
  });
});

// ---- 5. QUESTION BANK PAGE ----

test.describe("Question Bank Page", () => {
  test.beforeEach(async ({ page }) => {
    await setupHiringMocks(page);
    await page.goto("/hiring/questions");
    await page.waitForSelector("text=Question Bank", { timeout: 45000 });
  });

  test("renders question bank heading and description", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Question Bank" })).toBeVisible();
    await expect(
      page.getByText("View and manage all assessment questions across your organization")
    ).toBeVisible();
  });

  test("shows metric summary cards", async ({ page }) => {
    await expect(page.getByText("Total Questions")).toBeVisible();
    await expect(page.getByText("Avg Score")).toBeVisible();
    await expect(page.getByText("Avg Time")).toBeVisible();
    await expect(page.getByText("AI Generated")).toBeVisible();
  });

  test("shows search input for questions", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Search questions...");
    await expect(searchInput).toBeVisible();
  });

  test("has type filter dropdown", async ({ page }) => {
    await expect(page.locator("option", { hasText: "All Types" })).toBeAttached();
    await expect(page.locator("option", { hasText: "Multiple Choice" })).toBeAttached();
    await expect(page.locator("option", { hasText: "Coding" })).toBeAttached();
    await expect(page.locator("option", { hasText: "Short Answer" })).toBeAttached();
    await expect(page.locator("option", { hasText: "Essay" })).toBeAttached();
  });

  test("has difficulty filter dropdown", async ({ page }) => {
    await expect(page.locator("option", { hasText: "All Difficulties" })).toBeAttached();
    await expect(page.locator("option", { hasText: "Easy" })).toBeAttached();
    await expect(page.locator("option", { hasText: "Medium" })).toBeAttached();
    await expect(page.locator("option", { hasText: "Hard" })).toBeAttached();
  });

  test("has Show Deleted toggle", async ({ page }) => {
    await expect(page.getByText("Show Deleted")).toBeVisible();
  });

  test("questions table shows column headers", async ({ page }) => {
    await expect(page.getByText("Question").first()).toBeVisible();
    await expect(page.getByText("Type").first()).toBeVisible();
    await expect(page.getByText("Difficulty").first()).toBeVisible();
    await expect(page.getByText("Attempts").first()).toBeVisible();
    await expect(page.getByText("Avg Score").first()).toBeVisible();
    await expect(page.getByText("Avg Time").first()).toBeVisible();
  });

  test("shows Back to Assessments link", async ({ page }) => {
    await expect(page.getByText("Back to Assessments")).toBeVisible();
  });

  test("has select-all checkbox", async ({ page }) => {
    const selectAllCheckbox = page.locator("thead input[type='checkbox']");
    await expect(selectAllCheckbox).toBeVisible();
  });
});

// ---- 6. ANALYTICS PAGE ----

test.describe("Hiring Analytics Page", () => {
  test.beforeEach(async ({ page }) => {
    await setupHiringMocks(page);
    await page.goto("/hiring/analytics");
    await page.waitForSelector("text=Hiring Analytics", { timeout: 45000 });
  });

  test("renders analytics page heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Hiring Analytics" })).toBeVisible();
  });

  test("shows Code-Based Intelligence section", async ({ page }) => {
    await expect(page.getByText("Code-Based Intelligence")).toBeVisible();
  });

  test("shows Project Skill Gaps section", async ({ page }) => {
    await expect(page.getByText("Project Skill Gaps")).toBeVisible();
    await expect(
      page.getByText('Click "Analyze Project" to identify skill gaps')
    ).toBeVisible();
  });

  test("shows Bus Factor Risks section", async ({ page }) => {
    await expect(page.getByText("Bus Factor Risks")).toBeVisible();
    await expect(page.getByText("Run analysis to identify bus factor risks")).toBeVisible();
  });

  test("shows Hiring Requirements section", async ({ page }) => {
    await expect(page.getByText("Hiring Requirements")).toBeVisible();
    await expect(page.getByText("Senior Frontend Engineer")).toBeVisible();
    await expect(page.getByText("Backend Developer")).toBeVisible();
  });

  test("shows Hiring Funnel Analytics section", async ({ page }) => {
    await expect(page.getByText("Hiring Funnel Analytics")).toBeVisible();
  });

  test("shows Performance Metrics section", async ({ page }) => {
    await expect(page.getByText("Performance Metrics")).toBeVisible();
    await expect(page.getByText("Avg. Time to Hire")).toBeVisible();
    await expect(page.getByText("Assessment Pass Rate")).toBeVisible();
    await expect(page.getByText("Offer Accept Rate")).toBeVisible();
    await expect(page.getByText("Avg. Cost per Hire")).toBeVisible();
  });

  test("shows Source Effectiveness section", async ({ page }) => {
    await expect(page.getByText("Source Effectiveness")).toBeVisible();
    await expect(page.getByText("LinkedIn").first()).toBeVisible();
    await expect(page.getByText("Referrals")).toBeVisible();
    await expect(page.getByText("Job Boards")).toBeVisible();
  });

  test("shows team selector dropdown", async ({ page }) => {
    await expect(page.locator("option", { hasText: "All Projects" })).toBeAttached();
  });

  test("shows Analyze button", async ({ page }) => {
    const analyzeBtn = page.locator("button", { hasText: /Analyze/ });
    await expect(analyzeBtn).toBeVisible();
  });

  test("requirement details panel shows placeholder when none selected", async ({ page }) => {
    await expect(
      page.getByText("Select a requirement to generate JD or rubric")
    ).toBeVisible();
  });
});

// ---- 7. TEMPLATES PAGE ----

test.describe("Templates Page", () => {
  test.beforeEach(async ({ page }) => {
    await setupHiringMocks(page);
    await page.goto("/hiring/templates");
    await page.waitForSelector("text=Hiring Templates", { timeout: 45000 });
  });

  test("renders templates page heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Hiring Templates" })).toBeVisible();
  });

  test("shows template count", async ({ page }) => {
    await expect(page.getByText(/\d+ templates available/)).toBeVisible();
  });

  test("shows Create Template button", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Create Template" })).toBeVisible();
  });

  test("shows search input for templates", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Search templates...");
    await expect(searchInput).toBeVisible();
  });

  test("shows type filter buttons", async ({ page }) => {
    await expect(page.getByRole("button", { name: "All" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Job Description" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Interview Rubric" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Email Template" })).toBeVisible();
  });

  test("displays template cards grouped by type", async ({ page }) => {
    // Job Descriptions section
    await expect(page.getByText("Job Descriptions")).toBeVisible();
    await expect(page.getByText("Senior Frontend Engineer JD")).toBeVisible();
    await expect(page.getByText("Backend Developer JD")).toBeVisible();

    // Interview Rubrics section
    await expect(page.getByText("Interview Rubrics")).toBeVisible();
    await expect(page.getByText("Technical Interview Rubric")).toBeVisible();
    await expect(page.getByText("Behavioral Interview Rubric")).toBeVisible();

    // Email Templates section
    await expect(page.getByText("Email Templates")).toBeVisible();
    await expect(page.getByText("Assessment Invitation")).toBeVisible();
    await expect(page.getByText("Interview Confirmation")).toBeVisible();
    await expect(page.getByText("Offer Letter Template")).toBeVisible();
  });

  test("Create Template button opens modal", async ({ page }) => {
    await page.getByRole("button", { name: "Create Template" }).click();
    await expect(page.getByRole("heading", { name: "Create Template" })).toBeVisible();
    await expect(page.getByText("Template Type")).toBeVisible();
    await expect(page.getByPlaceholder("e.g., Senior Engineer JD")).toBeVisible();
  });

  test("create template modal has type selector", async ({ page }) => {
    await page.getByRole("button", { name: "Create Template" }).click();
    // The modal type selector shows three options
    await expect(page.getByText("Job Description").last()).toBeVisible();
    await expect(page.getByText("Interview Rubric").last()).toBeVisible();
    await expect(page.getByText("Email Template").last()).toBeVisible();
  });

  test("create template modal can be dismissed", async ({ page }) => {
    await page.getByRole("button", { name: "Create Template" }).click();
    await expect(page.getByRole("heading", { name: "Create Template" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("heading", { name: "Create Template" })).not.toBeVisible();
  });
});

// ---- 8. ASSESSMENT REPORT PAGE ----

test.describe("Assessment Report Page", () => {
  test.beforeEach(async ({ page }) => {
    await setupHiringMocks(page);
    await page.goto("/hiring/assessments/assess-1/report");
    await page.waitForSelector("text=React Frontend Assessment", { timeout: 45000 });
  });

  test("renders assessment title and designation", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "React Frontend Assessment" })
    ).toBeVisible();
    await expect(page.getByText("Frontend Engineer")).toBeVisible();
  });

  test("shows report metric cards", async ({ page }) => {
    await expect(page.getByText("Total Candidates")).toBeVisible();
    await expect(page.getByText("Completed").first()).toBeVisible();
    await expect(page.getByText("Average Score")).toBeVisible();
    await expect(page.getByText("Avg Time")).toBeVisible();
  });

  test("shows Export Report button", async ({ page }) => {
    await expect(page.getByText("Export Report")).toBeVisible();
  });

  test("shows Score Distribution chart", async ({ page }) => {
    await expect(page.getByText("Score Distribution")).toBeVisible();
  });

  test("shows Quick Stats panel", async ({ page }) => {
    await expect(page.getByText("Quick Stats")).toBeVisible();
    await expect(page.getByText("Highest Score")).toBeVisible();
    await expect(page.getByText("Lowest Score")).toBeVisible();
    await expect(page.getByText("Passing Rate (60%+)")).toBeVisible();
    await expect(page.getByText("Completion Rate").first()).toBeVisible();
  });

  test("shows Candidates table with headers", async ({ page }) => {
    await expect(page.getByText("Candidate").first()).toBeVisible();
    await expect(page.getByText("Status").first()).toBeVisible();
    await expect(page.getByText("Score").first()).toBeVisible();
    await expect(page.getByText("Trust Score")).toBeVisible();
    await expect(page.getByText("Time").first()).toBeVisible();
  });

  test("shows candidate search and filter controls", async ({ page }) => {
    await expect(page.getByPlaceholder("Search candidates...")).toBeVisible();
    await expect(page.locator("option", { hasText: "All Status" })).toBeAttached();
    await expect(page.locator("option", { hasText: "Sort by Date" })).toBeAttached();
    await expect(page.locator("option", { hasText: "Sort by Score" })).toBeAttached();
    await expect(page.locator("option", { hasText: "Sort by Name" })).toBeAttached();
  });

  test("shows back to assessments link", async ({ page }) => {
    const backLink = page.locator("a[href='/hiring/assessments']");
    await expect(backLink).toBeVisible();
  });
});

// ---- 9. NEW ASSESSMENT PAGE (CREATE FLOW) ----

test.describe("New Assessment Page", () => {
  test("shows creating assessment spinner", async ({ page }) => {
    await setupHiringMocks(page);

    // The new assessment page auto-creates and redirects, so we just verify the loading state
    await page.goto("/hiring/assessments/new");
    await expect(page.getByText("Creating assessment...")).toBeVisible({ timeout: 30000 });
  });
});
