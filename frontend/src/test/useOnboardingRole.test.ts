/**
 * Who gets the use-case step.
 *
 * That step configures the *workspace* — which apps are on, which departments
 * and teams get seeded — and its endpoint is owner-only. An invited member
 * answering it filled in a form, got a 403 nobody surfaced, and changed nothing.
 *
 * The loading case is the one worth guarding hardest. Ownership arrives a tick
 * after mount, and treating "not loaded yet" as "not the owner" would skip the
 * owner past their own setup — the same bug, inverted, and much harder to spot
 * because it only happens on a slow query.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

import { useOnboardingRole } from "@/app/(app)/onboarding/useOnboardingRole";

const mockAuth = vi.fn();
const mockWorkspace = vi.fn();

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => mockAuth() }));
vi.mock("@/hooks/useWorkspace", () => ({ useWorkspace: () => mockWorkspace() }));

const ME = "dev-me";
const SOMEONE_ELSE = "dev-other";

function setup({
  userId = ME,
  workspaces = [] as { id: string; owner_id: string; name?: string }[],
  currentWorkspaceId = null as string | null,
  workspacesLoading = false,
} = {}) {
  mockAuth.mockReturnValue({ user: userId ? { id: userId } : null });
  mockWorkspace.mockReturnValue({
    workspaces,
    workspacesLoading,
    currentWorkspaceId,
  });
  return renderHook(() => useOnboardingRole());
}

beforeEach(() => {
  mockAuth.mockReset();
  mockWorkspace.mockReset();
});

describe("useOnboardingRole", () => {
  it("treats someone with no workspace as setting one up", () => {
    // They are about to create it, so it will be theirs.
    const { result } = setup({ workspaces: [] });

    expect(result.current.isReady).toBe(true);
    expect(result.current.setsUpWorkspace).toBe(true);
    expect(result.current.isJoiningSomeoneElsesWorkspace).toBe(false);
  });

  it("treats the owner of the current workspace as setting it up", () => {
    const { result } = setup({
      workspaces: [{ id: "ws-1", owner_id: ME }],
      currentWorkspaceId: "ws-1",
    });

    expect(result.current.setsUpWorkspace).toBe(true);
  });

  it("treats an invited member as joining", () => {
    const { result } = setup({
      workspaces: [{ id: "ws-1", owner_id: SOMEONE_ELSE }],
      currentWorkspaceId: "ws-1",
    });

    expect(result.current.isJoiningSomeoneElsesWorkspace).toBe(true);
    expect(result.current.setsUpWorkspace).toBe(false);
  });

  it("judges the current workspace, not merely the first one", () => {
    // Belonging to a workspace you own says nothing about the one you are in.
    const { result } = setup({
      workspaces: [
        { id: "ws-mine", owner_id: ME },
        { id: "ws-theirs", owner_id: SOMEONE_ELSE },
      ],
      currentWorkspaceId: "ws-theirs",
    });

    expect(result.current.isJoiningSomeoneElsesWorkspace).toBe(true);
  });

  it("is not ready while the workspace list is loading", () => {
    const { result } = setup({ workspaces: [], workspacesLoading: true });

    expect(result.current.isReady).toBe(false);
    // Neither answer is claimed yet — callers must wait rather than read this
    // as "not the owner".
    expect(result.current.setsUpWorkspace).toBe(false);
    expect(result.current.isJoiningSomeoneElsesWorkspace).toBe(false);
  });

  it("is not ready before the user resolves", () => {
    const { result } = setup({
      userId: "",
      workspaces: [{ id: "ws-1", owner_id: SOMEONE_ELSE }],
      currentWorkspaceId: "ws-1",
    });

    expect(result.current.isReady).toBe(false);
    expect(result.current.isJoiningSomeoneElsesWorkspace).toBe(false);
  });
});
