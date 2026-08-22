"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { redirect } from "next/navigation";
import Link from "next/link";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
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
import { ReviewCycle, reviewsApi } from "@/lib/api";
import { REVIEW_CYCLE_STATUS_COLORS, getStatusColor } from "@/lib/statusColors";
import { DataTable, DataTableColumn } from "@/components/ui/data-table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorPanel } from "@/components/ui/error-panel";
import { formatDate, formatDateShort } from "@/lib/datetime";
import { useTranslations } from "next-intl";

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

// Mirrors backend `advance_review_phase` ordering — used to label the
// "Advance Phase" confirmation modal with the destination phase so the
// admin knows exactly what they're triggering.
const PHASE_ORDER: ReviewCycle["status"][] = [
  "draft",
  "active",
  "self_review",
  "peer_review",
  "manager_review",
  "completed",
];

function nextPhaseLabel(status: ReviewCycle["status"]): string | null {
  const idx = PHASE_ORDER.indexOf(status);
  if (idx < 0 || idx >= PHASE_ORDER.length - 1) return null;
  return statusLabels[PHASE_ORDER[idx + 1]] ?? PHASE_ORDER[idx + 1];
}

function ActionsCell({
  cycle,
  onRefetch,
}: {
  cycle: ReviewCycle;
  onRefetch: () => void;
}) {
  const t = useTranslations("reviews.cycles");
  // Confirmation step prevents a single accidental click from broadcasting
  // notifications (activate) or moving every participant to the next phase
  // (advance). Both backend endpoints are not safely idempotent on intent.
  // `ConfirmDialog` owns its pending state via the onConfirm promise; we
  // just track which dialog is open.
  const [confirming, setConfirming] = useState<null | "activate" | "advance">(null);
  // Inline error rendered inside the open ConfirmDialog — mirrors the
  // pattern on /reviews/cycles/[cycleId] so the failure stays visible
  // next to the action that produced it, rather than being hidden
  // behind the modal as a toast.
  const [activateError, setActivateError] = useState<string | null>(null);
  const [advanceError, setAdvanceError] = useState<string | null>(null);

  const extractDetail = (err: unknown): string | null =>
    (err as { response?: { data?: { detail?: string } } })?.response?.data
      ?.detail ?? null;

  const handleActivate = async () => {
    setActivateError(null);
    try {
      await reviewsApi.activateCycle(cycle.id);
      toast.success(t("toasts.activated", { name: cycle.name }));
      onRefetch();
    } catch (err: unknown) {
      setActivateError(extractDetail(err) ?? t("toasts.failedToActivate"));
      // Re-throw so ConfirmDialog keeps the modal open and the user
      // can read the inline error and retry / cancel.
      throw err;
    }
  };

  const handleAdvance = async () => {
    setAdvanceError(null);
    try {
      await reviewsApi.advanceCyclePhase(cycle.id);
      toast.success(t("toasts.advanced", { name: cycle.name }));
      onRefetch();
    } catch (err: unknown) {
      setAdvanceError(extractDetail(err) ?? t("toasts.failedToAdvance"));
      throw err;
    }
  };

  const advanceTo = nextPhaseLabel(cycle.status);

  return (
    // Radix DropdownMenu portals to <body> by default, which escapes the
    // table card's `overflow-hidden` + `overflow-x-auto` clip context.
    // Hand-rolled `absolute` dropdowns were being clipped at the row's
    // bottom edge (Screenshot 2026-05-18).
    <div className="flex items-center justify-end gap-2">
      <Link
        href={`/reviews/cycles/${cycle.id}`}
        className="px-3 py-1.5 text-sm text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 rounded-lg transition"
      >
        {t("table.view")}
      </Link>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            aria-label={t("table.moreActions")}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={4}
            className="min-w-[10rem] z-50 bg-popover text-popover-foreground border border-border rounded-lg shadow-xl py-1"
          >
            <DropdownMenu.Item asChild>
              <Link
                href={`/reviews/cycles/${cycle.id}`}
                className="block px-4 py-2 text-sm hover:bg-accent transition outline-none cursor-pointer"
              >
                {t("table.viewDetails")}
              </Link>
            </DropdownMenu.Item>
            {cycle.status === "draft" && (
              <DropdownMenu.Item
                onSelect={(e) => {
                  e.preventDefault();
                  setConfirming("activate");
                }}
                className="w-full text-left px-4 py-2 text-sm hover:bg-accent transition outline-none cursor-pointer"
              >
                {t("table.activateCycleEllipsis")}
              </DropdownMenu.Item>
            )}
            {(cycle.status === "self_review" ||
              cycle.status === "peer_review" ||
              cycle.status === "active") && (
              <DropdownMenu.Item
                onSelect={(e) => {
                  e.preventDefault();
                  setConfirming("advance");
                }}
                className="w-full text-left px-4 py-2 text-sm hover:bg-accent transition outline-none cursor-pointer"
              >
                {t("table.advancePhaseEllipsis")}
              </DropdownMenu.Item>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <ConfirmDialog
        open={confirming === "activate"}
        onOpenChange={(open) => {
          if (!open) {
            setConfirming(null);
            setActivateError(null);
          }
        }}
        title={t("confirm.activateTitle", { name: cycle.name })}
        description={
          <>
            {t("confirm.activateDescription")}
            {activateError && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mt-3">
                <p className="text-red-400 text-sm">{activateError}</p>
              </div>
            )}
          </>
        }
        confirmLabel={t("confirm.activateLabel")}
        tone="neutral"
        onConfirm={handleActivate}
      />
      <ConfirmDialog
        open={confirming === "advance"}
        onOpenChange={(open) => {
          if (!open) {
            setConfirming(null);
            setAdvanceError(null);
          }
        }}
        title={t("confirm.advanceTitle", { name: cycle.name })}
        description={
          <>
            {t.rich("confirm.advanceDescription", {
              from: tStatus(t, cycle.status),
              to: advanceTo ?? t("confirm.advanceFallbackNext"),
              strong: (chunks) => (
                <span className="font-medium text-foreground">{chunks}</span>
              ),
            })}
            {advanceError && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mt-3">
                <p className="text-red-400 text-sm">{advanceError}</p>
              </div>
            )}
          </>
        }
        confirmLabel={t("confirm.advanceLabel")}
        tone="warning"
        onConfirm={handleAdvance}
      />
    </div>
  );
}

