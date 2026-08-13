"use client";

/**
 * Monthly engineering contribution report.
 *
 * The report is only as current as the last repository sync, so freshness is
 * stated above the numbers rather than buried in a caveat: a repo that has
 * never synced and a repo with a quiet month look identical otherwise. Admins
 * get a sync button; everyone else is told the report is built on whatever has
 * synced so far, which is honest and still useful.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarRange,
  CheckCircle2,
  Copy,
  Download,
  FileText,
  GitCommit,
  GitPullRequest,
  Loader2,
  Lock,
  RefreshCw,
  Users,
} from "lucide-react";

import { useWorkspace } from "@/hooks/useWorkspace";
import { useIsWorkspaceAdmin } from "@/hooks/useWorkspace";
import {
  reportsApi,
  type MonthlyEngineeringReport,
  type MonthlyReportRepoSyncState,
} from "@/lib/api";
import { getApiErrorMessage } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";

/** Last 24 months, newest first — far enough back for an annual review. */
function recentMonths(count = 24): string[] {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  });
}

function defaultMonth(): string {
  // Last complete month: a report on a month still running is a moving target.
  const now = new Date();
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, "0")}`;
}

function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

const TIMEZONES = [
  "UTC",
  "Asia/Kolkata",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/Berlin",
  "Asia/Singapore",
  "Australia/Sydney",
];

function monthLabel(month: string, locale: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber - 1, 1).toLocaleDateString(locale, {
    month: "long",
    year: "numeric",
  });
}

export default function MonthlyEngineeringReportPage() {
  const t = useTranslations("reportsMonthly");
  const { currentWorkspace, currentWorkspaceId } = useWorkspace();
  const { isWorkspaceAdmin } = useIsWorkspaceAdmin(currentWorkspaceId ?? null);

  const [month, setMonth] = useState(defaultMonth);
  const [timezone, setTimezone] = useState(browserTimezone);
  const [report, setReport] = useState<MonthlyEngineeringReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Distinguished from a generic error: not being allowed to read this is a
  // normal answer for most of the workspace, not a fault to report.
  const [forbidden, setForbidden] = useState(false);

  const months = useMemo(() => recentMonths(), []);
  const timezoneOptions = useMemo(
    () => Array.from(new Set([browserTimezone(), ...TIMEZONES])),
    []
  );

  // Deliberately not translating in here: `t` is a fresh function on every
  // render, so depending on it would re-run this effect forever. The failure is
  // stored raw and translated where it is displayed.
  const load = useCallback(async () => {
    if (!currentWorkspaceId) return;
    setLoading(true);
    setError(null);
    setForbidden(false);
    try {
      setReport(
        await reportsApi.getMonthlyEngineeringReport(currentWorkspaceId, month, timezone)
      );
    } catch (err) {
      if ((err as { response?: { status?: number } })?.response?.status === 403) {
        setForbidden(true);
      } else {
        setError(getApiErrorMessage(err, ""));
      }
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [currentWorkspaceId, month, timezone]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSync = async () => {
    if (!currentWorkspaceId) return;
    setSyncing(true);
    try {
      const result = await reportsApi.refreshMonthlyEngineeringReportData(
        currentWorkspaceId
      );
      if (result.queued.length) {
        toast.success(t("freshness.syncStarted", { count: result.queued.length }));
      }
      if (result.already_running.length) {
        toast.info(
          t("freshness.syncAlreadyRunning", { count: result.already_running.length })
        );
      }
      if (!result.queued.length && !result.already_running.length) {
        toast.warning(t("freshness.syncNothingToDo"));
      }
    } catch (err) {
      toast.error(getApiErrorMessage(err, t("freshness.syncFailed")));
    } finally {
      setSyncing(false);
    }
  };

  const handleCopy = async () => {
    if (!currentWorkspaceId) return;
    try {
      const markdown = await reportsApi.getMonthlyEngineeringReportMarkdown(
        currentWorkspaceId,
        month,
        timezone
      );
      await navigator.clipboard.writeText(markdown);
      toast.success(t("copied"));
    } catch (err) {
      toast.error(getApiErrorMessage(err, t("loadFailed")));
    }
  };

  const handleDownload = async () => {
    if (!currentWorkspaceId) return;
    try {
      const markdown = await reportsApi.getMonthlyEngineeringReportMarkdown(
        currentWorkspaceId,
        month,
        timezone
      );
      const url = URL.createObjectURL(
        new Blob([markdown], { type: "text/markdown;charset=utf-8" })
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `engineering-report-${month}.md`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(getApiErrorMessage(err, t("loadFailed")));
    }
  };

  if (!currentWorkspaceId) {
    return (
      <div className="p-6">
        <EmptyState
          icon={FileText}
          title={t("title")}
          description={t("noWorkspace")}
        />
      </div>
    );
  }

  const label = monthLabel(month, "en-US");
  const stale = (report?.repository_sync_state ?? []).filter((r) => !r.covers_period);

  if (forbidden) {
    return (
      <div className="p-6">
        <EmptyState
          icon={Lock}
          title={t("forbidden.title")}
          description={t("forbidden.body")}
        />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <CalendarRange className="h-6 w-6 text-muted-foreground" />
            {t("title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("subtitle", { workspace: currentWorkspace?.name ?? "" })}
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {t("month")}
            <select
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
            >
              {months.map((value) => (
                <option key={value} value={value}>
                  {monthLabel(value, "en-US")}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {t("timezone")}
            <select
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
            >
              {timezoneOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="ml-2">{report ? t("regenerate") : t("generate")}</span>
          </Button>

          {report && report.commits > 0 && (
            <>
              <Button variant="ghost" size="sm" onClick={() => void handleCopy()}>
                <Copy className="h-4 w-4" />
                <span className="ml-2">{t("copyMarkdown")}</span>
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void handleDownload()}>
                <Download className="h-4 w-4" />
                <span className="ml-2">{t("download")}</span>
              </Button>
            </>
          )}
        </div>
      </header>

      {report && report.scope_departments.length > 0 && (
        <Card className="p-4 border-primary/30 bg-primary/5">
          <p className="text-sm">
            <span className="font-medium">
              {t("scope.title", { departments: report.scope_departments.join(", ") })}
            </span>{" "}
            <span className="text-muted-foreground">{t("scope.body")}</span>
          </p>
        </Card>
      )}

      {error !== null && (
        <Card className="border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error || t("loadFailed")}
        </Card>
      )}

      {report && (
        <FreshnessPanel
          states={report.repository_sync_state}
          stale={stale}
          month={label}
          isAdmin={isWorkspaceAdmin}
          syncing={syncing}
          onSync={() => void handleSync()}
        />
      )}

      {loading && !report && (
        <Card className="p-10 flex items-center justify-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("generating")}
        </Card>
      )}

      {report && report.commits === 0 && !loading && (
        <Card className="p-8">
          <h2 className="text-lg font-medium">{t("empty.title", { month: label })}</h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-2xl">{t("empty.body")}</p>
        </Card>
      )}

      {report && report.commits > 0 && (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              icon={Users}
              label={t("summary.contributors")}
              value={report.contributors}
            />
            <Stat
              icon={GitCommit}
              label={t("summary.commits")}
              value={report.commits}
              hint={t("summary.commitsHint")}
            />
            <Stat
              icon={GitPullRequest}
              label={t("summary.prsMerged")}
              value={report.prs_merged}
            />
            <Stat
              icon={FileText}
              label={t("summary.lines")}
              value={`+${report.source_additions.toLocaleString()} / −${report.source_deletions.toLocaleString()}`}
              hint={t("summary.linesHint")}
            />
          </section>

          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            <MiniStat label={t("summary.repositories")} value={report.active_repositories} />
            <MiniStat label={t("summary.activeDays")} value={report.active_days} />
            {report.ported_commits > 0 && (
              <MiniStat
                label={t("summary.ported")}
                value={report.ported_commits}
                hint={t("summary.portedHint")}
              />
            )}
            {report.bot_commits_excluded > 0 && (
              <MiniStat
                label={t("summary.botsExcluded")}
                value={report.bot_commits_excluded}
              />
            )}
            {report.merge_commits_excluded > 0 && (
              <MiniStat
                label={t("summary.mergesExcluded")}
                value={report.merge_commits_excluded}
              />
            )}
          </section>

          <Card className="overflow-hidden">
            <div className="p-6 pb-3">
              <h2 className="text-lg font-medium">{t("members.title")}</h2>
              <p className="text-sm text-muted-foreground mt-1">{t("members.note")}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left">{t("members.member")}</th>
                    <th className="px-4 py-2 text-right">{t("members.commits")}</th>
                    <th className="px-4 py-2 text-right">{t("members.share")}</th>
                    <th className="px-4 py-2 text-right">{t("members.added")}</th>
                    <th className="px-4 py-2 text-right">{t("members.removed")}</th>
                    <th className="px-4 py-2 text-right">{t("members.prsTheirs")}</th>
                    <th className="px-4 py-2 text-right">{t("members.prsMergedByThem")}</th>
                    <th className="px-4 py-2 text-right">{t("members.reviews")}</th>
                    <th className="px-4 py-2 text-right">{t("members.activeDays")}</th>
                    <th className="px-4 py-2 text-right">{t("members.repos")}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.members.map((member) => (
                    <tr key={member.developer_id} className="border-t border-border">
                      <td className="px-4 py-2 font-medium">{member.name}</td>
                      <td className="px-4 py-2 text-right">{member.commits}</td>
                      <td className="px-4 py-2 text-right text-muted-foreground">
                        {Math.round((member.commits / report.commits) * 100)}%
                      </td>
                      <td className="px-4 py-2 text-right">
                        {member.source_additions.toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {member.source_deletions.toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-right">{member.prs_authored || "—"}</td>
                      <td className="px-4 py-2 text-right">
                        {member.prs_merged_by_them || "—"}
                      </td>
                      <td className="px-4 py-2 text-right">{member.reviews_given || "—"}</td>
                      <td className="px-4 py-2 text-right">{member.active_days}</td>
                      <td className="px-4 py-2 text-right">{member.repositories.length}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border bg-muted/30 font-medium">
                    <td className="px-4 py-2">{t("members.team")}</td>
                    <td className="px-4 py-2 text-right">{report.commits}</td>
                    <td className="px-4 py-2 text-right">100%</td>
                    <td className="px-4 py-2 text-right">
                      {report.source_additions.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {report.source_deletions.toLocaleString()}
                    </td>
                    <td className="px-4 py-2" />
                    <td className="px-4 py-2 text-right">{report.prs_merged}</td>
                    <td className="px-4 py-2" />
                    <td className="px-4 py-2 text-right">{report.active_days}</td>
                    <td className="px-4 py-2 text-right">{report.active_repositories}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="px-6 py-4 text-xs text-muted-foreground border-t border-border">
              {t("members.caution")}
            </p>
          </Card>

          <Card className="overflow-hidden">
            <div className="p-6 pb-3">
              <h2 className="text-lg font-medium">{t("repositories.title")}</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left">{t("repositories.repository")}</th>
                    <th className="px-4 py-2 text-right">{t("repositories.commits")}</th>
                    <th className="px-4 py-2 text-right">{t("repositories.added")}</th>
                    <th className="px-4 py-2 text-right">{t("repositories.removed")}</th>
                    <th className="px-4 py-2 text-left">{t("repositories.contributors")}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.repositories.map((repo) => (
                    <tr key={repo.full_name} className="border-t border-border">
                      <td className="px-4 py-2 font-mono text-xs">{repo.full_name}</td>
                      <td className="px-4 py-2 text-right">{repo.commits}</td>
                      <td className="px-4 py-2 text-right">
                        {repo.source_additions.toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {repo.source_deletions.toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {repo.contributors
                          .slice(0, 5)
                          .map(([name, count]) => `${name} (${count})`)
                          .join(", ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {report.observations.length > 0 && (
            <Card className="p-6 space-y-3">
              <h2 className="text-lg font-medium">{t("observations.title")}</h2>
              {report.observations.map((observation) => (
                <p key={observation} className="text-sm leading-relaxed">
                  {stripEmphasis(observation)}
                </p>
              ))}
            </Card>
          )}
        </>
      )}

      {report && report.limitations.length > 0 && (
        <Card className="p-6 space-y-3 border-dashed">
          <h2 className="text-base font-medium flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            {t("limitations.title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("limitations.intro")}</p>
          <ul className="list-disc pl-5 space-y-1.5 text-sm text-muted-foreground">
            {report.limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/** Markdown bold survives the API; the page renders plain text. */
function stripEmphasis(text: string): string {
  return text.replace(/\*\*/g, "");
}

function FreshnessPanel({
  states,
  stale,
  month,
  isAdmin,
  syncing,
  onSync,
}: {
  states: MonthlyReportRepoSyncState[];
  stale: MonthlyReportRepoSyncState[];
  month: string;
  isAdmin: boolean;
  syncing: boolean;
  onSync: () => void;
}) {
  const t = useTranslations("reportsMonthly");
  if (!states.length) return null;

  const upToDate = stale.length === 0;

  return (
    <Card
      className={`p-4 ${upToDate ? "" : "border-amber-500/40 bg-amber-500/5"}`}
      data-testid="freshness-panel"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <h2 className="text-sm font-medium flex items-center gap-2">
            {upToDate ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            )}
            {t("freshness.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {upToDate
              ? t("freshness.upToDate", { count: states.length, month })
              : t("freshness.stale", {
                  count: stale.length,
                  total: states.length,
                  month,
                })}
          </p>
          {!upToDate && (
            <ul className="text-xs text-muted-foreground space-y-1">
              {stale.slice(0, 6).map((repo) => (
                <li key={repo.repository_id} className="font-mono">
                  {repo.full_name}
                  <span className="ml-2 font-sans">
                    {!repo.has_adopter
                      ? t("freshness.noAdopter")
                      : repo.last_synced_at
                        ? t("freshness.lastSynced", {
                            when: new Date(repo.last_synced_at).toLocaleString(),
                          })
                        : t("freshness.neverSynced")}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {!upToDate && stale.some((repo) => !repo.has_adopter) && (
            <p className="text-xs text-muted-foreground">{t("freshness.reclaimHint")}</p>
          )}
        </div>

        <div className="flex flex-col items-end gap-2">
          {isAdmin ? (
            <Button size="sm" onClick={onSync} disabled={syncing}>
              {syncing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span className="ml-2">
                {syncing ? t("freshness.syncing") : t("freshness.syncNow")}
              </span>
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground max-w-xs text-right">
              {t("freshness.syncAdminOnly")}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Users;
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}

function MiniStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <Card className="p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-medium tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}
