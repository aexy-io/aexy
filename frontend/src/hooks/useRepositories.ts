"use client";

import { useQuery } from "@tanstack/react-query";
import {
  repositoriesApi,
  workspaceRepositoriesApi,
  RepositoryChoice,
  InstallationStatus,
} from "@/lib/api";

/**
 * "Is there anything to show on this page, and if not, whose problem is it?"
 *
 * Two questions that look like one and are not:
 *
 *   * whether the *workspace* has adopted any repositories, which decides
 *     whether insights exist at all;
 *   * whether *this person* has installed the GitHub App, which decides whether
 *     they are the one who can fix it.
 *
 * This used to answer the first with `/repositories?enabled_only=true` — the
 * per-developer table, which adoption writes a row in only for the adopter. So
 * a colleague who had not adopted anything themselves was told "you haven't
 * enabled any repositories yet" while the whole insights page hid metrics that
 * existed and that everyone else could see. A picker showing the wrong list is
 * an annoyance; a gate reading the wrong list withholds the product.
 *
 * `workspaceId` is optional so the hook can be called before a workspace has
 * resolved, which reads as "not yet known", not "nothing adopted".
 */
export function useEnabledRepositories(workspaceId?: string | null) {
  const { data: installationStatus, isLoading: installLoading } = useQuery<InstallationStatus>({
    queryKey: ["installation-status-check"],
    queryFn: () => repositoriesApi.getInstallationStatus(),
    retry: false,
    staleTime: 30_000,
  });

  // Not gated on the caller's own installation. Doing that made the workspace's
  // adoptions invisible to anyone who had not installed the app themselves —
  // which is the majority of a team, since one admin adopts and everybody else
  // reads.
  const { data: repositories, isLoading: reposLoading } = useQuery({
    queryKey: ["workspace-repositories", workspaceId],
    queryFn: () => workspaceRepositoriesApi.list(workspaceId!),
    retry: false,
    staleTime: 30_000,
    enabled: Boolean(workspaceId),
    select: (rows): RepositoryChoice[] =>
      rows
        // An adoption an admin paused is not a repository to report on.
        .filter((row) => row.is_active)
        .map((row) => ({
          id: row.repository.id,
          name: row.repository.name,
          full_name: row.repository.full_name,
          description: row.repository.description,
          is_private: row.repository.is_private,
          language: row.repository.language,
        })),
  });

  const hasInstallation = installationStatus?.has_installation ?? false;
  const installUrl = installationStatus?.install_url ?? null;

  return {
    enabledRepos: repositories ?? [],
    hasEnabledRepos: (repositories?.length ?? 0) > 0,
    hasInstallation,
    installUrl,
    isLoading: installLoading || (Boolean(workspaceId) && reposLoading),
  };
}
