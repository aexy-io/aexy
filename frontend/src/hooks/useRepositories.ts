"use client";

import { useQuery } from "@tanstack/react-query";
import { repositoriesApi, Repository, InstallationStatus } from "@/lib/api";

/**
 * Hook to check GitHub App installation status and enabled repositories.
 * Used by dashboard and insights pages to show appropriate prompts.
 */
export function useEnabledRepositories() {
  const { data: installationStatus, isLoading: installLoading } = useQuery<InstallationStatus>({
    queryKey: ["installation-status-check"],
    queryFn: () => repositoriesApi.getInstallationStatus(),
    retry: false,
    staleTime: 30_000,
  });

  const { data: repositories, isLoading: reposLoading } = useQuery<Repository[]>({
    queryKey: ["repositories-enabled-check"],
    queryFn: () => repositoriesApi.listRepositories({ enabled_only: true }),
    retry: false,
    staleTime: 30_000,
    enabled: installationStatus?.has_installation === true,
  });

  const hasInstallation = installationStatus?.has_installation ?? false;
  const installUrl = installationStatus?.install_url ?? null;

  return {
    enabledRepos: repositories ?? [],
    hasEnabledRepos: (repositories?.length ?? 0) > 0,
    hasInstallation,
    installUrl,
    isLoading: installLoading || (hasInstallation && reposLoading),
  };
}