// `t` is the next-intl translator already scoped to "reviews.cycles".
// Both label helpers fall back to the English module-level maps if a
// key is missing from the locale file — defensive in case the JSON
// catalog drifts behind the model's status enum.
type CyclesT = ReturnType<typeof useTranslations<"reviews.cycles">>;

function tStatus(t: CyclesT, status: string): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const translated = (t as any).has?.(`statusLabels.${status}`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? (t as any)(`statusLabels.${status}`)
    : null;
  return translated || statusLabels[status] || status;
}

function tCycleType(t: CyclesT, type: string): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const translated = (t as any).has?.(`cycleTypeLabels.${type}`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? (t as any)(`cycleTypeLabels.${type}`)
    : null;
  return translated || cycleTypeLabels[type] || type;
}

function buildCycleColumns(
  onRefetch: () => void,
  t: CyclesT,
): DataTableColumn<ReviewCycle>[] {
  return [
  {
    id: "cycle",
    header: t("table.cycle"),
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
              {tCycleType(t, cycle.cycle_type)}
            </p>
          </div>
        </div>
      </Link>
    ),
  },
  {
    id: "status",
    header: t("table.status"),
    sortable: true,
    sortValue: (cycle) => statusSortOrder[cycle.status] ?? 99,
    cell: (cycle) => {
      const statusColor = getStatusColor(REVIEW_CYCLE_STATUS_COLORS, cycle.status);
      return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusColor.text} ${statusColor.bg}`}>
          {cycle.status === "active" || cycle.status === "self_review" || cycle.status === "peer_review" || cycle.status === "manager_review" ? (
            <span className="w-1.5 h-1.5 rounded-full bg-current motion-safe:animate-pulse" />
          ) : null}
          {tStatus(t, cycle.status)}
        </span>
      );
    },
  },
  {
    id: "period",
    header: t("table.period"),
    sortable: true,
    sortValue: (cycle) => new Date(cycle.period_start).getTime(),
    cell: (cycle) => (
      <span className="text-sm text-muted-foreground">
        {formatDate(cycle.period_start)}
        {" - "}
        {formatDate(cycle.period_end)}
      </span>
    ),
  },
  {
    id: "deadlines",
    header: t("table.deadlines"),
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
            {formatDateShort(cycle.self_review_deadline)}
          </span>
        )}
      </div>
    ),
  },
  {
    id: "actions",
    header: t("table.actions"),
    headerClassName: "text-right",
    cellClassName: "text-right",
    cell: (cycle) => <ActionsCell cycle={cycle} onRefetch={onRefetch} />,
  },
  ];
}

export default function ReviewCyclesPage() {
  const t = useTranslations("reviews.cycles");
  const { user, isLoading: authLoading, isAuthenticated, logout } = useAuth();
  const { currentWorkspaceId, currentWorkspaceLoading, hasWorkspaces } = useWorkspace();
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);

  const { cycles, isLoading, error, refetch } = useReviewCycles(currentWorkspaceId, statusFilter);

  // Capture refetch in the column factory so ActionsCell can refresh
  // the list after activate / advance mutations succeed.
  const cycleColumns = useMemo(() => buildCycleColumns(refetch, t), [refetch, t]);

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
      <div>
      <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="text-center py-16">
            <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <Calendar className="w-10 h-10 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">{t("noWorkspace.title")}</h2>
            <p className="text-muted-foreground mb-6">
              {t("noWorkspace.description")}
            </p>
            <Link
              href="/settings/workspaces"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition"
            >
              <Settings className="h-4 w-4" />
              {t("noWorkspace.cta")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const statusOptions: { value: string | undefined; label: string }[] = [
    { value: undefined, label: t("statusFilter.all") },
    { value: "draft", label: t("statusLabels.draft") },
    { value: "active", label: t("statusLabels.active") },
    { value: "self_review", label: t("statusLabels.self_review") },
    { value: "peer_review", label: t("statusLabels.peer_review") },
    { value: "manager_review", label: t("statusLabels.manager_review") },
    { value: "completed", label: t("statusLabels.completed") },
  ];

  return (
    <div>
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <Breadcrumb
          items={[
            { label: t("breadcrumb.reviews"), href: "/reviews" },
            { label: t("breadcrumb.cycles") },
          ]}
        />

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-xl">
              <Calendar className="h-7 w-7 text-purple-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
              <p className="text-muted-foreground text-sm">
                {t("description")}
              </p>
            </div>
          </div>
          <Link
            href="/reviews/cycles/new"
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition text-sm font-medium"
          >
            <Plus className="h-4 w-4" />
            {t("newCycle")}
          </Link>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4 mb-6">
          <label htmlFor="cycle-status-filter" className="sr-only">
            {t("statusFilter.label")}
          </label>
          <select
            id="cycle-status-filter"
            aria-label={t("statusFilter.label")}
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
            {t("cycleCount", { count: cycles.length })}
          </span>
        </div>

        {/* Cycles Table (desktop) */}
        {error ? (
          <ErrorPanel
            error={error}
            title={t("errors.failedToLoad")}
            onRetry={refetch}
          />
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
                emptyTitle={t("noCycles")}
                emptyDescription={t("noCyclesDescription")}
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
                  <p className="text-foreground font-medium mb-1">{t("noCycles")}</p>
                  <p className="text-muted-foreground text-sm">
                    {t("noCyclesDescription")}
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
                          {tStatus(t, cycle.status)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mb-1">
                        {tCycleType(t, cycle.cycle_type)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateShort(cycle.period_start)}
                        {" - "}
                        {formatDate(cycle.period_end)}
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
            <h4 className="text-foreground font-medium mb-2">{t("phases.selfReviewTitle")}</h4>
            <p className="text-muted-foreground text-sm">
              {t("phases.selfReviewDesc")}
            </p>
          </div>
          <div className="bg-background/30 rounded-xl p-5 border border-border/50">
            <div className="p-2 bg-purple-500/10 rounded-lg w-fit mb-3">
              <Users className="h-5 w-5 text-purple-400" />
            </div>
            <h4 className="text-foreground font-medium mb-2">{t("phases.peerReviewTitle")}</h4>
            <p className="text-muted-foreground text-sm">
              {t("phases.peerReviewDesc")}
            </p>
          </div>
          <div className="bg-background/30 rounded-xl p-5 border border-border/50">
            <div className="p-2 bg-amber-500/10 rounded-lg w-fit mb-3">
              <CheckCircle className="h-5 w-5 text-amber-400" />
            </div>
            <h4 className="text-foreground font-medium mb-2">{t("phases.managerReviewTitle")}</h4>
            <p className="text-muted-foreground text-sm">
              {t("phases.managerReviewDesc")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
