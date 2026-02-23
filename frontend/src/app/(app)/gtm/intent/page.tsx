"use client";

import { useState } from "react";
import { Crosshair, Loader2, RefreshCw, Filter, Zap } from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useGTMIntentSignals, useGTMIntentSummary } from "@/hooks/useGTM";
import { ChevronLeft, ChevronRight } from "lucide-react";

const STRENGTH_STYLES: Record<string, string> = {
  low:      "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
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
    <div className="bg-white/5 border border-white/10 rounded-xl p-6">
      <div className="flex items-center gap-2 text-zinc-400 text-sm mb-2">
        {icon}
        {label}
      </div>
      <p className="text-3xl font-bold text-white">{value}</p>
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

  const highCritical =
    (summary?.high_count ?? 0) + (summary?.critical_count ?? 0);

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <Crosshair className="w-7 h-7 text-indigo-400" />
              Intent Signals
            </h1>
            <p className="text-zinc-400 mt-1">Buying-intent signals detected across your accounts</p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 rounded-lg text-sm transition-colors"
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
              value={(summary?.total_count ?? 0).toLocaleString()}
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
            <Filter className="w-4 h-4 text-zinc-500" />
            <span className="text-sm text-zinc-400">Strength:</span>
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
                    : "bg-white/5 text-zinc-400 border border-white/10 hover:bg-white/10"
                }`}
              >
                {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-zinc-400">Type:</span>
            <input
              type="text"
              placeholder="e.g. pricing_page"
              value={signalType ?? ""}
              onChange={(e) => {
                setSignalType(e.target.value || undefined);
                setPage(1);
              }}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 w-44"
            />
          </div>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
          </div>
        ) : (
          <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/5">
                    {["Title", "Company", "Signal Type", "Strength", "Confidence", "Detected"].map(
                      (h) => (
                        <th
                          key={h}
                          className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-6 py-3"
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {signals.map((sig: any) => (
                    <tr key={sig.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4 text-sm text-white font-medium max-w-xs truncate">
                        {sig.title ?? "—"}
                      </td>
                      <td className="px-6 py-4 text-sm text-zinc-300">{sig.company_name ?? "—"}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
                            SIGNAL_TYPE_STYLES[sig.signal_type] ??
                            "bg-zinc-500/20 text-zinc-400 border-zinc-500/30"
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
                      <td className="px-6 py-4 text-sm text-zinc-300 font-mono">
                        {sig.confidence != null
                          ? `${(sig.confidence * 100).toFixed(0)}%`
                          : "—"}
                      </td>
                      <td className="px-6 py-4 text-sm text-zinc-500">
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
                <p className="text-zinc-400 font-medium">No intent signals detected yet</p>
                <p className="text-zinc-500 text-sm mt-1">
                  Signals are captured automatically from tracked accounts and integrations.
                </p>
              </div>
            )}

            {totalPages > 1 && (
              <div className="px-6 py-3 border-t border-white/5 flex items-center justify-between">
                <span className="text-sm text-zinc-500">
                  Page {page} of {totalPages} &mdash; {total} total
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="p-1.5 rounded bg-white/5 hover:bg-white/10 disabled:opacity-30 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4 text-zinc-400" />
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="p-1.5 rounded bg-white/5 hover:bg-white/10 disabled:opacity-30 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4 text-zinc-400" />
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
