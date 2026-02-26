"use client";

import { useState } from "react";
import { ArrowRightLeft, Loader2, RefreshCw, DollarSign, Clock } from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useGTMHandoffs, useGTMHandoffAnalytics } from "@/hooks/useGTM";
import { ChevronLeft, ChevronRight } from "lucide-react";

const STATUS_STYLES: Record<string, string> = {
  pending:     "bg-amber-500/20 text-amber-400 border-amber-500/30",
  accepted:    "bg-blue-500/20 text-blue-400 border-blue-500/30",
  in_progress: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
  converted:   "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  declined:    "bg-red-500/20 text-red-400 border-red-500/30",
};

const STATUS_LABELS: Record<string, string> = {
  pending:     "Pending",
  accepted:    "Accepted",
  in_progress: "In Progress",
  converted:   "Converted",
  declined:    "Declined",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
        STATUS_STYLES[status] ?? "bg-zinc-500/20 text-muted-foreground border-zinc-500/30"
      }`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
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

const STATUSES = ["all", "pending", "accepted", "in_progress", "converted", "declined"];

export default function HandoffsPage() {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id ?? null;

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();

  const { handoffs, total, isLoading } = useGTMHandoffs(workspaceId, {
    page,
    status: statusFilter,
  });
  const { analytics, isLoading: analyticsLoading } = useGTMHandoffAnalytics(workspaceId);

  const PER_PAGE = 25;
  const totalPages = Math.ceil(total / PER_PAGE);

  const converted = analytics?.converted_count ?? 0;
  const totalCount = analytics?.total_handoffs ?? 0;
  const conversionRate =
    totalCount > 0 ? ((converted / totalCount) * 100).toFixed(1) : "0.0";

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
              <ArrowRightLeft className="w-7 h-7 text-indigo-400" />
              Handoffs
            </h1>
            <p className="text-muted-foreground mt-1">CS-to-Sales handoff tracking and conversion</p>
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
        {analyticsLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <KpiCard
              label="Total"
              value={(analytics?.total_handoffs ?? 0).toLocaleString()}
              icon={<ArrowRightLeft className="w-4 h-4" />}
            />
            <KpiCard
              label="Pending"
              value={(analytics?.pending_count ?? 0).toLocaleString()}
              icon={<Clock className="w-4 h-4" />}
            />
            <KpiCard
              label="Converted"
              value={converted.toLocaleString()}
              icon={<DollarSign className="w-4 h-4" />}
            />
            <KpiCard
              label="Conversion Rate"
              value={`${conversionRate}%`}
              icon={<DollarSign className="w-4 h-4" />}
            />
          </div>
        )}

        {/* Status filters */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => {
                setStatusFilter(s === "all" ? undefined : s);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                (s === "all" && !statusFilter) || statusFilter === s
                  ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30"
                  : "bg-muted/50 text-muted-foreground border border-border hover:bg-muted"
              }`}
            >
              {s === "all" ? "All" : STATUS_LABELS[s] ?? s}
            </button>
          ))}
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
                    {["Title", "Type", "Status", "Est. Value", "Assigned To", "Created"].map(
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
                  {handoffs.map((h: any) => (
                    <tr key={h.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-6 py-4 text-sm text-foreground font-medium">{h.title}</td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border bg-violet-500/20 text-violet-400 border-violet-500/30">
                          {h.handoff_type ?? "—"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={h.status} />
                      </td>
                      <td className="px-6 py-4 text-sm text-foreground">
                        {h.estimated_value != null
                          ? `$${Number(h.estimated_value).toLocaleString()}`
                          : "—"}
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground font-mono">
                        {h.assigned_to ? h.assigned_to.slice(0, 8) : "—"}
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">
                        {h.created_at ? new Date(h.created_at).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {handoffs.length === 0 && (
              <div className="px-6 py-12 text-center">
                <ArrowRightLeft className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
                <p className="text-muted-foreground font-medium">No handoffs found</p>
                <p className="text-muted-foreground text-sm mt-1">
                  Handoffs are created when CS marks accounts ready for sales.
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
