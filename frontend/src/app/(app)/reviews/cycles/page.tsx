"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Calendar,
  Plus,
  Clock,
  CheckCircle,
  Users,
  Settings,
  MoreVertical,
} from "lucide-react";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useReviewCycles } from "@/hooks/useReviews";
import { ReviewCycle } from "@/lib/api";
import { REVIEW_CYCLE_STATUS_COLORS, getStatusColor } from "@/lib/statusColors";
import { DataTable, DataTableColumn } from "@/components/ui/data-table";

const statusLabels: Record<string, string> = {
  draft: "Draft",
  active: "Active",
  self_review: "Self Review",
  peer_review: "Peer Review",
  manager_review: "Manager Review",
  completed: "Completed",
};

const cycleTypeLabels: Record<string, string> = {
  annual: "Annual",
  semi_annual: "Semi-Annual",
  quarterly: "Quarterly",
  custom: "Custom",
};

const statusSortOrder: Record<string, number> = {
  draft: 0,
  active: 1,
  self_review: 2,
  peer_review: 3,
  manager_review: 4,
  completed: 5,
};

function ActionsCell({ cycle }: { cycle: ReviewCycle }) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div className="flex items-center justify-end gap-2">
      <Link
        href={`/reviews/cycles/${cycle.id}`}
        className="px-3 py-1.5 text-sm text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 rounded-lg transition"
      >
        View
      </Link>
      <div className="relative">
        <button
          aria-label="More actions"
          onClick={() => setShowMenu(!showMenu)}
          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
        {showMenu && (
          <div className="absolute right-0 mt-1 w-40 bg-muted border border-border rounded-lg shadow-xl z-10">
            <Link
              href={`/reviews/cycles/${cycle.id}`}
              className="block px-4 py-2 text-sm text-foreground hover:text-foreground hover:bg-accent transition"
            >
              View Details
            </Link>
            {cycle.status === "draft" && (
              <button className="w-full text-left px-4 py-2 text-sm text-green-400 hover:bg-accent transition">
                Activate Cycle
              </button>
            )}
            {(cycle.status === "self_review" || cycle.status === "peer_review") && (
              <button className="w-full text-left px-4 py-2 text-sm text-amber-400 hover:bg-accent transition">
                Advance Phase
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const cycleColumns: DataTableColumn<ReviewCycle>[] = [
  {
    id: "cycle",
    header: "Cycle",
    sortable: true,
    sortValue: (cycle) => cycle.name.toLowerCase(),
    cell: (cycle) => (
      <Link href={`/reviews/cycles/${cycle.id}`} className="group">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-500/10 rounded-lg">
            <Calendar className="h-4 w-4 text-purple-400" />
          </div>
          <div>
            <p className="text-foreground font-medium group-hover:text-purple-400 transition">
              {cycle.name}
            </p>
            <p className="text-xs text-muted-foreground">
              {cycleTypeLabels[cycle.cycle_type] || cycle.cycle_type}
            </p>
          </div>
        </div>
      </Link>
    ),
  },
  {
    id: "status",
    header: "Status",
    sortable: true,
    sortValue: (cycle) => statusSortOrder[cycle.status] ?? 99,
    cell: (cycle) => {
      const statusColor = getStatusColor(REVIEW_CYCLE_STATUS_COLORS, cycle.status);
      return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusColor.text} ${statusColor.bg}`}>
          {cycle.status === "active" || cycle.status === "self_review" || cycle.status === "peer_review" || cycle.status === "manager_review" ? (
            <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
          ) : null}
          {statusLabels[cycle.status] || cycle.status}
        </span>
      );
    },
  },
  {
    id: "period",
    header: "Period",
    sortable: true,
    sortValue: (cycle) => new Date(cycle.period_start).getTime(),
    cell: (cycle) => (
      <span className="text-sm text-muted-foreground">
        {new Date(cycle.period_start).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
        {" - "}
        {new Date(cycle.period_end).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </span>
    ),
  },
  {
    id: "deadlines",
    header: "Deadlines",
    sortable: true,
    sortValue: (cycle) =>
      cycle.self_review_deadline
        ? new Date(cycle.self_review_deadline).getTime()
        : Number.MAX_SAFE_INTEGER,
    cell: (cycle) => (
      <div className="flex items-center gap-2">
        {cycle.self_review_deadline && (
          <span className="text-xs text-muted-foreground" title="Self Review Deadline">
            <Clock className="h-3 w-3 inline mr-1" />
            {new Date(cycle.self_review_deadline).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </span>
        )}
      </div>
    ),
  },
  {
    id: "actions",
    header: "Actions",
    headerClassName: "text-right",
    cellClassName: "text-right",
    cell: (cycle) => <ActionsCell cycle={cycle} />,
  },
];

export default function ReviewCyclesPage() {
  const { user, isLoading: authLoading, isAuthenticated, logout } = useAuth();
  const { currentWorkspaceId, currentWorkspaceLoading, hasWorkspaces } = useWorkspace();
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);

  const { cycles, isLoading, error, refetch } = useReviewCycles(currentWorkspaceId, statusFilter);

  if (authLoading || currentWorkspaceLoading) {
    return (
      <div className="p-6 max-w-6xl mx-auto animate-pulse">
        <div className="flex items-center justify-between mb-6">
          <div className="h-7 w-36 bg-accent rounded" />
          <div className="h-9 w-36 bg-accent rounded-lg" />
        </div>
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="grid grid-cols-5 gap-4 px-4 py-3 border-b border-border">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-3 w-16 bg-accent rounded" />
            ))}
          </div>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="grid grid-cols-5 gap-4 px-4 py-3 border-b border-border/50">
              <div className="h-4 w-32 bg-accent rounded" />
              <div className="h-5 w-16 bg-accent rounded-full" />
              <div className="h-3 w-20 bg-accent rounded" />
              <div className="h-3 w-20 bg-accent rounded" />
              <div className="h-3 w-12 bg-accent rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    redirect("/");
  }

  if (!hasWorkspaces) {
    return (
      <div className="min-h-screen bg-background">
<main className="max-w-7xl mx-auto px-4 py-8">
          <div className="text-center py-16">
            <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <Calendar className="w-10 h-10 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">No Workspace Selected</h2>
            <p className="text-muted-foreground mb-6">
              Review cycles are workspace-specific. Please create or select a workspace first.
            </p>
            <Link
              href="/settings/workspaces"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition"
            >
              <Settings className="h-4 w-4" />
              Manage Workspaces
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const statusOptions = [
    { value: undefined, label: "All Statuses" },
    { value: "draft", label: "Draft" },
    { value: "active", label: "Active" },
    { value: "self_review", label: "Self Review" },
    { value: "peer_review", label: "Peer Review" },
    { value: "manager_review", label: "Manager Review" },
    { value: "completed", label: "Completed" },
  ];

  return (
    <div className="min-h-screen bg-background">
<main className="max-w-7xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <Breadcrumb
          items={[
            { label: "Reviews", href: "/reviews" },
            { label: "Cycles" },
          ]}
        />

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-xl">
              <Calendar className="h-7 w-7 text-purple-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Review Cycles</h1>
              <p className="text-muted-foreground text-sm">
                Manage performance review cycles for your workspace
              </p>
            </div>
          </div>
          <Link
            href="/reviews/cycles/new"
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition text-sm font-medium"
          >
            <Plus className="h-4 w-4" />
            New Cycle
          </Link>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4 mb-6">
          <select
            value={statusFilter || ""}
            onChange={(e) => setStatusFilter(e.target.value || undefined)}
            className="bg-muted border border-border text-foreground rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            {statusOptions.map((option) => (
              <option key={option.label} value={option.value || ""}>
                {option.label}
              </option>
            ))}
          </select>
          <span className="text-muted-foreground text-sm">
            {cycles.length} cycle{cycles.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Cycles Table (desktop) */}
        {error ? (
          <div className="bg-background/50 rounded-xl border border-border overflow-hidden">
            <div className="text-center py-12">
              <p className="text-red-400">Failed to load review cycles</p>
              <button
                onClick={refetch}
                className="mt-4 text-purple-400 hover:text-purple-300"
              >
                Try again
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Desktop: DataTable */}
            <div className="hidden md:block">
              <DataTable
                columns={cycleColumns}
                data={cycles}
                rowKey={(cycle) => cycle.id}
                isLoading={isLoading}
                skeletonRows={4}
                emptyIcon={
                  <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto">
                    <Calendar className="w-10 h-10 text-muted-foreground" />
                  </div>
                }
                emptyTitle="No review cycles yet"
                emptyDescription="Create your first review cycle to start collecting 360° feedback from your team."
              />
            </div>

            {/* Mobile: Card view */}
            <div className="md:hidden space-y-3" data-testid="cycles-mobile-cards">
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="bg-muted rounded-xl border border-border p-4 animate-pulse">
                      <div className="h-5 w-40 bg-accent rounded mb-3" />
                      <div className="h-4 w-24 bg-accent rounded mb-2" />
                      <div className="h-3 w-32 bg-accent rounded" />
                    </div>
                  ))}
                </div>
              ) : cycles.length === 0 ? (
                <div className="bg-muted rounded-xl border border-border p-8 text-center">
                  <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
                    <Calendar className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <p className="text-foreground font-medium mb-1">No review cycles yet</p>
                  <p className="text-muted-foreground text-sm">
                    Create your first review cycle to start collecting 360° feedback.
                  </p>
                </div>
              ) : (
                cycles.map((cycle) => {
                  const statusColor = getStatusColor(REVIEW_CYCLE_STATUS_COLORS, cycle.status);
                  return (
                    <Link
                      key={cycle.id}
                      href={`/reviews/cycles/${cycle.id}`}
                      className="block bg-muted rounded-xl border border-border p-4 hover:border-purple-500/30 transition"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-purple-400" />
                          <span className="text-foreground font-medium">{cycle.name}</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor.text} ${statusColor.bg}`}>
                          {statusLabels[cycle.status] || cycle.status}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mb-1">
                        {cycleTypeLabels[cycle.cycle_type] || cycle.cycle_type}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(cycle.period_start).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        {" - "}
                        {new Date(cycle.period_end).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    </Link>
                  );
                })
              )}
            </div>
          </>
        )}

        {/* Help Section */}
        <div className="mt-8 grid md:grid-cols-3 gap-4">
          <div className="bg-background/30 rounded-xl p-5 border border-border/50">
            <div className="p-2 bg-blue-500/10 rounded-lg w-fit mb-3">
              <Users className="h-5 w-5 text-blue-400" />
            </div>
            <h4 className="text-foreground font-medium mb-2">Self Review Phase</h4>
            <p className="text-muted-foreground text-sm">
              Team members reflect on their achievements and areas for growth using structured prompts.
            </p>
          </div>
          <div className="bg-background/30 rounded-xl p-5 border border-border/50">
            <div className="p-2 bg-purple-500/10 rounded-lg w-fit mb-3">
              <Users className="h-5 w-5 text-purple-400" />
            </div>
            <h4 className="text-foreground font-medium mb-2">Peer Review Phase</h4>
            <p className="text-muted-foreground text-sm">
              Collect anonymous 360° feedback from colleagues using the COIN framework.
            </p>
          </div>
          <div className="bg-background/30 rounded-xl p-5 border border-border/50">
            <div className="p-2 bg-amber-500/10 rounded-lg w-fit mb-3">
              <CheckCircle className="h-5 w-5 text-amber-400" />
            </div>
            <h4 className="text-foreground font-medium mb-2">Manager Review Phase</h4>
            <p className="text-muted-foreground text-sm">
              Managers synthesize feedback and provide final ratings and development recommendations.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
