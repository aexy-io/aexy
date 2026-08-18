/**
 * Whether Aexy writes into a workspace's pull requests.
 *
 * The things worth asserting are the ones a reader could get wrong:
 *
 * * both GitHub toggles start off — a deploy must not begin commenting on
 *   somebody's pull requests;
 * * the copy says out loud that this is not a personal preference, because an
 *   author who dislikes bot comments genuinely cannot opt out;
 * * a refused App permission shows as a banner here, where the person who can
 *   grant it is — not as a notification to the pull request author, who cannot.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DocImpactSettings } from "@/components/settings/DocImpactSettings";
import type { DocImpactSettings as Settings } from "@/lib/api";

const getSettings = vi.fn();
const updateSettings = vi.fn();

vi.mock("@/lib/api", () => ({
  docImpactApi: {
    getSettings: (...args: unknown[]) => getSettings(...args),
    updateSettings: (...args: unknown[]) => updateSettings(...args),
  },
}));

function settings(overrides: Partial<Settings> = {}): Settings {
  return {
    enabled: true,
    pr_comment_enabled: false,
    check_run_enabled: false,
    check_run_conclusion: "neutral",
    github_write_block_reason: null,
    github_write_blocked_at: null,
    ...overrides,
  };
}

function renderPanel(current = settings(), canEdit = true) {
  getSettings.mockResolvedValue(current);
  updateSettings.mockImplementation((_ws, changes) =>
    Promise.resolve({ ...current, ...changes })
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <DocImpactSettings workspaceId="ws-1" canEdit={canEdit} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  getSettings.mockReset();
  updateSettings.mockReset();
});

describe("the defaults", () => {
  it("has the notification on and both GitHub writes off", async () => {
    renderPanel();

    await waitFor(() =>
      expect(screen.getByTestId("doc-impact-settings")).toBeInTheDocument()
    );

    const box = (key: string) =>
      screen.getByTestId(`doc-impact-${key}`).querySelector("input")!;
    expect(box("enabled")).toBeChecked();
    // Writing into a customer's pull requests is not something a deploy starts.
    expect(box("pr_comment_enabled")).not.toBeChecked();
    expect(box("check_run_enabled")).not.toBeChecked();
  });

  it("hides the check's reporting mode until the check is on", async () => {
    renderPanel();
    await waitFor(() =>
      expect(screen.getByTestId("doc-impact-settings")).toBeInTheDocument()
    );
    expect(screen.queryByTestId("doc-impact-conclusion")).toBeNull();
  });

  it("offers neutral first when it is on", async () => {
    renderPanel(settings({ check_run_enabled: true }));
    await waitFor(() =>
      expect(screen.getByTestId("doc-impact-conclusion")).toBeInTheDocument()
    );
    const select = screen.getByLabelText(/how the check reports/i) as HTMLSelectElement;
    expect(select.value).toBe("neutral");
    expect(screen.getByText(/never blocks a merge/i)).toBeInTheDocument();
  });
});

describe("changing them", () => {
  it("sends only what changed", async () => {
    renderPanel();
    await waitFor(() =>
      expect(screen.getByTestId("doc-impact-settings")).toBeInTheDocument()
    );

    fireEvent.click(
      screen.getByTestId("doc-impact-pr_comment_enabled").querySelector("input")!
    );

    // Partial, so a stale client cannot silently re-disable something somebody
    // else just turned on.
    await waitFor(() =>
      expect(updateSettings).toHaveBeenCalledWith("ws-1", {
        pr_comment_enabled: true,
      })
    );
  });

  it("is read-only for a member, and says why", async () => {
    renderPanel(settings(), false);
    await waitFor(() =>
      expect(screen.getByTestId("doc-impact-readonly")).toBeInTheDocument()
    );
    expect(
      screen.getByTestId("doc-impact-enabled").querySelector("input")
    ).toBeDisabled();
  });
});

describe("what the copy has to admit", () => {
  it("says this is a workspace decision, not a personal one", async () => {
    renderPanel();
    await waitFor(() =>
      expect(screen.getByTestId("doc-impact-settings")).toBeInTheDocument()
    );
    // The real cost of putting a shared artifact behind a workspace setting.
    expect(
      screen.getByText(/an individual author cannot opt out/i)
    ).toBeInTheDocument();
  });

  it("names the permission each GitHub write needs", async () => {
    renderPanel();
    await waitFor(() =>
      expect(screen.getByTestId("doc-impact-settings")).toBeInTheDocument()
    );
    expect(screen.getByText(/Pull requests: write/)).toBeInTheDocument();
    expect(screen.getByText(/Checks: write/)).toBeInTheDocument();
  });
});

describe("when GitHub refused", () => {
  it("shows the reason here, where somebody can act on it", async () => {
    renderPanel(
      settings({
        pr_comment_enabled: true,
        github_write_block_reason:
          'The Aexy GitHub App needs "Pull requests: write" on acme.',
        github_write_blocked_at: "2026-08-18T00:00:00Z",
      })
    );

    await waitFor(() =>
      expect(screen.getByTestId("doc-impact-blocked")).toBeInTheDocument()
    );
    const banner = screen.getByTestId("doc-impact-blocked");
    expect(banner.textContent).toContain("Pull requests: write");
    expect(banner.querySelector("a")).toHaveAttribute(
      "href",
      "https://github.com/settings/installations"
    );
  });

  it("shows nothing when nothing is wrong", async () => {
    renderPanel();
    await waitFor(() =>
      expect(screen.getByTestId("doc-impact-settings")).toBeInTheDocument()
    );
    // A banner that outlives the problem trains people to ignore banners.
    expect(screen.queryByTestId("doc-impact-blocked")).toBeNull();
  });
});
