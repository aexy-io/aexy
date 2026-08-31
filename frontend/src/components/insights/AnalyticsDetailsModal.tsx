"use client";

import { useEffect, useMemo, useState } from "react";
import type React from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ExternalLink, GitCommit, ListTree, Lock } from "lucide-react";

import {
  api,
  insightsApi,
  InsightsPeriodType,
  RepositoryInsightsListResponse,
} from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspaceMembers } from "@/hooks/useWorkspace";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Tab = "summary" | "sources" | "commits" | "raw";

interface CommitEvidence {
  id: string;
  sha: string;
  message: string;
  repository: string;
  additions: number;
  deletions: number;
  committed_at: string | null;
  author_github_login: string | null;
  author_email: string | null;
  html_url: string | null;
}

interface CommitEvidenceResponse {
  total: number;
  commits: CommitEvidence[];
}

export interface AnalyticsDetailsContext {
  title: string;
  metric: string;
  value: React.ReactNode;
  workspaceId: string;
  periodType: InsightsPeriodType;
  developerId?: string;
  developerName?: string | null;
  periodStart?: string;
  periodEnd?: string;
}

interface Props {
  context: AnalyticsDetailsContext | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AnalyticsDetailsModal({ context, open, onOpenChange }: Props) {
  const t = useTranslations("insights.details");
  const [tab, setTab] = useState<Tab>("summary");

  // Admin gate for the Raw tab. The raw JSON exposes commit-level
  // author_email values, which are PII when viewed by non-admin
  // teammates — same workspace, but the insights page itself isn't
  // admin-only. Determine role via the cached workspace members list.
  const { user } = useAuth();
  const { members } = useWorkspaceMembers(context?.workspaceId ?? null);
  const isAdmin = useMemo(() => {
    if (!user?.id || !members?.length) return false;
    const me = members.find((m) => m.developer_id === user.id);
    return me?.role === "owner" || me?.role === "admin";
  }, [members, user?.id]);

  // The Sources tab is workspace-wide repo activity — only meaningful
  // for team-aggregate cards (where developerId is not set). When the
  // modal was opened from a row "Sources" button, the same query
  // returns team-wide data which is misleading; hide the tab in that
  // case rather than render mismatched content.
  const showSourcesTab = !context?.developerId;

  const tabs = useMemo<{ id: Tab; label: string }[]>(() => {
    const out: { id: Tab; label: string }[] = [
      { id: "summary", label: t("tabs.summary") },
    ];
    if (showSourcesTab) out.push({ id: "sources", label: t("tabs.sources") });
    out.push({ id: "commits", label: t("tabs.commits") });
    if (isAdmin) out.push({ id: "raw", label: t("tabs.raw") });
    return out;
  }, [showSourcesTab, isAdmin, t]);

  // If the active tab gets hidden (e.g. switching from team metric to
  // row-scoped close-and-reopen), fall back to summary so we don't end
  // up rendering content for a tab that's no longer in the list.
  useEffect(() => {
    if (!tabs.some((t) => t.id === tab)) setTab("summary");
  }, [tabs, tab]);

  const { data: repositoryData, isLoading: repoLoading } =
    useQuery<RepositoryInsightsListResponse>({
      queryKey: [
        "analyticsDetailsRepositories",
        context?.workspaceId,
        context?.periodType,
        context?.periodStart,
        context?.periodEnd,
      ],
      queryFn: () =>
        insightsApi.getRepositoryInsights(context!.workspaceId, {
          period_type: context!.periodType,
          start_date: context!.periodStart,
          end_date: context!.periodEnd,
        }),
      enabled: open && !!context?.workspaceId,
      staleTime: 30 * 1000,
    });

  const { data: commitData, isLoading: commitsLoading } =
    useQuery<CommitEvidenceResponse>({
      queryKey: [
        "analyticsDetailsCommits",
        context?.workspaceId,
        context?.developerId,
        context?.periodType,
        context?.periodStart,
        context?.periodEnd,
      ],
      queryFn: async () => {
        const response = await api.get(
          `/workspaces/${context!.workspaceId}/insights/developers/${context!.developerId}/commits`,
          {
            params: {
              limit: 100,
              period_type: context!.periodType,
              start_date: context!.periodStart,
              end_date: context!.periodEnd,
            },
          },
        );
        return response.data;
      },
      enabled: open && !!context?.workspaceId && !!context?.developerId,
      staleTime: 30 * 1000,
    });

  const raw = useMemo(
    () => ({
      context,
      repositories: repositoryData,
      commits: commitData,
    }),
    [context, repositoryData, commitData],
  );

  if (!context) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>{context.title}</DialogTitle>
          <DialogDescription>
            {context.developerName
              ? t("evidenceForDeveloper", {
                  metric: context.metric,
                  name: context.developerName,
                })
              : t("evidenceFor", { metric: context.metric })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 border-b border-border">
          {tabs.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`px-3 py-2 text-sm font-medium border-b-2 transition ${
                tab === item.id
                  ? "border-indigo-500 text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="overflow-auto pr-1 max-h-[60vh]">
          {tab === "summary" && (
            <div className="grid sm:grid-cols-2 gap-3">
              <DetailItem label={t("summary.metric")} value={context.metric} />
              <DetailItem label={t("summary.value")} value={context.value} />
              <DetailItem label={t("summary.period")} value={context.periodType} />
              <DetailItem
                label={t("summary.range")}
                value={
                  context.periodStart && context.periodEnd
                    ? `${formatDate(context.periodStart)} - ${formatDate(context.periodEnd)}`
                    : t("summary.serverDefault")
                }
              />
              {context.developerId && (
                <DetailItem label={t("summary.developerId")} value={context.developerId} />
              )}
            </div>
          )}

          {tab === "sources" && showSourcesTab && (
            <SourceTable data={repositoryData} isLoading={repoLoading} />
          )}

          {tab === "commits" && (
            <CommitTable
              data={commitData}
              isLoading={commitsLoading}
              hasDeveloper={!!context.developerId}
            />
          )}

          {/* Belt-and-braces gate: even if `tab` is briefly "raw" while
              isAdmin flips false, render the locked notice instead of
              the JSON dump. The tab itself is hidden for non-admins, so
              this is the catch for race conditions only. */}
          {tab === "raw" && (
            isAdmin ? (
              <pre className="text-xs bg-background border border-border rounded-lg p-3 overflow-auto">
                {JSON.stringify(raw, null, 2)}
              </pre>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Lock className="h-4 w-4" /> {t("raw.adminOnly")}
              </div>
            )
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DetailItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="text-sm text-foreground break-words">{value}</div>
    </div>
  );
}

function SourceTable({
  data,
  isLoading,
}: {
  data?: RepositoryInsightsListResponse;
  isLoading: boolean;
}) {
  const t = useTranslations("insights.details.sources");
  if (isLoading) return <div className="text-sm text-muted-foreground">{t("loading")}</div>;
  if (!data?.repositories?.length) {
    return <div className="text-sm text-muted-foreground">{t("empty")}</div>;
  }
  return (
    <table className="w-full text-sm">
      <thead className="text-xs text-muted-foreground">
        <tr>
          <th className="py-2 text-left font-medium">{t("columns.repository")}</th>
          <th className="py-2 text-right font-medium">{t("columns.commits")}</th>
          <th className="py-2 text-right font-medium">{t("columns.prs")}</th>
          <th className="py-2 text-right font-medium">{t("columns.reviews")}</th>
          <th className="py-2 text-right font-medium">{t("columns.lines")}</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {data.repositories.map((repo) => (
          <tr key={repo.repository}>
            <td className="py-2 text-foreground">
              <span className="inline-flex items-center gap-2">
                <ListTree className="h-3.5 w-3.5 text-muted-foreground" />
                {repo.repository}
              </span>
            </td>
            <td className="py-2 text-right font-mono">{repo.commits_count}</td>
            <td className="py-2 text-right font-mono">{repo.prs_merged}</td>
            <td className="py-2 text-right font-mono">{repo.reviews_count}</td>
            <td className="py-2 text-right font-mono">
              {(repo.lines_added + repo.lines_removed).toLocaleString()}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CommitTable({
  data,
  isLoading,
  hasDeveloper,
}: {
  data?: CommitEvidenceResponse;
  isLoading: boolean;
  hasDeveloper: boolean;
}) {
  const t = useTranslations("insights.details.commits");
  if (!hasDeveloper) {
    return (
      <div className="text-sm text-muted-foreground">{t("selectDeveloper")}</div>
    );
  }
  if (isLoading) return <div className="text-sm text-muted-foreground">{t("loading")}</div>;
  if (!data?.commits?.length) {
    return <div className="text-sm text-muted-foreground">{t("empty")}</div>;
  }
  return (
    <table className="w-full text-sm">
      <thead className="text-xs text-muted-foreground">
        <tr>
          <th className="py-2 text-left font-medium">{t("columns.commit")}</th>
          <th className="py-2 text-left font-medium">{t("columns.repository")}</th>
          <th className="py-2 text-right font-medium">{t("columns.delta")}</th>
          <th className="py-2 text-left font-medium">{t("columns.author")}</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {data.commits.map((commit) => (
          <tr key={commit.id}>
            <td className="py-2 pr-3">
              <div className="flex items-start gap-2">
                <GitCommit className="h-3.5 w-3.5 mt-0.5 text-muted-foreground" />
                <div className="min-w-0">
                  <div className="text-foreground truncate max-w-[360px]">
                    {commit.message}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {commit.sha.slice(0, 7)}
                    {commit.committed_at ? ` · ${formatDate(commit.committed_at)}` : ""}
                    {commit.html_url && (
                      <a
                        href={commit.html_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex ml-2 text-indigo-400 hover:text-indigo-300"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </td>
            <td className="py-2 text-muted-foreground">{commit.repository}</td>
            <td className="py-2 text-right font-mono">
              +{commit.additions}/-{commit.deletions}
            </td>
            <td className="py-2 text-muted-foreground">
              {commit.author_github_login || commit.author_email || t("unknownAuthor")}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
