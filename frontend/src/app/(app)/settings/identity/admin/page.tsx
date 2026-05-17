"use client";

import { useMemo, useState } from "react";
import { Fingerprint, GitMerge, Sparkles, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { useAuth } from "@/hooks/useAuth";
import { useMergeGhost, useWorkspaceGhosts } from "@/hooks/useIdentity";
import { useWorkspace, useWorkspaceMembers } from "@/hooks/useWorkspace";
import type { WorkspaceGhostDeveloper } from "@/lib/identity-api";

export default function AdminGhostsPage() {
  const t = useTranslations("identity.admin");
  const { user } = useAuth();
  const { currentWorkspaceId } = useWorkspace();
  const { members } = useWorkspaceMembers(currentWorkspaceId);

  const currentMember = members?.find((m) => m.developer_id === user?.id);
  const isAdmin =
    currentMember?.role === "owner" || currentMember?.role === "admin";

  const { data, isLoading } = useWorkspaceGhosts(
    isAdmin ? currentWorkspaceId : null,
  );
  const mergeGhost = useMergeGhost(currentWorkspaceId);

  // Per-row picker state: which workspace member each ghost is being merged into.
  const [picked, setPicked] = useState<Record<string, string>>({});

  const memberOptions = useMemo(() => {
    return (members || []).map((m) => ({
      developer_id: m.developer_id,
      label: m.developer_name || m.developer_email || m.developer_id.slice(0, 8),
    }));
  }, [members]);

  const handleMerge = (ghost: WorkspaceGhostDeveloper) => {
    const target =
      picked[ghost.ghost_id] ?? ghost.suggestions[0]?.developer_id ?? "";
    if (!target) return;
    const targetLabel =
      memberOptions.find((m) => m.developer_id === target)?.label ?? target;
    const ok = window.confirm(
      t("confirmMerge", { ghost: ghost.name || "(ghost)", target: targetLabel }),
    );
    if (!ok) return;
    mergeGhost.mutate({
      ghostDeveloperId: ghost.ghost_id,
      targetDeveloperId: target,
    });
  };

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 mt-0.5">
            <Fingerprint className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-foreground">{t("title")}</h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              {t("intro")}
            </p>
          </div>
        </div>
        <Link
          href="/settings/identity"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="h-3 w-3" />
          /settings/identity
        </Link>
      </header>

      {!isAdmin && (
        <section className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          {t("adminOnlyHint")}
        </section>
      )}

      {isAdmin && isLoading && (
        <section className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          {t("loading")}
        </section>
      )}

      {isAdmin && !isLoading && (data?.ghosts.length ?? 0) === 0 && (
        <section className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          {t("noGhosts")}
        </section>
      )}

      {isAdmin && (data?.ghosts.length ?? 0) > 0 && (
        <section className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">
                  {t("columns.ghost")}
                </th>
                <th className="px-4 py-3 text-left font-medium">
                  {t("columns.activity")}
                </th>
                <th className="px-4 py-3 text-left font-medium">
                  {t("columns.suggestion")}
                </th>
                <th className="px-4 py-3 text-left font-medium">
                  {t("columns.actions")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data!.ghosts.map((g) => {
                const top = g.suggestions[0];
                const selected = picked[g.ghost_id] ?? top?.developer_id ?? "";
                return (
                  <tr key={g.ghost_id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono text-xs">
                      {g.name || "(unnamed)"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {t("metricCompact", {
                        commits: g.commits,
                        prs: g.prs,
                        reviews: g.reviews,
                      })}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {top ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Sparkles className="h-3 w-3 text-primary" />
                          <span className="font-medium">
                            {top.name || top.github_username}
                          </span>
                          <span className="text-muted-foreground">
                            ({t(`suggestion.${top.reason}` as
                              | "suggestion.github_username_match"
                              | "suggestion.developer_name_match")})
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">
                          {t("suggestion.none")}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <select
                          value={selected}
                          onChange={(e) =>
                            setPicked((p) => ({
                              ...p,
                              [g.ghost_id]: e.target.value,
                            }))
                          }
                          className="rounded-md border border-border bg-background px-2 py-1 text-xs max-w-[200px]"
                        >
                          <option value="">{t("selectMember")}</option>
                          {memberOptions.map((m) => (
                            <option key={m.developer_id} value={m.developer_id}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => handleMerge(g)}
                          disabled={!selected || mergeGhost.isPending}
                          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
                        >
                          <GitMerge className="h-3 w-3" />
                          {mergeGhost.isPending ? t("merging") : t("merge")}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
