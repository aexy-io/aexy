"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BarChart2,
  TrendingUp,
  Users,
  Target,
  ArrowUpDown,
  Loader2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Filter,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useGTMScoringOverview, useGTMScoredLeads } from "@/hooks/useGTM";
import { TopLeadRow } from "@/lib/api";

const LIFECYCLE_COLORS: Record<string, string> = {
  anonymous: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
  known: "bg-slate-500/20 text-slate-400 border-slate-500/30",
  lead: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  mql: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
  sql: "bg-violet-500/20 text-violet-400 border-violet-500/30",
  opportunity: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  customer: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
};

const LIFECYCLE_LABELS: Record<string, string> = {
  anonymous: "Anonymous",
  known: "Known",
  lead: "Lead",
  mql: "MQL",
  sql: "SQL",
  opportunity: "Opportunity",
  customer: "Customer",
};

function ScoreBar({ score, max = 100 }: { score: number; max?: number }) {
  const pct = Math.min((score / max) * 100, 100);
  const color =
    score >= 70
      ? "bg-emerald-500"
      : score >= 40
        ? "bg-amber-500"
        : "bg-red-500";

  return (
    <div className="flex items-center gap-2">
      <div className="w-20 bg-white/10 rounded-full h-2">
        <div
          className={`${color} h-2 rounded-full transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-sm text-zinc-300 font-mono w-8 text-right">
        {score}
      </span>
    </div>
  );
}

function ScoreDistribution({
  distribution,
}: {
  distribution: Array<{ range: string; count: number }>;
}) {
  const maxCount = Math.max(...distribution.map((d) => d.count), 1);

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-white mb-4">
        Score Distribution
      </h3>
      <div className="space-y-3">
        {distribution.map((bucket) => (
          <div key={bucket.range} className="flex items-center gap-3">
            <span className="text-sm text-zinc-400 w-14 font-mono">
              {bucket.range}
            </span>
            <div className="flex-1 bg-white/5 rounded-full h-6 relative">
              <div
                className="bg-gradient-to-r from-indigo-500 to-violet-500 h-6 rounded-full transition-all duration-500 flex items-center justify-end pr-2"
                style={{
                  width: `${Math.max((bucket.count / maxCount) * 100, 4)}%`,
                }}
              >
                {bucket.count > 0 && (
                  <span className="text-xs text-white font-medium">
                    {bucket.count}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LifecycleFunnel({
  breakdown,
}: {
  breakdown: Array<{ stage: string; count: number }>;
}) {
  const total = breakdown.reduce((sum, b) => sum + b.count, 0) || 1;

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-white mb-4">
        Lifecycle Stages
      </h3>
      <div className="space-y-3">
        {breakdown.map((item) => {
          const pct = ((item.count / total) * 100).toFixed(1);
          return (
            <div key={item.stage} className="flex items-center gap-3">
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border w-24 justify-center ${
                  LIFECYCLE_COLORS[item.stage] || LIFECYCLE_COLORS.anonymous
                }`}
              >
                {LIFECYCLE_LABELS[item.stage] || item.stage}
              </span>
              <div className="flex-1 bg-white/5 rounded-full h-5">
                <div
                  className="bg-white/10 h-5 rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.max(parseFloat(pct), 2)}%`,
                  }}
                />
              </div>
              <span className="text-sm text-zinc-300 w-12 text-right">
                {item.count}
              </span>
              <span className="text-xs text-zinc-500 w-12 text-right">
                {pct}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LeadsTable({
  leads,
  page,
  total,
  perPage,
  onPageChange,
}: {
  leads: TopLeadRow[];
  page: number;
  total: number;
  perPage: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.ceil(total / perPage);

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Scored Leads</h3>
        <span className="text-sm text-zinc-400">
          {total} total leads
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5">
              <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-6 py-3">
                Record ID
              </th>
              <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-6 py-3">
                Total Score
              </th>
              <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-6 py-3">
                Firmographic
              </th>
              <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-6 py-3">
                Behavioral
              </th>
              <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-6 py-3">
                Engagement
              </th>
              <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-6 py-3">
                Lifecycle
              </th>
              <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-6 py-3">
                Last Scored
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {leads.map((lead) => (
              <tr
                key={lead.record_id}
                className="hover:bg-white/5 transition-colors"
              >
                <td className="px-6 py-4">
                  <span className="text-zinc-300 text-sm font-mono">
                    {lead.record_id.slice(0, 8)}...
                  </span>
                </td>
                <td className="px-6 py-4">
                  <ScoreBar score={lead.total_score} />
                </td>
                <td className="px-6 py-4">
                  <span className="text-zinc-400 text-sm font-mono">
                    {lead.firmographic_score}/40
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className="text-zinc-400 text-sm font-mono">
                    {lead.behavioral_score}/35
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className="text-zinc-400 text-sm font-mono">
                    {lead.engagement_score}/25
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                      LIFECYCLE_COLORS[lead.lifecycle_stage] ||
                      LIFECYCLE_COLORS.anonymous
                    }`}
                  >
                    {LIFECYCLE_LABELS[lead.lifecycle_stage] ||
                      lead.lifecycle_stage}
                  </span>
                </td>
                <td className="px-6 py-4 text-zinc-500 text-sm">
                  {lead.last_scored_at
                    ? new Date(lead.last_scored_at).toLocaleDateString()
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {leads.length === 0 && (
        <div className="px-6 py-12 text-center text-zinc-500">
          No scored leads yet. Leads are scored automatically when visitor sessions are identified.
        </div>
      )}
      {totalPages > 1 && (
        <div className="px-6 py-3 border-t border-white/5 flex items-center justify-between">
          <span className="text-sm text-zinc-500">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="p-1.5 rounded bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4 text-zinc-400" />
            </button>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="p-1.5 rounded bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4 text-zinc-400" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ScoringPage() {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;

  const [page, setPage] = useState(1);
  const [lifecycleFilter, setLifecycleFilter] = useState<string>("");

  const { overview, isLoading: overviewLoading, refetch: refetchOverview } =
    useGTMScoringOverview(workspaceId);
  const { leads, total, perPage, isLoading: leadsLoading, refetch: refetchLeads } =
    useGTMScoredLeads(workspaceId, {
      page,
      per_page: 25,
      lifecycle_stage: lifecycleFilter || undefined,
      sort_by: "total_score",
      sort_dir: "desc",
    });

  const isLoading = overviewLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
          <span className="text-zinc-400 text-sm">Loading scoring data...</span>
        </div>
      </div>
    );
  }

  const safeOverview = overview ?? {
    total_scored: 0,
    avg_score: 0,
    score_distribution: [],
    lifecycle_breakdown: [],
    top_leads: [],
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <BarChart2 className="w-7 h-7 text-indigo-400" />
              Lead Scoring
            </h1>
            <p className="text-zinc-400 mt-1">
              Multi-factor scoring: Firmographic (40%) + Behavioral (35%) + Engagement (25%)
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                refetchOverview();
                refetchLeads();
              }}
              className="inline-flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 rounded-lg text-sm transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
            <Link
              href="/gtm/scoring/icp"
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Target className="w-4 h-4" />
              ICP Templates
            </Link>
          </div>
        </div>

        {/* KPI Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <div className="flex items-center gap-2 text-zinc-400 text-sm mb-2">
              <Users className="w-4 h-4" />
              Total Scored
            </div>
            <p className="text-3xl font-bold text-white">
              {safeOverview.total_scored.toLocaleString()}
            </p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <div className="flex items-center gap-2 text-zinc-400 text-sm mb-2">
              <TrendingUp className="w-4 h-4" />
              Average Score
            </div>
            <p className="text-3xl font-bold text-white">
              {safeOverview.avg_score.toFixed(1)}
            </p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <div className="flex items-center gap-2 text-zinc-400 text-sm mb-2">
              <ArrowUpDown className="w-4 h-4" />
              Scoring Model
            </div>
            <p className="text-lg font-semibold text-white">Deterministic</p>
            <p className="text-xs text-zinc-500 mt-1">
              Firmo 40% + Behav 35% + Engage 25%
            </p>
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
          <ScoreDistribution distribution={safeOverview.score_distribution} />
          <LifecycleFunnel breakdown={safeOverview.lifecycle_breakdown} />
        </div>

        {/* Filter Bar */}
        <div className="flex items-center gap-3 mb-4">
          <Filter className="w-4 h-4 text-zinc-500" />
          <span className="text-sm text-zinc-400">Filter by lifecycle:</span>
          {["", "lead", "mql", "sql", "opportunity", "customer"].map(
            (stage) => (
              <button
                key={stage}
                onClick={() => {
                  setLifecycleFilter(stage);
                  setPage(1);
                }}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  lifecycleFilter === stage
                    ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/30"
                    : "bg-white/5 text-zinc-400 border-white/10 hover:bg-white/10"
                }`}
              >
                {stage === "" ? "All" : LIFECYCLE_LABELS[stage] || stage}
              </button>
            )
          )}
        </div>

        {/* Leads Table */}
        <LeadsTable
          leads={leads}
          page={page}
          total={total}
          perPage={perPage}
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}
