import { readFileSync } from "node:fs";
import path from "node:path";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import MonthlyEngineeringReportPage from "@/app/(app)/reports/monthly/page";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  isAdmin: true,
  report: null as unknown,
  refresh: vi.fn(),
  loadError: null as unknown,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("@/hooks/useWorkspace", () => ({
  useWorkspace: () => ({
    currentWorkspace: { id: "ws-1", name: "Platform" },
    currentWorkspaceId: "ws-1",
  }),
  useIsWorkspaceAdmin: () => ({ isWorkspaceAdmin: mocks.isAdmin, isLoading: false }),
}));

vi.mock("@/lib/api", () => ({
  reportsApi: {
    getMonthlyEngineeringReport: () =>
      mocks.loadError ? Promise.reject(mocks.loadError) : Promise.resolve(mocks.report),
    getMonthlyEngineeringReportMarkdown: () => Promise.resolve("# report"),
    // Delegated rather than passed by reference: `beforeEach` swaps in a fresh
    // spy, and a direct reference would keep pointing at the original.
    refreshMonthlyEngineeringReportData: (workspaceId: string) =>
      mocks.refresh(workspaceId),
  },
}));

function baseReport(overrides: Record<string, unknown> = {}) {
  return {
    workspace_id: "ws-1",
    workspace_name: "Platform",
    month: "2026-07",
    period_start: "2026-06-30T18:30:00Z",
    period_end: "2026-07-31T18:30:00Z",
    timezone_name: "Asia/Kolkata",
    contributors: 2,
    commits: 9,
    commits_before_dedup: 11,
    ported_commits: 2,
    bot_commits_excluded: 4,
    merge_commits_excluded: 3,
    prs_merged: 5,
    source_additions: 1200,
    source_deletions: 300,
    active_repositories: 2,
    active_days: 12,
    scope_departments: [],
    members: [
      {
        developer_id: "d1",
        name: "Mobashir Raza",
        commits: 6,
        source_additions: 800,
        source_deletions: 200,
        prs_authored: 1,
        prs_merged_by_them: 5,
        reviews_given: 3,
        active_days: 8,
        repositories: ["acme/codebase-v2"],
        low_signal_subjects: 0,
        reverts: 0,
        ported_commits: 2,
      },
      {
        developer_id: "d2",
        name: "Ritesh Biswas",
        commits: 3,
        source_additions: 400,
        source_deletions: 100,
        prs_authored: 4,
        prs_merged_by_them: 0,
        reviews_given: 0,
        active_days: 4,
        repositories: ["acme/codebase-v2", "acme/infra"],
        low_signal_subjects: 2,
        reverts: 1,
        ported_commits: 0,
      },
    ],
    repositories: [
      {
        full_name: "acme/codebase-v2",
        commits: 8,
        source_additions: 1100,
        source_deletions: 280,
        contributors: [["Mobashir Raza", 6] as [string, number]],
        last_synced_at: "2026-08-02T00:00:00Z",
      },
    ],
    repository_sync_state: [
      {
        repository_id: "r1",
        full_name: "acme/codebase-v2",
        sync_status: "synced",
        last_synced_at: "2026-08-02T00:00:00Z",
        covers_period: true,
        has_adopter: true,
      },
    ],
    observations: ["**Concentration.** acme/codebase-v2 absorbed 88% of all commits."],
    limitations: ["7 commits have no content fingerprint."],
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;

async function render() {
  await act(async () => {
    root.render(<MonthlyEngineeringReportPage />);
  });
  // Let the initial fetch settle.
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  mocks.isAdmin = true;
  mocks.report = baseReport();
  mocks.loadError = null;
  mocks.refresh = vi.fn(() =>
    Promise.resolve({ queued: ["acme/codebase-v2"], already_running: [], no_adopter: [], failed: [] })
  );
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe("Monthly engineering report page", () => {
  it("shows the figures and attributes merges to the merger", async () => {
    await render();
    const text = container.textContent ?? "";

    expect(text).toContain("Mobashir Raza");
    expect(text).toContain("Ritesh Biswas");
    // Mobashir merged 5 and wrote 1; the table must not conflate the two.
    const mobashirRow = Array.from(container.querySelectorAll("tbody tr")).find((row) =>
      row.textContent?.includes("Mobashir Raza")
    );
    const cells = Array.from(mobashirRow?.querySelectorAll("td") ?? []).map(
      (cell) => cell.textContent
    );
    expect(cells).toEqual(["Mobashir Raza", "6", "67%", "800", "200", "1", "5", "3", "8", "1"]);
  });

  it("always shows what it could not measure", async () => {
    await render();
    expect(container.textContent).toContain("7 commits have no content fingerprint.");
  });

  it("offers a sync when a repository has not caught up, to an admin", async () => {
    mocks.report = baseReport({
      repository_sync_state: [
        {
          repository_id: "r1",
          full_name: "acme/infra",
          sync_status: "pending",
          last_synced_at: null,
          covers_period: false,
          has_adopter: true,
        },
      ],
    });
    await render();

    const panel = container.querySelector('[data-testid="freshness-panel"]');
    expect(panel?.textContent).toContain("acme/infra");
    const button = Array.from(panel?.querySelectorAll("button") ?? [])[0];
    expect(button).toBeDefined();

    await act(async () => button.click());
    expect(mocks.refresh).toHaveBeenCalledWith("ws-1");
  });

  it("tells a non-admin why they cannot sync instead of hiding the state", async () => {
    mocks.isAdmin = false;
    mocks.report = baseReport({
      repository_sync_state: [
        {
          repository_id: "r1",
          full_name: "acme/infra",
          sync_status: "pending",
          last_synced_at: null,
          covers_period: false,
          has_adopter: true,
        },
      ],
    });
    await render();

    const panel = container.querySelector('[data-testid="freshness-panel"]');
    expect(panel?.textContent).toContain("freshness.syncAdminOnly");
    expect(panel?.querySelectorAll("button")).toHaveLength(0);
  });

  it("says whose numbers these are when the report is a department's", async () => {
    mocks.report = baseReport({ scope_departments: ["Platform"] });
    await render();

    expect(container.textContent).toContain("scope.title");
    expect(container.textContent).toContain("scope.body");
  });

  it("says nothing about scope on a workspace-wide report", async () => {
    await render();
    expect(container.textContent).not.toContain("scope.title");
  });

  it("says so plainly when the reader is not allowed to see it", async () => {
    // Admins and department heads only — for everyone else this is the normal
    // answer, not a fault, and it must not read as a broken page.
    mocks.loadError = { response: { status: 403 } };
    await render();

    expect(container.textContent).toContain("forbidden.title");
    expect(container.textContent).not.toContain("loadFailed");
    expect(container.querySelector("table")).toBeNull();
  });

  it("still reports a genuine failure as a failure", async () => {
    mocks.loadError = { response: { status: 500 } };
    await render();

    expect(container.textContent).toContain("loadFailed");
    expect(container.textContent).not.toContain("forbidden.title");
  });

  it("says a quiet month is quiet rather than rendering an empty table", async () => {
    mocks.report = baseReport({
      commits: 0,
      members: [],
      repositories: [],
      observations: [],
    });
    await render();

    expect(container.textContent).toContain("empty.title");
    expect(container.querySelector("tbody")).toBeNull();
  });
});

/** Every key the page asks for has to exist in both locales, or next-intl
 *  throws at render in the one that is missing it. The identity mock above
 *  cannot catch that, so check the message files directly. */
describe("Monthly report translations", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/app/(app)/reports/monthly/page.tsx"),
    "utf8"
  );
  const keys = Array.from(source.matchAll(/\bt\("([^"]+)"/g)).map((match) => match[1]);
  const locales = ["en", "hi"] as const;

  function lookup(messages: Record<string, unknown>, dotted: string): unknown {
    return dotted
      .split(".")
      .reduce<unknown>(
        (node, part) =>
          node && typeof node === "object"
            ? (node as Record<string, unknown>)[part]
            : undefined,
        messages
      );
  }

  it.each(locales)("%s has every key the page uses", (locale) => {
    const messages = JSON.parse(
      readFileSync(path.join(process.cwd(), `messages/${locale}.json`), "utf8")
    ) as Record<string, unknown>;
    const namespace = (messages as Record<string, Record<string, unknown>>).reportsMonthly;

    expect(namespace, `${locale} is missing the reportsMonthly namespace`).toBeDefined();
    expect(keys.length).toBeGreaterThan(20);
    const missing = keys.filter((key) => lookup(namespace, key) === undefined);
    expect(missing).toEqual([]);
  });
});
