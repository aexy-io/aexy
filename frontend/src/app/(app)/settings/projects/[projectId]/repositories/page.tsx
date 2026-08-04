"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { FolderGit2, Lock, Globe } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { useWorkspace } from "@/hooks/useWorkspace";
import {
  workspaceRepositoriesApi,
  teamRepositoriesApi,
  WorkspaceRepositoryItem,
} from "@/lib/api";
import {
  SettingsPage,
  SettingsSkeleton,
} from "@/components/settings/SettingsPrimitives";

export default function ProjectRepositoriesPage() {
  const t = useTranslations("settingsProjectRepositories");
  const params = useParams();
  const projectId = params.projectId as string;
  const { currentWorkspaceId } = useWorkspace();

  const [catalog, setCatalog] = useState<WorkspaceRepositoryItem[]>([]);
  const [teamRepos, setTeamRepos] = useState<WorkspaceRepositoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!currentWorkspaceId) return;
      setLoading(true);
      try {
        const [c, t] = await Promise.all([
          workspaceRepositoriesApi.list(currentWorkspaceId),
          teamRepositoriesApi.list(projectId),
        ]);
        setCatalog(c);
        setTeamRepos(t);
      } catch (error) {
        console.error("Failed to load project repos:", error);
        toast.error("Failed to load repositories");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [currentWorkspaceId, projectId]);

  const teamRepoIds = useMemo(
    () => new Set(teamRepos.map((t) => t.id)),
    [teamRepos],
  );

  const handleToggle = async (wrId: string, enable: boolean) => {
    setPendingId(wrId);
    try {
      if (enable) {
        await teamRepositoriesApi.link(projectId, wrId);
        const fromCatalog = catalog.find((c) => c.id === wrId);
        if (fromCatalog) setTeamRepos((prev) => [...prev, fromCatalog]);
      } else {
        await teamRepositoriesApi.unlink(projectId, wrId);
        setTeamRepos((prev) => prev.filter((t) => t.id !== wrId));
      }
    } catch (error: unknown) {
      const detail =
        (error as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail;
      toast.error(detail ?? "Failed to update");
    } finally {
      setPendingId(null);
    }
  };

  if (loading) return <SettingsSkeleton rows={1} />;

  return (
    <SettingsPage
      title={t("title")}
      description={t("description")}
      width="wide"
      breadcrumbs={[
        { label: "Settings", href: "/settings" },
        { label: "Projects", href: "/settings/projects" },
        { label: t("title") },
      ]}
    >
      {catalog.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-8 text-center">
          <FolderGit2 className="mx-auto mb-3 h-10 w-10 text-muted-foreground" aria-hidden />
          <h2 className="text-base font-medium text-foreground">
            {t("empty.title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("empty.description")}
          </p>
          <Link
            href="/settings/repositories"
            className="inline-block mt-4 text-sm text-primary-500 hover:underline"
          >
            Open workspace repositories →
          </Link>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <ul className="divide-y divide-border">
            {catalog.map((wr) => {
              const linked = teamRepoIds.has(wr.id);
              const repo = wr.repository;
              return (
                <li
                  key={wr.id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {repo.is_private ? (
                      <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
                    ) : (
                      <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">
                        {repo.full_name}
                      </div>
                      {repo.description && (
                        <div className="text-xs text-muted-foreground truncate">
                          {repo.description}
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleToggle(wr.id, !linked)}
                    disabled={pendingId === wr.id}
                    className={`text-xs px-3 py-1.5 rounded-md font-medium transition disabled:opacity-50 ${
                      linked
                        ? "bg-primary-600 hover:bg-primary-700 text-white"
                        : "bg-muted hover:bg-accent text-foreground"
                    }`}
                  >
                    {pendingId === wr.id
                      ? "…"
                      : linked
                        ? "In project"
                        : "Add to project"}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </SettingsPage>
  );
}
