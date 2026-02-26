"use client";

import { useState } from "react";
import { Crosshair, Loader2, RefreshCw, Filter, Zap } from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useGTMIntentSignals, useGTMIntentSummary } from "@/hooks/useGTM";
import { ChevronLeft, ChevronRight } from "lucide-react";

const STRENGTH_STYLES: Record<string, string> = {
  low:      "bg-zinc-500/20 text-muted-foreground border-zinc-500/30",
  medium:   "bg-blue-500/20 text-blue-400 border-blue-500/30",
  high:     "bg-amber-500/20 text-amber-400 border-amber-500/30",
  critical: "bg-red-500/20 text-red-400 border-red-500/30",
};

const SIGNAL_TYPE_STYLES: Record<string, string> = {
  website_visit:    "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
  content_download: "bg-violet-500/20 text-violet-400 border-violet-500/30",
  pricing_page:     "bg-amber-500/20 text-amber-400 border-amber-500/30",
  demo_request:     "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  job_posting:      "bg-blue-500/20 text-blue-400 border-blue-500/30",
  social_signal:    "bg-pink-500/20 text-pink-400 border-pink-500/30",
};

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

const STRENGTH_OPTIONS = ["all", "low", "medium", "high", "critical"];

export default function IntentSignalsPage() {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id ?? null;

  const [page, setPage] = useState(1);
  const [signalType, setSignalType] = useState<string | undefined>();
  const [intentStrength, setIntentStrength] = useState<string | undefined>();

  const { signals, total, isLoading } = useGTMIntentSignals(workspaceId, {
    page,
    signal_type: signalType,
    intent_strength: intentStrength,
  });
  const { summary, isLoading: summaryLoading } = useGTMIntentSummary(workspaceId);

  const PER_PAGE = 25;
  const totalPages = Math.ceil(total / PER_PAGE);

  const byStrength = summary?.by_strength ?? {};
  const highCritical =
    (byStrength.high ?? 0) + (byStrength.critical ?? 0);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
              <Crosshair className="w-7 h-7 text-indigo-400" />
              Intent Signals
            </h1>
            <p className="text-muted-foreground mt-1">Buying-intent signals detected across your accounts</p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 px-3 py-2 bg-muted/50 hover:bg-muted border border-border text-foreground rounded-lg text-sm transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        {/* KPIs */}
        {summaryLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <KpiCard
              label="Total Signals"
              value={(summary?.total_signals ?? 0).toLocaleString()}
              icon={<Crosshair className="w-4 h-4" />}
            />
            <KpiCard
              label="Unprocessed"
              value={(summary?.unprocessed_count ?? 0).toLocaleString()}
              icon={<Filter className="w-4 h-4" />}
            />
            <KpiCard
              label="High / Critical"
              value={highCritical.toLocaleString()}
              icon={<Zap className="w-4 h-4" />}
            />
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Strength:</span>
            {STRENGTH_OPTIONS.map((s) => (
              <button
                key={s}
                onClick={() => {
                  setIntentStrength(s === "all" ? undefined : s);
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  (s === "all" && !intentStrength) || intentStrength === s
                    ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30"
                    : "bg-muted/50 text-muted-foreground border border-border hover:bg-muted"
                }`}
              >
                {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Type:</span>
            <input
              type="text"
              placeholder="e.g. pricing_page"
              value={signalType ?? ""}
              onChange={(e) => {
                setSignalType(e.target.value || undefined);
                setPage(1);
              }}
              className="bg-muted/50 border border-border rounded-lg px-3 py-1.5 text-sm text-foreground placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 w-44"
            />
          </div>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
          </div>
        ) : (
          <div className="bg-muted/50 border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/50">
                    {["Title", "Company", "Signal Type", "Strength", "Confidence", "Detected"].map(
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
                  {signals.map((sig: any) => (
                    <tr key={sig.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-6 py-4 text-sm text-foreground font-medium max-w-xs truncate">
                        {sig.title ?? "—"}
                      </td>
                      <td className="px-6 py-4 text-sm text-foreground">{sig.company_name ?? "—"}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
                            SIGNAL_TYPE_STYLES[sig.signal_type] ??
                            "bg-zinc-500/20 text-muted-foreground border-zinc-500/30"
                          }`}
                        >
                          {sig.signal_type?.replace(/_/g, " ") ?? "—"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
                            STRENGTH_STYLES[sig.intent_strength] ?? STRENGTH_STYLES.low
                          }`}
                        >
                          {sig.intent_strength ?? "—"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-foreground font-mono">
                        {sig.confidence_score != null
                          ? `${(sig.confidence_score * 100).toFixed(0)}%`
                          : "—"}
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">
                        {sig.detected_at ? new Date(sig.detected_at).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {signals.length === 0 && (
              <div className="px-6 py-12 text-center">
                <Crosshair className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
                <p className="text-muted-foreground font-medium">No intent signals detected yet</p>
                <p className="text-muted-foreground text-sm mt-1">
                  Signals are captured automatically from tracked accounts and integrations.
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
      </div>
    </div>
  );
}
