"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  GitCompare,
  Users,
  Plus,
  X,
  ChevronDown,
  Info,
  Search,
} from "lucide-react";
import {
  insightsApi,
  InsightsPeriodType,
  DeveloperInsightsResponse,
  MemberSummary,
} from "@/lib/api";
import { useTeamInsights } from "@/hooks/useInsights";
import {
  MetricsRadar,
  RadarDataPoint,
} from "@/components/insights/MetricsRadar";
import {
  ActivityHeatmap,
  HeatmapCell,
} from "@/components/insights/ActivityHeatmap";

// Same honorific-stripping pass the dedupe script uses server-side.
// Acts as a fallback when the API didn't supply `identity_key` (older
// caches, custom integrations) so the picker still collapses obvious
// name twins.
const _HONORIFICS = new Set([
  "md", "mr", "mrs", "ms", "dr", "mohd", "mohammed", "muhammad",
  "smt", "sri", "prof",
]);

function normalizeName(name: string | null | undefined): string | null {
  if (!name) return null;
  const cleaned = name.replace(/[^A-Za-z0-9]+/g, " ").toLowerCase().trim();
  if (!cleaned) return null;
  const tokens = cleaned.split(/\s+/).filter((t) => t && !_HONORIFICS.has(t));
  if (tokens.length === 0) return null;
  return tokens.join("");
}

function identityKeyFor(m: MemberSummary): string {
  if (m.identity_key) return m.identity_key;
  if (m.github_login) return `gh:${m.github_login.toLowerCase()}`;
  if (m.email) return `email:${m.email.toLowerCase()}`;
  const norm = normalizeName(m.developer_name);
  if (norm) return `name:${norm}`;
  return `dev:${m.developer_id}`;
}

const PERIOD_OPTIONS: { value: InsightsPeriodType; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "sprint", label: "Sprint" },
];

const RADAR_METRICS = [
  { key: "commits_count", label: "Commits", maxBase: 50, desc: "Total commits pushed during the period" },
  { key: "prs_merged", label: "PRs Merged", maxBase: 10, desc: "Pull requests successfully merged" },
  { key: "pr_throughput", label: "PR Throughput", maxBase: 5, desc: "PRs merged per week" },
  { key: "review_participation_rate", label: "Review Rate", maxBase: 2, desc: "Code reviews per working day" },
  { key: "unique_collaborators", label: "Collaborators", maxBase: 10, desc: "Unique developers collaborated with" },
  { key: "pr_merge_rate", label: "Merge Rate", maxBase: 1, desc: "Percentage of PRs that were merged" },
];

function getMetricValue(
  dev: DeveloperInsightsResponse,
  key: string
): number {
  switch (key) {
    case "commits_count":
      return dev.velocity.commits_count;
    case "prs_merged":
      return dev.velocity.prs_merged;
    case "pr_throughput":
      return dev.velocity.pr_throughput;
    case "review_participation_rate":
      return dev.quality.review_participation_rate;
    case "unique_collaborators":
      return dev.collaboration.unique_collaborators;
    case "pr_merge_rate":
      return dev.efficiency.pr_merge_rate;
    default:
      return 0;
  }
}

