"use client";

import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";

/**
 * Is this person setting up a workspace, or joining one somebody else set up?
 *
 * The use-case step configures the *workspace* — which apps are on, which
 * departments and teams get seeded. That is the owner's decision, made once.
 * An invited member answering it was never going to work: the endpoint behind
 * it (`POST /workspaces/{id}/onboarding/use-cases`) is owner-only and returns
 * 403, which the completion step swallows into a `console.error`. So they
 * filled in a form, saw no error, and nothing happened.
 *
 * Three cases, and only the last one skips:
 *
 *   * **No workspace yet** — they are about to create one, so it is theirs.
 *   * **They own the workspace they are in** — theirs.
 *   * **They belong to somebody else's workspace** — joining. Skip.
 *
 * Reads `owner_id` off the workspace *list*, which the caller already loads,
 * rather than `useWorkspace().isOwner`. That flag depends on a second query for
 * the full workspace and is transiently `false` while it resolves — long enough
 * to bounce an owner past their own setup step.
 */
export function useOnboardingRole() {
  const { user } = useAuth();
  const { workspaces, workspacesLoading, currentWorkspaceId } = useWorkspace();

  const existing =
    workspaces.find((w) => w.id === currentWorkspaceId) ?? workspaces[0];

  // Deciding before the list arrives would send an owner down the member path.
  // Callers must wait rather than treat "not ready" as "not the owner".
  const isReady = !workspacesLoading && !!user;

  const isJoiningSomeoneElsesWorkspace =
    isReady && !!existing && existing.owner_id !== user?.id;

  return {
    isReady,
    /** Show the use-case picker: they own this workspace, or are creating one. */
    setsUpWorkspace: isReady && !isJoiningSomeoneElsesWorkspace,
    isJoiningSomeoneElsesWorkspace,
    existingWorkspace: existing,
  };
}
