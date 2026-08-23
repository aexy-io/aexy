"use client";

/**
 * The way in to the developer drill-down.
 *
 * `APP_CATALOG.insights` declares a `developer_drilldown` module at
 * `/insights/developers`, three bundles enable it, and `ROUTE_TO_APP` gates it
 * — but the only file under `developers/` was `[developerId]/page.tsx`. The
 * drill-down could only be reached by already knowing a developer's uuid and
 * typing it, which nothing in the product offers you. A detail page with no
 * index is a page nobody visits.
 *
 * The list comes from the leaderboard query rather than `developerApi.list`
 * on purpose: this is the *insights* directory, so the people who show up
 * should be the ones with activity in the period, ordered by it, with the
 * number that ordered them visible. `/organization/directory` is where you go
 * to see everybody.
 */

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Users } from "lucide-react";

import { PageShell, PageHeader, PageSection, PageEmpty } from "@/components/ui/page";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useLeaderboard } from "@/hooks/useInsights";
import type { InsightsPeriodType } from "@/lib/api";
import { cn } from "@/lib/utils";

const PERIODS: { value: InsightsPeriodType; label: string }[] = [
  { value: "weekly", label: "This week" },
  { value: "monthly", label: "This month" },
  { value: "sprint", label: "This sprint" },
];

const METRICS = [
  { value: "commits", label: "Commits" },
  { value: "prs_merged", label: "PRs merged" },
  { value: "reviews", label: "Reviews" },
  { value: "lines_changed", label: "Lines changed" },
];

export default function DevelopersIndexPage() {
  const { currentWorkspaceId } = useWorkspace();
  const [periodType, setPeriodType] = useState<InsightsPeriodType>("monthly");
  const [metric, setMetric] = useState("commits");

  const { leaderboard, isLoading } = useLeaderboard(currentWorkspaceId, {
    metric,
    period_type: periodType,
    limit: 100,
  });

  const entries = leaderboard?.entries ?? [];
  const metricLabel = METRICS.find((m) => m.value === metric)?.label ?? metric;

  return (
    <PageShell width="wide">
      <PageHeader
        title="Developers"
        description="Everyone with activity in the period. Open one for the full drill-down — health score, velocity forecast, PR size, code churn."
      >
        <div className="flex flex-wrap gap-2">
          <Choices options={PERIODS} value={periodType} onChange={(v) => setPeriodType(v as InsightsPeriodType)} />
          <Choices options={METRICS} value={metric} onChange={setMetric} />
        </div>
      </PageHeader>

      <PageSection flush>
        {isLoading ? (
          <div className="space-y-px p-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-11 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <PageEmpty
            icon={<Users className="h-8 w-8" />}
            title="No activity in this period"
            description="Developer insights are built from connected repositories. Once commits and pull requests are syncing, everyone who contributed shows up here."
            action={
              <Link href="/settings/repositories" className="text-sm font-medium text-primary hover:underline">
                Connect a repository
              </Link>
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {entries.map((entry) => (
              <li key={entry.developer_id}>
                <Link
                  href={`/insights/developers/${entry.developer_id}`}
                  className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent"
                >
                  <span className="w-6 shrink-0 font-brand-mono text-xs tabular-nums text-muted-foreground">
                    {entry.rank}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                    {entry.developer_name || "Unattributed"}
                  </span>
                  <span className="shrink-0 font-brand-mono text-sm tabular-nums text-muted-foreground">
                    {entry.value.toLocaleString()}
                  </span>
                  <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                    {metricLabel.toLowerCase()}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PageSection>
    </PageShell>
  );
}

function Choices<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-md border border-border" role="group">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            "px-2.5 py-1.5 text-xs font-medium transition-colors first:rounded-l-md last:rounded-r-md",
            value === o.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