export default function ComparePage() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const { currentWorkspaceId } = useWorkspace();
  const [periodType, setPeriodType] = useState<InsightsPeriodType>("weekly");
  const [selectedDevIds, setSelectedDevIds] = useState<string[]>([]);
  const [compareResults, setCompareResults] = useState<
    DeveloperInsightsResponse[]
  >([]);
  const [loading, setLoading] = useState(false);

  const { teamInsights } = useTeamInsights(currentWorkspaceId, {
    period_type: periodType,
  });

  // Toggles default to the "least confusing" state: hide past members,
  // hide external contributors. Power users flip them on as needed.
  const [includePastMembers, setIncludePastMembers] = useState(false);
  const [includeExternal, setIncludeExternal] = useState(false);

  const rawMembers = teamInsights?.distribution?.member_metrics ?? [];

  // Client-side identity rollup. Backend already does the same pass,
  // but we keep a fallback here for two reasons:
  //   1. Older cached responses may pre-date the backend rollup field.
  //   2. Name-twin ghosts that share neither email nor github_login
  //      still get collapsed by the normalized-name path in
  //      `identityKeyFor` — the server's identity_key only kicks in
  //      when one of those stable IDs exists.
  const availableMembers = useMemo<MemberSummary[]>(() => {
    if (!rawMembers.length) return [];
    const groups = new Map<string, MemberSummary[]>();
    for (const m of rawMembers) {
      const key = identityKeyFor(m);
      const list = groups.get(key);
      if (list) list.push(m);
      else groups.set(key, [m]);
    }
    // Membership rank mirrors the backend's _rollup_by_identity so the
    // "canonical" row in a group is the same on both sides.
    const rank: Record<string, number> = {
      active: 4, pending: 3, suspended: 2, removed: 1, external: 0,
    };
    const out: MemberSummary[] = [];
    for (const list of groups.values()) {
      if (list.length === 1) {
        out.push(list[0]);
        continue;
      }
      const sorted = [...list].sort((a, b) => {
        const ra = rank[a.membership_status ?? "external"] ?? 0;
        const rb = rank[b.membership_status ?? "external"] ?? 0;
        if (ra !== rb) return rb - ra;
        return b.commits_count - a.commits_count;
      });
      const canonical = { ...sorted[0] };
      for (const extra of sorted.slice(1)) {
        canonical.commits_count += extra.commits_count;
        canonical.prs_merged += extra.prs_merged;
        canonical.lines_changed += extra.lines_changed;
        canonical.reviews_given += extra.reviews_given;
        if (!canonical.email && extra.email) canonical.email = extra.email;
        if (!canonical.avatar_url && extra.avatar_url) {
          canonical.avatar_url = extra.avatar_url;
        }
      }
      out.push(canonical);
    }
    out.sort((a, b) => b.commits_count - a.commits_count);
    return out;
  }, [rawMembers]);

  // Filter for visibility (selecting + listing in picker). Selected
  // developers stay visible even when their group is filtered out so a
  // chip never silently disappears.
  const visibleMembers = useMemo<MemberSummary[]>(() => {
    return availableMembers.filter((m) => {
      if (selectedDevIds.includes(m.developer_id)) return true;
      if (!includePastMembers && m.membership_status === "removed") return false;
      if (!includeExternal && m.membership_status === "external") return false;
      return true;
    });
  }, [availableMembers, selectedDevIds, includePastMembers, includeExternal]);

  // Display name and lookup by developer_id (selected chips use this).
  const memberById = useMemo(() => {
    const map = new Map<string, MemberSummary>();
    for (const m of availableMembers) map.set(m.developer_id, m);
    return map;
  }, [availableMembers]);
  const devName = (id: string) =>
    memberById.get(id)?.developer_name || id.slice(0, 8);

  const fetchComparison = useCallback(async () => {
    if (!currentWorkspaceId || selectedDevIds.length < 2) return;
    setLoading(true);
    try {
      const results = await insightsApi.compareDevs(
        currentWorkspaceId,
        selectedDevIds,
        { period_type: periodType }
      );
      setCompareResults(results);
    } catch (err) {
      console.error("Failed to fetch comparison:", err);
    } finally {
      setLoading(false);
    }
  }, [currentWorkspaceId, selectedDevIds, periodType]);

  useEffect(() => {
    if (selectedDevIds.length >= 2) {
      fetchComparison();
    } else {
      setCompareResults([]);
    }
  }, [selectedDevIds, periodType, fetchComparison]);

  const addDeveloper = (devId: string) => {
    if (selectedDevIds.length >= 6) return;
    if (!selectedDevIds.includes(devId)) {
      setSelectedDevIds([...selectedDevIds, devId]);
    }
  };

  const removeDeveloper = (devId: string) => {
    setSelectedDevIds(selectedDevIds.filter((id) => id !== devId));
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500" />
      </div>
    );
  }

  if (!isAuthenticated) {
    redirect("/");
  }

  // Build radar chart data
  const radarData: RadarDataPoint[] = RADAR_METRICS.map((m) => {
    const point: RadarDataPoint = {
      metric: m.label,
      desc: m.desc,
      fullMark: m.maxBase,
    };
    compareResults.forEach((dev) => {
      const val = getMetricValue(dev, m.key);
      point[dev.developer_id] = Math.round(val * 100) / 100;
      if (val > m.maxBase) {
        point.fullMark = Math.max(point.fullMark as number, Math.ceil(val));
      }
    });
    return point;
  });

  const radarDevs = compareResults.map((dev) => ({
    id: dev.developer_id,
    name: devName(dev.developer_id),
  }));

  // Build heatmap data (mock weekly breakdown from available data)
  const heatmapData: HeatmapCell[] = [];
  if (compareResults.length > 0) {
    // Generate weekly data from the period
    compareResults.forEach((dev) => {
      const start = new Date(dev.period_start);
      const end = new Date(dev.period_end);
      const totalDays = Math.max(
        1,
        (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
      );
      const totalCommits = dev.velocity.commits_count;
      const avgPerDay = totalCommits / totalDays;

      // Create weekly buckets
      const current = new Date(start);
      while (current < end) {
        const weekNum = getISOWeek(current);
        const year = current.getFullYear();
        const weekLabel = `${year}-W${String(weekNum).padStart(2, "0")}`;
        const daysInWeek = Math.min(
          7,
          (end.getTime() - current.getTime()) / (1000 * 60 * 60 * 24)
        );
        heatmapData.push({
          developerId: dev.developer_id,
          developerName: devName(dev.developer_id),
          week: weekLabel,
          value: Math.round(avgPerDay * daysInWeek),
        });
        current.setDate(current.getDate() + 7);
      }
    });
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/insights"
              className="text-muted-foreground hover:text-foreground transition"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <GitCompare className="h-6 w-6 text-indigo-400" />
              Developer Comparison
            </h1>
          </div>
          <p className="text-muted-foreground text-sm">
            Side-by-side comparison with radar chart and activity heatmap
          </p>
        </div>
        <div className="flex bg-muted rounded-lg border border-border overflow-hidden">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setPeriodType(opt.value)}
              className={`px-3 py-1.5 text-sm font-medium transition ${
                periodType === opt.value
                  ? "bg-indigo-600 text-white"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Developer Selector */}
      <div className="bg-muted rounded-xl p-4 border border-border">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-foreground">
              Select developers to compare (2-6)
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={includePastMembers}
                onChange={(e) => setIncludePastMembers(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              Include past members
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={includeExternal}
                onChange={(e) => setIncludeExternal(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              Include external contributors
            </label>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selectedDevIds.map((devId) => {
            const m = memberById.get(devId);
            const isRemoved = m?.membership_status === "removed";
            const isExternal = m?.membership_status === "external";
            return (
              <div
                key={devId}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border ${
                  isRemoved
                    ? "bg-muted-foreground/10 border-muted-foreground/20"
                    : "bg-indigo-600/20 border-indigo-500/30"
                }`}
              >
                <span className="text-sm text-indigo-300">{devName(devId)}</span>
                {isRemoved && (
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    left
                  </span>
                )}
                {isExternal && (
                  <span className="text-[10px] uppercase tracking-wide text-amber-400">
                    external
                  </span>
                )}
                <button
                  onClick={() => removeDeveloper(devId)}
                  className="text-indigo-400 hover:text-foreground transition"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
          {selectedDevIds.length < 6 && (
            <DeveloperPicker
              members={visibleMembers}
              selectedDevIds={selectedDevIds}
              onAdd={addDeveloper}
            />
          )}
        </div>
      </div>

      {selectedDevIds.length < 2 && (
        <div className="bg-muted rounded-xl p-8 border border-border text-center">
          <p className="text-muted-foreground">
            Select at least 2 developers to see the comparison.
          </p>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500" />
        </div>
      )}

      {compareResults.length >= 2 && !loading && (
        <>
          {/* Radar Chart + Summary Table */}
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Radar Chart */}
            <div className="bg-muted rounded-xl p-6 border border-border">
              <h2 className="text-lg font-semibold text-foreground mb-4">
                Metrics Radar
              </h2>
              <MetricsRadar
                data={radarData}
                developers={radarDevs}
                height={350}
              />
            </div>

            {/* Summary Table */}
            <div className="bg-muted rounded-xl p-6 border border-border overflow-x-auto">
              <h2 className="text-lg font-semibold text-foreground mb-4">
                Side-by-Side Metrics
              </h2>
              <table className="w-full min-w-[600px]">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="pb-2 font-medium">Metric</th>
                    {compareResults.map((dev) => (
                      <th
                        key={dev.developer_id}
                        className="pb-2 font-medium text-right"
                      >
                        <Link
                          href={`/insights/developers/${dev.developer_id}`}
                          className="text-indigo-400 hover:text-indigo-300"
                        >
                          {devName(dev.developer_id)}
                        </Link>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      label: "Commits",
                      desc: "Total number of commits pushed during the period",
                      get: (d: DeveloperInsightsResponse) =>
                        d.velocity.commits_count,
                    },
                    {
                      label: "PRs Merged",
                      desc: "Pull requests successfully merged into the target branch",
                      get: (d: DeveloperInsightsResponse) =>
                        d.velocity.prs_merged,
                    },
                    {
                      label: "Lines Added",
                      desc: "Total lines of code added across all commits",
                      get: (d: DeveloperInsightsResponse) =>
                        d.velocity.lines_added,
                    },
                    {
                      label: "PR Cycle (hrs)",
                      desc: "Average time from PR creation to merge. Lower is better",
                      get: (d: DeveloperInsightsResponse) =>
                        d.efficiency.avg_pr_cycle_time_hours,
                      lower: true,
                    },
                    {
                      label: "Merge Rate",
                      desc: "Percentage of opened PRs that were merged (vs closed without merge)",
                      get: (d: DeveloperInsightsResponse) =>
                        d.efficiency.pr_merge_rate,
                      pct: true,
                    },
                    {
                      label: "Review Depth",
                      desc: "Average number of comments left per code review",
                      get: (d: DeveloperInsightsResponse) =>
                        d.quality.avg_review_depth,
                    },
                    {
                      label: "Self-merge Rate",
                      desc: "PRs merged without review from another developer. Lower is better",
                      get: (d: DeveloperInsightsResponse) =>
                        d.quality.self_merge_rate,
                      pct: true,
                      lower: true,
                    },
                    {
                      label: "Weekend Ratio",
                      desc: "Percentage of commits made on weekends. High values may indicate overwork",
                      get: (d: DeveloperInsightsResponse) =>
                        d.sustainability.weekend_commit_ratio,
                      pct: true,
                      lower: true,
                    },
                    {
                      label: "Collaborators",
                      desc: "Number of unique developers this person co-authored or reviewed with",
                      get: (d: DeveloperInsightsResponse) =>
                        d.collaboration.unique_collaborators,
                    },
                  ].map((row) => {
                    const values = compareResults.map((d) => row.get(d));
                    const best = row.lower
                      ? Math.min(...values.filter((v) => v > 0))
                      : Math.max(...values);

                    return (
                      <tr
                        key={row.label}
                        className="border-b border-border/30"
                      >
                        <td className="py-2 text-xs text-muted-foreground">
                          <span className="group relative inline-flex items-center gap-1 cursor-help">
                            {row.label}
                            <Info className="h-3 w-3 text-muted-foreground group-hover:text-muted-foreground transition" />
                            <span className="invisible group-hover:visible absolute left-0 bottom-full mb-1 w-52 px-3 py-2 text-xs text-foreground bg-background border border-border rounded-lg shadow-lg z-20">
                              {row.desc}
                            </span>
                          </span>
                        </td>
                        {compareResults.map((dev) => {
                          const val = row.get(dev);
                          const isBest =
                            val === best && val > 0;
                          return (
                            <td
                              key={dev.developer_id}
                              className={`py-2 text-right text-sm font-mono ${
                                isBest
                                  ? "text-green-400 font-semibold"
                                  : "text-foreground"
                              }`}
                            >
                              {row.pct
                                ? `${(val * 100).toFixed(0)}%`
                                : typeof val === "number" && val % 1 !== 0
                                  ? val.toFixed(1)
                                  : val}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Activity Heatmap */}
          {heatmapData.length > 0 && (
            <div className="bg-muted rounded-xl p-6 border border-border">
              <h2 className="text-lg font-semibold text-foreground mb-4">
                Activity Heatmap
              </h2>
              <ActivityHeatmap data={heatmapData} metric="commits" />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function getISOWeek(date: Date): number {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  );
}

interface DeveloperPickerProps {
  members: MemberSummary[];
  selectedDevIds: string[];
  onAdd: (developerId: string) => void;
}

// Searchable picker. Replaces the previous unfiltered dropdown so a
// workspace with dozens of contributors doesn't force scroll-hunting.
// Search corpus = name + email + github_login so the user can find the
// same person under whichever identity they remember.
function DeveloperPicker({ members, selectedDevIds, onAdd }: DeveloperPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Esc.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  useEffect(() => {
    if (open) {
      // Focus input on open; reset query so prior search doesn't leak
      // into the next selection session.
      setQuery("");
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = members.filter((m) => !selectedDevIds.includes(m.developer_id));
    if (!q) return pool;
    return pool.filter((m) => {
      const haystack = [
        m.developer_name,
        m.email,
        m.github_login,
        m.developer_id,
      ]
        .filter(Boolean)
        .map((s) => (s as string).toLowerCase());
      return haystack.some((s) => s.includes(q));
    });
  }, [members, selectedDevIds, query]);

  // Keep activeIndex in range when filter shrinks.
  useEffect(() => {
    if (activeIndex >= filtered.length) setActiveIndex(0);
  }, [filtered.length, activeIndex]);

  const handleSelect = (id: string) => {
    onAdd(id);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(0, filtered.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = filtered[activeIndex];
      if (target) handleSelect(target.developer_id);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-muted border border-border rounded-lg text-sm text-foreground transition"
      >
        <Plus className="h-3.5 w-3.5" />
        Add Developer
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-80 bg-popover border border-border rounded-lg shadow-xl z-20 overflow-hidden">
          <div className="px-3 py-2 border-b border-border flex items-center gap-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={onKeyDown}
              placeholder="Search name, email, or GitHub login"
              className="flex-1 bg-transparent border-none outline-none text-sm text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-72 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-4 py-3 text-xs text-muted-foreground">
                {query
                  ? "No matches. Try a different name or toggle past / external."
                  : "No developers available."}
              </div>
            ) : (
              filtered.map((m, i) => {
                const isRemoved = m.membership_status === "removed";
                const isExternal = m.membership_status === "external";
                return (
                  <button
                    key={m.developer_id}
                    onClick={() => handleSelect(m.developer_id)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={`w-full text-left px-3 py-2 transition ${
                      i === activeIndex ? "bg-accent" : "hover:bg-accent/60"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-foreground truncate">
                        {m.developer_name || m.github_login || m.developer_id.slice(0, 8)}
                      </span>
                      {isRemoved && (
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          left
                        </span>
                      )}
                      {isExternal && (
                        <span className="text-[10px] uppercase tracking-wide text-amber-400">
                          external
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-2 mt-0.5">
                      {m.github_login && <span>@{m.github_login}</span>}
                      {m.email && <span className="truncate">{m.email}</span>}
                      <span className="ml-auto whitespace-nowrap">
                        {m.commits_count}c · {m.prs_merged}pr
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
