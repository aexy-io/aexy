"use client";

import { useState, useMemo } from "react";
import {
  GitCommitHorizontal,
  GitPullRequest,
  Code2,
  Eye,
  Users,
  TrendingUp,
  GitBranch,
  ShieldAlert,
  X,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useWorkspaceGitHubAnalytics } from "@/hooks/useWorkStats";
import { MetricCard } from "@/components/tracking/shared";
import type { MemberGitHubStats, MemberRepoStat } from "@/lib/work-stats-api";

type PeriodDays = 7 | 30 | 90;

export default function WorkStatsPage() {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;
  const [periodDays, setPeriodDays] = useState<PeriodDays>(30);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  const { data: analytics, isLoading, error } = useWorkspaceGitHubAnalytics(
    workspaceId,
    periodDays
  );

  const periodLabel = useMemo(() => {
    if (periodDays === 7) return "Last 7 days";
    if (periodDays === 30) return "Last 30 days";
    return "Last 90 days";
  }, [periodDays]);

  const selectedMember = useMemo(() => {
    if (!selectedMemberId || !analytics) return null;
    return analytics.members.find((m) => m.developer_id === selectedMemberId) || null;
  }, [selectedMemberId, analytics]);

  // Compute summary stats - either for all or for the selected member
  const displayStats = useMemo(() => {
    if (!analytics) return null;
    if (selectedMember) {
      return {
        total_commits: selectedMember.commits,
        total_prs: selectedMember.prs_created,
        total_prs_merged: selectedMember.prs_merged,
        total_reviews: selectedMember.reviews_given,
        total_additions: selectedMember.additions,
        total_deletions: selectedMember.deletions,
        active_contributors: 1,
        top_repositories: selectedMember.top_repositories.map((r) => ({
          repository: r.repository,
          commits: r.commits,
          prs: r.prs,
          contributors: 1,
        })),
      };
    }
    return analytics.summary;
  }, [analytics, selectedMember]);

  // Activity timeline for selected member or whole team
  const displayTimeline = useMemo(() => {
    if (!analytics) return [];
    if (selectedMember) {
      return selectedMember.activity_trend.map((d) => ({
        date: d.date,
        commits: d.commits,
        prs_opened: d.prs,
        prs_merged: 0,
        reviews: 0,
      }));
    }
    return analytics.activity_timeline;
  }, [analytics, selectedMember]);

  const isPermissionError = error && (error as Error).message?.includes("403");

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
                <GitCommitHorizontal className="h-8 w-8 text-emerald-500" />
                Work Stats
              </h1>
              <p className="text-muted-foreground mt-2">
                GitHub activity analytics for your team
              </p>
            </div>
            {/* Period Selector */}
            <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-1">
              {([7, 30, 90] as PeriodDays[]).map((d) => (
                <button
                  key={d}
                  onClick={() => setPeriodDays(d)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
                    periodDays === d
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Permission Error */}
        {isPermissionError && (
          <div className="flex flex-col items-center justify-center py-20">
            <ShieldAlert className="h-16 w-16 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">
              Admin Access Required
            </h2>
            <p className="text-muted-foreground text-center max-w-md">
              Work Stats is available to workspace admins and owners.
              Contact your workspace admin for access.
            </p>
          </div>
        )}

        {/* Other Error */}
        {error && !isPermissionError && (
          <div className="mb-8 p-4 bg-destructive/10 border border-destructive/30 rounded-xl">
            <p className="text-destructive text-sm">
              Failed to load work stats. Please try again.
            </p>
          </div>
        )}

        {/* Member Filter Bar */}
        {!isPermissionError && (
          <div className="mb-6">
            <div className="flex items-center gap-2 flex-wrap">
              {/* All members chip */}
              <button
                onClick={() => setSelectedMemberId(null)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border transition ${
                  !selectedMemberId
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-muted-foreground border-border hover:border-border hover:text-foreground"
                }`}
              >
                <Users className="h-3.5 w-3.5" />
                All Members
              </button>

              {/* Loading state */}
              {isLoading && (
                <>
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-8 w-28 bg-muted rounded-full animate-pulse"
                    />
                  ))}
                </>
              )}

              {/* Member chips */}
              {analytics?.members.map((member) => (
                <button
                  key={member.developer_id}
                  onClick={() =>
                    setSelectedMemberId(
                      selectedMemberId === member.developer_id
                        ? null
                        : member.developer_id
                    )
                  }
                  className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm border transition ${
                    selectedMemberId === member.developer_id
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card text-muted-foreground border-border hover:border-border hover:text-foreground"
                  }`}
                >
                  {member.avatar_url ? (
                    <img
                      src={member.avatar_url}
                      alt={member.name}
                      className="w-5 h-5 rounded-full"
                    />
                  ) : (
                    <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-semibold">
                      {member.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span className="max-w-[120px] truncate">{member.name}</span>
                  {selectedMemberId === member.developer_id && (
                    <X className="h-3 w-3 ml-0.5" />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Summary Cards */}
        {!isPermissionError && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <MetricCard
              title="Commits"
              value={displayStats?.total_commits ?? 0}
              subtitle={periodLabel}
              icon={GitCommitHorizontal}
              iconColor="text-emerald-400"
              iconBgColor="bg-emerald-900/30"
              loading={isLoading}
            />
            <MetricCard
              title="Pull Requests"
              value={displayStats?.total_prs ?? 0}
              subtitle={`${displayStats?.total_prs_merged ?? 0} merged`}
              icon={GitPullRequest}
              iconColor="text-blue-400"
              iconBgColor="bg-blue-900/30"
              loading={isLoading}
            />
            <MetricCard
              title="Code Reviews"
              value={displayStats?.total_reviews ?? 0}
              subtitle={periodLabel}
              icon={Eye}
              iconColor="text-purple-400"
              iconBgColor="bg-purple-900/30"
              loading={isLoading}
            />
            <MetricCard
              title={selectedMember ? "Lines Changed" : "Contributors"}
              value={
                selectedMember
                  ? `+${formatNumber(displayStats?.total_additions ?? 0)} / -${formatNumber(displayStats?.total_deletions ?? 0)}`
                  : displayStats?.active_contributors ?? 0
              }
              subtitle={
                selectedMember
                  ? `Net: ${formatNumber((displayStats?.total_additions ?? 0) - (displayStats?.total_deletions ?? 0))}`
                  : `of ${analytics?.members.length ?? 0} members`
              }
              icon={selectedMember ? Code2 : Users}
              iconColor={selectedMember ? "text-cyan-400" : "text-amber-400"}
              iconBgColor={selectedMember ? "bg-cyan-900/30" : "bg-amber-900/30"}
              loading={isLoading}
            />
          </div>
        )}

        {/* Activity Timeline */}
        {!isPermissionError && displayTimeline.length > 0 && (
          <div className="mb-8 bg-card rounded-xl border border-border p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-emerald-500" />
                {selectedMember ? `${selectedMember.name}'s Activity` : "Team Activity"}
              </h2>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Commits
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-blue-500" /> PRs
                </span>
              </div>
            </div>
            <ActivityChart data={displayTimeline} />
          </div>
        )}

        {/* ========== TEAM VIEW (no member selected) ========== */}
        {!isPermissionError && !selectedMember && (
          <>
            {/* Members Table + Top Repos */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
              {/* Members Table */}
              <div className="lg:col-span-2 bg-card rounded-xl border border-border overflow-hidden">
                <div className="p-4 border-b border-border">
                  <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <Users className="h-5 w-5 text-blue-500" />
                    Team Members
                  </h2>
                </div>
                {isLoading ? (
                  <TableSkeleton />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-muted-foreground">
                          <th className="text-left py-3 px-4 font-medium">Member</th>
                          <th className="text-right py-3 px-4 font-medium">Commits</th>
                          <th className="text-right py-3 px-4 font-medium">PRs</th>
                          <th className="text-right py-3 px-4 font-medium">Merged</th>
                          <th className="text-right py-3 px-4 font-medium">Reviews</th>
                          <th className="text-right py-3 px-4 font-medium">Lines</th>
                          <th className="text-right py-3 px-4 font-medium">Activity</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics?.members.map((member) => (
                          <MemberRow
                            key={member.developer_id}
                            member={member}
                            onClick={() => setSelectedMemberId(member.developer_id)}
                          />
                        ))}
                        {analytics?.members.length === 0 && (
                          <tr>
                            <td colSpan={7} className="text-center py-8 text-muted-foreground">
                              No GitHub activity found for this period.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Top Repositories */}
              <TopReposPanel
                repos={analytics?.summary.top_repositories ?? []}
                isLoading={isLoading}
              />
            </div>

            {/* Code Impact */}
            {analytics && (analytics.summary.total_additions > 0 || analytics.summary.total_deletions > 0) && (
              <CodeImpactPanel
                additions={analytics.summary.total_additions}
                deletions={analytics.summary.total_deletions}
              />
            )}
          </>
        )}

        {/* ========== INDIVIDUAL MEMBER VIEW ========== */}
        {!isPermissionError && selectedMember && (
          <>
            {/* Member header */}
            <div className="mb-6 flex items-center gap-4">
              {selectedMember.avatar_url ? (
                <img
                  src={selectedMember.avatar_url}
                  alt={selectedMember.name}
                  className="w-14 h-14 rounded-full ring-2 ring-primary/30"
                />
              ) : (
                <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center text-xl font-semibold text-muted-foreground ring-2 ring-primary/30">
                  {selectedMember.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <h2 className="text-xl font-bold text-foreground">{selectedMember.name}</h2>
                <p className="text-sm text-muted-foreground">{selectedMember.email}</p>
              </div>
            </div>

            {/* Repo-wise breakdown */}
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <GitBranch className="h-5 w-5 text-emerald-500" />
                Repository Breakdown
              </h3>
              {selectedMember.top_repositories.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {selectedMember.top_repositories.map((repo) => (
                    <RepoCard key={repo.repository} repo={repo} />
                  ))}
                </div>
              ) : (
                <div className="bg-card rounded-xl border border-border p-8 text-center">
                  <GitBranch className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">
                    No repository data available for this period.
                  </p>
                </div>
              )}
            </div>

            {/* Code Impact for member */}
            {(selectedMember.additions > 0 || selectedMember.deletions > 0) && (
              <CodeImpactPanel
                additions={selectedMember.additions}
                deletions={selectedMember.deletions}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

// ==================== Subcomponents ====================

function TableSkeleton() {
  return (
    <div className="p-4 space-y-3">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex gap-3 animate-pulse">
          <div className="w-10 h-10 bg-muted rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-muted rounded w-1/3" />
            <div className="h-3 bg-muted rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

function MemberRow({
  member,
  onClick,
}: {
  member: MemberGitHubStats;
  onClick: () => void;
}) {
  return (
    <tr
      className="border-b border-border cursor-pointer hover:bg-muted/50 transition"
      onClick={onClick}
    >
      <td className="py-3 px-4">
        <div className="flex items-center gap-3">
          {member.avatar_url ? (
            <img src={member.avatar_url} alt={member.name} className="w-8 h-8 rounded-full" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
              {member.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <p className="font-medium text-foreground text-sm">{member.name}</p>
            <p className="text-xs text-muted-foreground">{member.email}</p>
          </div>
        </div>
      </td>
      <td className="text-right py-3 px-4 font-mono text-foreground">{member.commits}</td>
      <td className="text-right py-3 px-4 font-mono text-foreground">{member.prs_created}</td>
      <td className="text-right py-3 px-4 font-mono text-emerald-400">{member.prs_merged}</td>
      <td className="text-right py-3 px-4 font-mono text-foreground">{member.reviews_given}</td>
      <td className="text-right py-3 px-4">
        <div className="flex items-center justify-end gap-1.5 text-xs font-mono">
          <span className="text-emerald-400">+{formatNumber(member.additions)}</span>
          <span className="text-red-400">-{formatNumber(member.deletions)}</span>
        </div>
      </td>
      <td className="py-3 px-4">
        <Sparkline data={member.activity_trend.map((d) => d.commits + d.prs)} />
      </td>
    </tr>
  );
}

function RepoCard({ repo }: { repo: MemberRepoStat }) {
  const totalChanges = repo.additions + repo.deletions;
  const addPct = totalChanges > 0 ? (repo.additions / totalChanges) * 100 : 50;

  return (
    <div className="bg-card rounded-xl border border-border p-5 hover:border-border transition">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <GitBranch className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-semibold text-foreground truncate">
            {repo.repository}
          </span>
        </div>
      </div>

      {/* Stat chips */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center gap-1.5 text-sm">
          <GitCommitHorizontal className="h-3.5 w-3.5 text-emerald-400" />
          <span className="font-mono text-foreground">{repo.commits}</span>
          <span className="text-muted-foreground text-xs">commits</span>
        </div>
        <div className="flex items-center gap-1.5 text-sm">
          <GitPullRequest className="h-3.5 w-3.5 text-blue-400" />
          <span className="font-mono text-foreground">{repo.prs}</span>
          <span className="text-muted-foreground text-xs">PRs</span>
        </div>
      </div>

      {/* Lines bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-emerald-400 font-mono">+{formatNumber(repo.additions)}</span>
          <span className="text-red-400 font-mono">-{formatNumber(repo.deletions)}</span>
        </div>
        <div className="flex h-1.5 rounded-full overflow-hidden bg-muted/30">
          <div
            className="bg-emerald-500 transition-all"
            style={{ width: `${addPct}%` }}
          />
          <div
            className="bg-red-500 transition-all"
            style={{ width: `${100 - addPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function TopReposPanel({
  repos,
  isLoading,
}: {
  repos: { repository: string; commits: number; prs: number; contributors: number }[];
  isLoading: boolean;
}) {
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="p-4 border-b border-border">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <GitBranch className="h-5 w-5 text-emerald-500" />
          Top Repositories
        </h2>
      </div>
      {isLoading ? (
        <div className="p-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse space-y-2">
              <div className="h-4 bg-muted rounded w-2/3" />
              <div className="h-3 bg-muted rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : (
        <div className="p-4 space-y-1">
          {repos.map((repo, idx) => (
            <div
              key={repo.repository}
              className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition"
            >
              <span className="text-xs text-muted-foreground font-mono mt-0.5">
                #{idx + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {repo.repository}
                </p>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <GitCommitHorizontal className="h-3 w-3" />
                    {repo.commits}
                  </span>
                  <span className="flex items-center gap-1">
                    <GitPullRequest className="h-3 w-3" />
                    {repo.prs}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {repo.contributors}
                  </span>
                </div>
              </div>
            </div>
          ))}
          {repos.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No repository data available.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function CodeImpactPanel({
  additions,
  deletions,
}: {
  additions: number;
  deletions: number;
}) {
  const net = additions - deletions;
  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
        <Code2 className="h-5 w-5 text-cyan-500" />
        Code Impact
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          <p className="text-sm text-muted-foreground mb-1">Lines Added</p>
          <p className="text-2xl font-bold text-emerald-400">+{formatNumber(additions)}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground mb-1">Lines Removed</p>
          <p className="text-2xl font-bold text-red-400">-{formatNumber(deletions)}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground mb-1">Net Change</p>
          <p className={`text-2xl font-bold ${net >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {net >= 0 ? "+" : ""}{formatNumber(net)}
          </p>
        </div>
      </div>
    </div>
  );
}

function ActivityChart({
  data,
}: {
  data: { date: string; commits: number; prs_opened: number; prs_merged: number; reviews: number }[];
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const displayData = useMemo(() => {
    if (data.length <= 60) return data;
    const step = Math.ceil(data.length / 60);
    return data.filter((_, i) => i % step === 0);
  }, [data]);

  const maxVal = useMemo(
    () => Math.max(...displayData.map((d) => d.commits + d.prs_opened), 1),
    [displayData]
  );

  // Y-axis tick marks
  const yTicks = useMemo(() => {
    const ticks: number[] = [0];
    const mid = Math.round(maxVal / 2);
    if (mid > 0 && mid !== maxVal) ticks.push(mid);
    ticks.push(maxVal);
    return ticks;
  }, [maxVal]);

  const chartHeight = 140;
  const barAreaHeight = chartHeight - 20; // room for date labels at bottom

  const hovered = hoveredIdx !== null ? displayData[hoveredIdx] : null;

  return (
    <div className="relative">
      {/* Tooltip */}
      {hovered && (
        <div className="absolute top-0 right-0 bg-popover border border-border rounded-lg px-3 py-2 shadow-lg z-10 text-xs pointer-events-none">
          <p className="font-medium text-foreground mb-1">{hovered.date}</p>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-emerald-500" />
              {hovered.commits} commits
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-blue-500" />
              {hovered.prs_opened} PRs
            </span>
          </div>
        </div>
      )}

      <div className="flex">
        {/* Y-axis labels */}
        <div
          className="flex flex-col justify-between pr-2 text-[10px] text-muted-foreground font-mono shrink-0"
          style={{ height: barAreaHeight }}
        >
          {yTicks.slice().reverse().map((v) => (
            <span key={v}>{v}</span>
          ))}
        </div>

        {/* Chart area */}
        <div className="flex-1 min-w-0">
          {/* Bars */}
          <div
            className="flex gap-[2px] relative"
            style={{ height: barAreaHeight }}
            onMouseLeave={() => setHoveredIdx(null)}
          >
            {/* Grid lines */}
            {yTicks.map((v) => (
              <div
                key={`grid-${v}`}
                className="absolute left-0 right-0 border-t border-border/30"
                style={{ top: `${((maxVal - v) / maxVal) * 100}%` }}
              />
            ))}

            {displayData.map((day, idx) => {
              const total = day.commits + day.prs_opened;
              const totalPct = (total / maxVal) * 100;
              const commitPct = total > 0 ? (day.commits / total) * 100 : 0;

              return (
                <div
                  key={day.date}
                  className="flex-1 min-w-[4px] flex flex-col justify-end relative z-[1] cursor-pointer"
                  onMouseEnter={() => setHoveredIdx(idx)}
                >
                  {total > 0 ? (
                    <div
                      className={`w-full rounded-t-sm overflow-hidden transition-all ${
                        hoveredIdx === idx ? "opacity-100" : "opacity-80 hover:opacity-100"
                      }`}
                      style={{ height: `${Math.max(totalPct, 3)}%` }}
                    >
                      {/* PR portion on top */}
                      {day.prs_opened > 0 && (
                        <div
                          className="w-full bg-blue-500"
                          style={{ height: `${100 - commitPct}%`, minHeight: 2 }}
                        />
                      )}
                      {/* Commit portion on bottom */}
                      {day.commits > 0 && (
                        <div
                          className="w-full bg-emerald-500"
                          style={{ height: `${commitPct}%`, minHeight: 2 }}
                        />
                      )}
                    </div>
                  ) : (
                    <div
                      className="w-full bg-muted/15 rounded-t-sm"
                      style={{ height: "3%" }}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Date labels */}
          <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground font-mono">
            <span>{displayData[0]?.date?.slice(5)}</span>
            {displayData.length > 10 && (
              <span>{displayData[Math.floor(displayData.length / 2)]?.date?.slice(5)}</span>
            )}
            <span>{displayData[displayData.length - 1]?.date?.slice(5)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Sparkline({ data }: { data: number[] }) {
  if (data.length === 0) return <div className="w-16 h-4" />;

  const max = Math.max(...data, 1);
  const width = 64;
  const height = 16;
  const step = data.length > 1 ? width / (data.length - 1) : 0;
  const points = data
    .map((val, i) => `${i * step},${height - (val / max) * height}`)
    .join(" ");

  return (
    <svg width={width} height={height} className="text-emerald-400">
      <polyline fill="none" stroke="currentColor" strokeWidth="1.5" points={points} />
    </svg>
  );
}

function formatNumber(n: number): string {
  if (Math.abs(n) >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}
