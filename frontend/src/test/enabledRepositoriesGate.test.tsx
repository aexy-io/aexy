/**
 * The gate on the insights page, which is the same bug as the docs pickers with
 * a worse consequence.
 *
 * `hasEnabledRepos` came from `/repositories?enabled_only=true` — the
 * per-developer table, which adoption writes a row in only for the adopter. So a
 * colleague who had not adopted anything was told "you haven't enabled any
 * repositories yet" while the page hid every metric that existed and that
 * everyone else could see. A picker showing the wrong list is an annoyance; a
 * gate reading the wrong list withholds the product.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useEnabledRepositories } from "@/hooks/useRepositories";

const listWorkspaceRepositories = vi.fn();
const getInstallationStatus = vi.fn();
const listRepositories = vi.fn();

vi.mock("@/lib/api", () => ({
  repositoriesApi: {
    getInstallationStatus: (...args: unknown[]) => getInstallationStatus(...args),
    listRepositories: (...args: unknown[]) => listRepositories(...args),
  },
  workspaceRepositoriesApi: {
    list: (...args: unknown[]) => listWorkspaceRepositories(...args),
  },
}));

const adoption = (overrides: Record<string, unknown> = {}) => ({
  id: "wr-1",
  is_active: true,
  repository: {
    id: "repo-1",
    name: "widgets",
    full_name: "acme/widgets",
    description: null,
    is_private: false,
    language: "TypeScript",
  },
  ...overrides,
});

function render(workspaceId: string | null = "ws-1") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderHook(() => useEnabledRepositories(workspaceId), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

describe("useEnabledRepositories", () => {
  beforeEach(() => {
    listWorkspaceRepositories.mockReset();
    getInstallationStatus.mockReset();
    listRepositories.mockReset();
    getInstallationStatus.mockResolvedValue({
      has_installation: false,
      install_url: "https://github.com/apps/aexy",
    });
  });

  it("reports the workspace's adoptions to a member who adopted nothing", async () => {
    // The defect, exactly: no personal installation, no personal repository
    // rows, and a workspace that has adopted one.
    listWorkspaceRepositories.mockResolvedValue([adoption()]);
    const { result } = render();

    await waitFor(() => expect(result.current.hasEnabledRepos).toBe(true));
    expect(result.current.hasInstallation).toBe(false);
    expect(listWorkspaceRepositories).toHaveBeenCalledWith("ws-1");
  });

  it("never asks the per-developer endpoint", async () => {
    listWorkspaceRepositories.mockResolvedValue([adoption()]);
    const { result } = render();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(listRepositories).not.toHaveBeenCalled();
  });

  it("does not wait on the installation check at all", async () => {
    // The adoption query used to be `enabled` only once the *caller's*
    // installation status came back true, so for everyone else it never ran and
    // the answer was permanently "nothing adopted". Here that check never
    // resolves, and the adoption answer still arrives.
    getInstallationStatus.mockReturnValue(new Promise(() => {}));
    listWorkspaceRepositories.mockResolvedValue([adoption()]);
    const { result } = render();

    await waitFor(() => expect(result.current.hasEnabledRepos).toBe(true));
  });

  it("treats an adoption an admin paused as absent", async () => {
    listWorkspaceRepositories.mockResolvedValue([adoption({ is_active: false })]);
    const { result } = render();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasEnabledRepos).toBe(false);
  });

  it("reads as not-yet-known before a workspace resolves", async () => {
    const { result } = render(null);

    await waitFor(() => expect(getInstallationStatus).toHaveBeenCalled());
    // Not "nothing adopted": asking without a workspace is a question that has
    // no answer yet, and answering `false` would flash the empty state.
    expect(listWorkspaceRepositories).not.toHaveBeenCalled();
    expect(result.current.hasEnabledRepos).toBe(false);
  });
});

describe("the insights page's two prompts", () => {
  const source = readFileSync(
    resolve(__dirname, "../app/(app)/insights/page.tsx"),
    "utf8"
  );

  it("passes the workspace, or the hook cannot answer", () => {
    expect(source).toMatch(/useEnabledRepositories\(currentWorkspaceId\)/);
  });

  it("only asks somebody to install the app when there is nothing to show", () => {
    // Shown on `!hasInstallation` alone, it asked a reader to install an app
    // their workspace already had, and hid insights that existed.
    expect(source).toMatch(/!hasEnabledRepos && !hasInstallation/);
  });

  it("states the empty case as a workspace fact, not a personal one", () => {
    expect(source).toMatch(/this workspace has not adopted any repositories/);
    expect(source).not.toMatch(/you haven&apos;t enabled any repositories/);
  });
});
