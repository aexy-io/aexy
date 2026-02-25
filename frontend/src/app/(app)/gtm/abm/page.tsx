"use client";

import { useState } from "react";
import { Target, Plus, Loader2, RefreshCw, Users, BarChart2, X } from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  useGTMABMOverview,
  useGTMABMTargetLists,
  useGTMABMAccounts,
} from "@/hooks/useGTM";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { gtmApi } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";

// Tier styles
const TIER_STYLES: Record<string, string> = {
  tier_1: "bg-violet-500/20 text-violet-400 border-violet-500/30",
  tier_2: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  tier_3: "bg-zinc-500/20 text-muted-foreground border-zinc-500/30",
};

// Stage styles
const STAGE_STYLES: Record<string, string> = {
  unaware:     "bg-zinc-500/20 text-muted-foreground border-zinc-500/30",
  aware:       "bg-blue-500/20 text-blue-400 border-blue-500/30",
  engaged:     "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
  opportunity: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  customer:    "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
};

const STAGES = ["unaware", "aware", "engaged", "opportunity", "customer"];
const TIERS  = ["tier_1", "tier_2", "tier_3"];

function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(Math.max(score, 0), 100);
  const color =
    pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 bg-muted rounded-full h-2">
        <div
          className={`${color} h-2 rounded-full transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground font-mono w-6 text-right">{score}</span>
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-muted/50 border border-border rounded-xl p-6">
      <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
        {icon}
        {label}
      </div>
      <p className="text-3xl font-bold text-foreground">{value}</p>
    </div>
  );
}

function StageBar({
  stage,
  count,
  total,
}: {
  stage: string;
  count: number;
  total: number;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  const styleClass = STAGE_STYLES[stage] ?? STAGE_STYLES.unaware;
  // extract text color from class string (e.g. "text-blue-400")
  const textColor = styleClass.split(" ").find((c) => c.startsWith("text-")) ?? "text-muted-foreground";

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-muted-foreground w-24 capitalize">{stage}</span>
      <div className="flex-1 bg-muted/50 rounded-full h-5">
        <div
          className="bg-indigo-500/40 h-5 rounded-full transition-all duration-500"
          style={{ width: `${Math.max(pct, 2)}%` }}
        />
      </div>
      <span className={`text-sm font-mono w-10 text-right ${textColor}`}>{count}</span>
      <span className="text-xs text-zinc-600 w-12 text-right">{pct.toFixed(1)}%</span>
    </div>
  );
}

export default function ABMPage() {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id ?? null;
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDynamic, setFormDynamic] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [tierFilter, setTierFilter]   = useState<string | undefined>();
  const [stageFilter, setStageFilter] = useState<string | undefined>();
  const [listFilter, setListFilter]   = useState<string | undefined>();

  const { overview, isLoading: overviewLoading }     = useGTMABMOverview(workspaceId);
  const { lists, isLoading: listsLoading }           = useGTMABMTargetLists(workspaceId);
  const { accounts, total, isLoading: accountsLoading } = useGTMABMAccounts(workspaceId, {
    page,
    target_list_id: listFilter,
    tier:  tierFilter,
    stage: stageFilter,
  });

  const PER_PAGE = 25;
  const totalPages = Math.ceil(total / PER_PAGE);

  const stageDistribution = overview?.stage_distribution ?? {};
  const stageTotal = STAGES.reduce((sum, s) => sum + (stageDistribution[s] ?? 0), 0);

  const avgEngagement =
    overview?.avg_engagement_score != null
      ? overview.avg_engagement_score.toFixed(1)
      : "—";

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
              <Target className="w-7 h-7 text-indigo-400" />
              Account-Based Marketing
            </h1>
            <p className="text-muted-foreground mt-1">Target account lists, tiers, and engagement tracking</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-3 py-2 bg-muted/50 hover:bg-muted border border-border text-foreground rounded-lg text-sm transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
            <button
              onClick={() => { setShowModal(true); setFormName(""); setFormDynamic(false); setFormError(null); }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              New List
            </button>
          </div>
        </div>

        {/* KPIs */}
        {overviewLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <KpiCard
              label="Total Lists"
              value={(overview?.total_lists ?? 0).toLocaleString()}
              icon={<Users className="w-4 h-4" />}
            />
            <KpiCard
              label="Total Accounts"
              value={(overview?.total_accounts ?? 0).toLocaleString()}
              icon={<Target className="w-4 h-4" />}
            />
            <KpiCard
              label="Avg Engagement Score"
              value={avgEngagement}
              icon={<BarChart2 className="w-4 h-4" />}
            />
          </div>
        )}

        {/* Stage distribution */}
        {!overviewLoading && stageTotal > 0 && (
          <div className="bg-muted/50 border border-border rounded-xl p-6 mb-8">
            <h2 className="text-sm font-semibold text-foreground mb-4">Stage Distribution</h2>
            <div className="space-y-3">
              {STAGES.map((s) => (
                <StageBar
                  key={s}
                  stage={s}
                  count={stageDistribution[s] ?? 0}
                  total={stageTotal}
                />
              ))}
            </div>
          </div>
        )}

        {/* Target Lists */}
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
          Target Lists
        </h2>
        {listsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
          </div>
        ) : lists.length === 0 ? (
          <div className="bg-muted/50 border border-border rounded-xl p-8 text-center mb-8">
            <Users className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
            <p className="text-muted-foreground text-sm">No target lists yet</p>
          </div>
        ) : (
          <div className="bg-muted/50 border border-border rounded-xl overflow-hidden mb-8">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/50">
                    {["Name", "Accounts", "Dynamic", "Active"].map((h) => (
                      <th
                        key={h}
                        className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-3"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {lists.map((lst: any) => (
                    <tr
                      key={lst.id}
                      className={`hover:bg-muted/50 transition-colors cursor-pointer ${
                        listFilter === lst.id ? "bg-indigo-500/5" : ""
                      }`}
                      onClick={() =>
                        setListFilter(listFilter === lst.id ? undefined : lst.id)
                      }
                    >
                      <td className="px-6 py-3 text-sm text-foreground font-medium">{lst.name}</td>
                      <td className="px-6 py-3 text-sm text-foreground font-mono">
                        {lst.account_count?.toLocaleString() ?? "—"}
                      </td>
                      <td className="px-6 py-3">
                        {lst.is_dynamic ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border bg-indigo-500/20 text-indigo-400 border-indigo-500/30">
                            Dynamic
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border bg-zinc-500/20 text-muted-foreground border-zinc-500/30">
                            Static
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3">
                        {lst.is_active ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border bg-zinc-500/20 text-muted-foreground border-zinc-500/30">
                            Inactive
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Accounts */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Accounts
          </h2>
          <div className="flex items-center gap-2 ml-auto">
            <select
              value={tierFilter ?? ""}
              onChange={(e) => {
                setTierFilter(e.target.value || undefined);
                setPage(1);
              }}
              className="bg-muted/50 border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            >
              <option value="">All Tiers</option>
              {TIERS.map((t) => (
                <option key={t} value={t} className="bg-zinc-900">
                  {t.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                </option>
              ))}
            </select>
            <select
              value={stageFilter ?? ""}
              onChange={(e) => {
                setStageFilter(e.target.value || undefined);
                setPage(1);
              }}
              className="bg-muted/50 border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            >
              <option value="">All Stages</option>
              {STAGES.map((s) => (
                <option key={s} value={s} className="bg-zinc-900">
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {accountsLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-7 h-7 text-indigo-400 animate-spin" />
          </div>
        ) : (
          <div className="bg-muted/50 border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/50">
                    {["Account", "Tier", "Stage", "Engagement", "Emails Sent", "Meetings"].map(
                      (h) => (
                        <th
                          key={h}
                          className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-3"
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {accounts.map((acc: any) => (
                    <tr key={acc.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-6 py-4 text-sm text-foreground font-mono">
                        {acc.record_id?.slice(0, 8) ?? "—"}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
                            TIER_STYLES[acc.tier] ?? TIER_STYLES.tier_3
                          }`}
                        >
                          {acc.tier?.replace("_", " ") ?? "—"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
                            STAGE_STYLES[acc.stage] ?? STAGE_STYLES.unaware
                          }`}
                        >
                          {acc.stage ? acc.stage.charAt(0).toUpperCase() + acc.stage.slice(1) : "—"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {acc.engagement_score != null ? (
                          <ScoreBar score={acc.engagement_score} />
                        ) : (
                          <span className="text-zinc-600 text-sm">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-foreground font-mono">
                        {acc.emails_sent?.toLocaleString() ?? "—"}
                      </td>
                      <td className="px-6 py-4 text-sm text-foreground font-mono">
                        {acc.meetings_booked?.toLocaleString() ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {accounts.length === 0 && (
              <div className="px-6 py-12 text-center">
                <Target className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
                <p className="text-muted-foreground font-medium">No accounts found</p>
                <p className="text-muted-foreground text-sm mt-1">
                  Add accounts to a target list to start tracking ABM engagement.
                </p>
              </div>
            )}

            {totalPages > 1 && (
              <div className="px-6 py-3 border-t border-border/50 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Page {page} of {totalPages} &mdash; {total} total
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="p-1.5 rounded bg-muted/50 hover:bg-muted disabled:opacity-30 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4 text-muted-foreground" />
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="p-1.5 rounded bg-muted/50 hover:bg-muted disabled:opacity-30 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        {/* New List Modal */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)} />
            <div className="relative bg-background border border-border rounded-2xl w-full max-w-md mx-4 shadow-2xl">
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <h2 className="text-lg font-semibold text-foreground">New Target List</h2>
                <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
              </div>
              <div className="px-6 py-5 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Name</label>
                  <input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Enterprise Target Accounts" className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
                </div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={formDynamic} onChange={(e) => setFormDynamic(e.target.checked)} className="w-4 h-4 rounded border-border text-indigo-600 focus:ring-indigo-500/50" />
                  <div>
                    <span className="text-sm font-medium text-foreground">Dynamic list</span>
                    <p className="text-xs text-muted-foreground">Automatically add accounts matching criteria</p>
                  </div>
                </label>
                {formError && <p className="text-sm text-red-400">{formError}</p>}
              </div>
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
                <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
                <button
                  disabled={!formName.trim() || creating}
                  onClick={async () => {
                    if (!workspaceId || !formName.trim()) return;
                    setCreating(true);
                    setFormError(null);
                    try {
                      await gtmApi.abm.createList(workspaceId, { name: formName.trim(), is_dynamic: formDynamic, is_active: true });
                      queryClient.invalidateQueries({ queryKey: ["gtmABMTargetLists", workspaceId] });
                      queryClient.invalidateQueries({ queryKey: ["gtmABMOverview", workspaceId] });
                      setShowModal(false);
                    } catch {
                      setFormError("Failed to create target list");
                    } finally {
                      setCreating(false);
                    }
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
                >
                  {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                  Create List
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
