"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Calendar,
  Users,
  Clock,
  CheckCircle,
  ClipboardCheck,
  UserCheck,
  MessageSquare,
  Settings,
  Play,
  FastForward,
  Loader2,
  Bell,
  ChevronDown,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useMyReviews, useReviewCycle } from "@/hooks/useReviews";
import { ReviewCycleStatus, reviewsApi } from "@/lib/api";
import { REVIEW_CYCLE_STATUS_COLORS, getStatusColor } from "@/lib/statusColors";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatDate as sharedFormatDate } from "@/lib/datetime";

const statusLabels: Record<string, string> = {
  draft: "Draft",
  active: "Active",
  self_review: "Self Review",
  peer_review: "Peer Review",
  manager_review: "Manager Review",
  completed: "Completed",
};

// Mirrors backend `advance_review_phase` ordering so the Advance Phase
// confirmation can name the destination phase concretely.
const PHASE_ORDER = [
  "draft",
  "active",
  "self_review",
  "peer_review",
  "manager_review",
  "completed",
] as const;

function nextPhaseLabel(status: string): string | null {
  const idx = (PHASE_ORDER as readonly string[]).indexOf(status);
  if (idx < 0 || idx >= PHASE_ORDER.length - 1) return null;
  const next = PHASE_ORDER[idx + 1];
  return statusLabels[next] ?? next;
}

// Cycle type labels
const cycleTypeLabels: Record<string, string> = {
  annual: "Annual",
  semi_annual: "Semi-Annual",
  quarterly: "Quarterly",
  custom: "Custom",
};

export default function CycleDetailPage() {
  const t = useTranslations("reviews.cycles.detail");
  const tc = useTranslations("reviews.cycles");
  const params = useParams();
  const cycleId = params.cycleId as string;
  const { user, isLoading: authLoading } = useAuth();
  const { cycle, isLoading, error, refetch } = useReviewCycle(cycleId);
  // Resolve the visitor's own IndividualReview row in this cycle so we
  // can surface a direct deep-link to their /my-reviews/[reviewId]
  // surface. Without this an enrolled developer landing on the cycle
  // page sees admin controls and no obvious path to their own review.
  const { reviews: myReviews } = useMyReviews(user?.id);
  const myReviewInCycle = myReviews.find((r) => r.review_cycle_id === cycleId);

  // ConfirmDialog tracks its own pending state via the `onConfirm`
  // promise — the header buttons just open the dialog so they don't
  // need their own busy flag.
  const [isResending, setIsResending] = useState<null | "activation" | "deadline" | "phase_change">(null);
  const [showStartConfirm, setShowStartConfirm] = useState(false);
  const [showAdvanceConfirm, setShowAdvanceConfirm] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);

  // Human-readable labels for each notification kind. Pulled from
  // the i18n catalog so both English and Hindi surface the right
  // phrase. The snake_case key is the canonical id we POST to the
  // backend.
  const kindLabel = (kind: "activation" | "deadline" | "phase_change") =>
    t(`kindLabels.${kind}` as const);

  const handleResend = async (
    kind: "activation" | "deadline" | "phase_change",
  ) => {
    if (!cycleId || isResending) return;
    setIsResending(kind);
    try {
      const result = await reviewsApi.resendCycleNotifications(cycleId, { kind });
      if (result.sent > 0) {
        toast.success(
          t("toasts.sentNotifications", {
            sent: result.sent,
            kind: kindLabel(kind),
          }),
        );
      } else {
        toast.info(
          result.reason
            ? t("toasts.noNotificationsWithReason", { reason: result.reason })
            : t("toasts.noEligibleRecipients"),
        );
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || t("toasts.failedToResend"));
    } finally {
      setIsResending(null);
    }
  };

  const handleStartCycle = async () => {
    if (!cycleId) return;
    setActivateError(null);
    try {
      await reviewsApi.activateCycle(cycleId);
      await refetch();
    } catch (err: any) {
      const msg = err?.response?.data?.detail || t("toasts.failedToStart");
      setActivateError(msg);
      // Re-throw so ConfirmDialog keeps the modal open — user can
      // read the inline error and retry / cancel.
      throw err;
    }
  };

  const handleAdvancePhase = async () => {
    if (!cycleId) return;
    try {
      await reviewsApi.advanceCyclePhase(cycleId);
      await refetch();
      toast.success(t("toasts.advancedSuccess"));
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || t("toasts.failedToAdvance"));
      throw err;
    }
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 border-4 border-primary-500/20 rounded-full"></div>
            <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
          </div>
          <p className="text-muted-foreground text-sm">{t("loading")}</p>
        </div>
      </div>
    );
  }

  if (error || !cycle) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <div className="text-center">
          <Calendar className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-medium text-foreground mb-2">{t("notFoundTitle")}</h2>
          <p className="text-muted-foreground mb-6">{t("notFoundBody")}</p>
          <Link href="/reviews/cycles" className="text-cyan-400 hover:text-cyan-300 transition">
            {tc("backToReviews")}
          </Link>
        </div>
      </div>
    );
  }

  const statusStyle = getStatusColor(REVIEW_CYCLE_STATUS_COLORS, cycle.status);
  const completionRate = cycle.total_reviews > 0
    ? Math.round((cycle.completed_reviews / cycle.total_reviews) * 100)
    : 0;

  // Local wrapper: every call here either renders a real date or
  // falls back to "Not set". The shared `formatDate` returns "" for
  // null which would render an empty cell.
  const formatDate = (dateStr: string | null) =>
    dateStr ? sharedFormatDate(dateStr) : t("notSet");

  return (
    <div>
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <Breadcrumb
          items={[
            { label: "Reviews", href: "/reviews" },
            { label: "Cycles", href: "/reviews/cycles" },
            { label: cycle.name },
          ]}
          className="mb-6"
        />

        {/* Header */}
        <div className="bg-muted/50 rounded-xl border border-border p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3 flex-wrap">
              <span className={`${statusStyle.text} ${statusStyle.bg} text-sm px-3 py-1 rounded-full`}>
                {statusLabels[cycle.status] || cycle.status}
              </span>
              <span className="text-muted-foreground bg-accent/50 text-sm px-3 py-1 rounded-full">
                {cycleTypeLabels[cycle.cycle_type] || cycle.cycle_type}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Surface the visitor's own review first — enrolled
                  developers usually want to act on their review, not
                  see the cycle's admin controls. */}
              {myReviewInCycle && (
                <Link
                  href={`/reviews/my-reviews/${myReviewInCycle.id}`}
                  className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition flex items-center gap-2"
                >
                  <ClipboardCheck className="h-4 w-4" />
                  {t("actions.openYourReview")}
                </Link>
              )}
              {cycle.status === "draft" && (
                <button
                  onClick={() => setShowStartConfirm(true)}
                  className="px-4 py-2 text-sm bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition flex items-center gap-2"
                >
                  <Play className="h-4 w-4" />
                  {t("actions.startCycle")}
                </button>
              )}
              {cycle.status !== "completed" && cycle.status !== "draft" && (
                <button
                  onClick={() => setShowAdvanceConfirm(true)}
                  className="px-4 py-2 text-sm bg-amber-600 hover:bg-amber-500 text-white rounded-lg transition flex items-center gap-2"
                >
                  <FastForward className="h-4 w-4" />
                  {t("actions.advancePhase")}
                </button>
              )}
              {cycle.status !== "draft" && cycle.status !== "completed" && (
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild>
                    <button
                      disabled={isResending !== null}
                      className="px-3 py-2 text-sm bg-accent hover:bg-muted disabled:opacity-50 text-foreground rounded-lg transition flex items-center gap-2"
                      // The visible "Notify" text is the accessible name;
                      // aria-label supplements it with the action so SRs
                      // announce something useful, since `title=` is not
                      // reliably surfaced.
                      aria-label={t("notify.buttonTitle")}
                      title={t("notify.buttonTitle")}
                    >
                      {isResending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Bell className="h-4 w-4" />
                      )}
                      {t("notify.buttonLabel")}
                      <ChevronDown className="h-3 w-3 opacity-60" />
                    </button>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content
                      align="end"
                      sideOffset={4}
                      className="min-w-[14rem] z-50 bg-popover text-popover-foreground border border-border rounded-lg shadow-xl py-1"
                    >
                      <DropdownMenu.Label className="px-3 py-1.5 text-xs text-muted-foreground">
                        {t("notify.menuLabel")}
                      </DropdownMenu.Label>
                      <DropdownMenu.Item
                        onSelect={(e) => {
                          e.preventDefault();
                          handleResend("activation");
                        }}
                        disabled={isResending !== null}
                        className="px-3 py-2 text-sm hover:bg-accent transition outline-none cursor-pointer data-[disabled]:opacity-50 flex items-center gap-2"
                      >
                        {isResending === "activation" && (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        )}
                        {t("notify.activation")}
                        {isResending === "activation" && (
                          <span className="text-muted-foreground text-xs ml-auto">{t("notify.sending")}</span>
                        )}
                      </DropdownMenu.Item>
                      <DropdownMenu.Item
                        onSelect={(e) => {
                          e.preventDefault();
                          handleResend("deadline");
                        }}
                        disabled={isResending !== null}
                        className="px-3 py-2 text-sm hover:bg-accent transition outline-none cursor-pointer data-[disabled]:opacity-50 flex items-center gap-2"
                      >
                        {isResending === "deadline" && (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        )}
                        {t("notify.deadline")}
                        {isResending === "deadline" && (
                          <span className="text-muted-foreground text-xs ml-auto">{t("notify.sending")}</span>
                        )}
                      </DropdownMenu.Item>
                      <DropdownMenu.Item
                        onSelect={(e) => {
                          e.preventDefault();
                          handleResend("phase_change");
                        }}
                        disabled={isResending !== null}
                        className="px-3 py-2 text-sm hover:bg-accent transition outline-none cursor-pointer data-[disabled]:opacity-50 flex items-center gap-2"
                      >
                        {isResending === "phase_change" && (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        )}
                        {t("notify.phaseChange")}
                        {isResending === "phase_change" && (
                          <span className="text-muted-foreground text-xs ml-auto">{t("notify.sending")}</span>
                        )}
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              )}
            </div>
          </div>

          <h1 className="text-2xl font-bold text-foreground mb-2">{cycle.name}</h1>

          {/* Period Info */}
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              {formatDate(cycle.period_start)} - {formatDate(cycle.period_end)}
            </div>
          </div>

          {/* Progress Overview */}
          <div className="mt-6">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-muted-foreground">{t("completionProgress")}</span>
              <span className="text-foreground font-medium">{completionRate}%</span>
            </div>
            <div
              role="progressbar"
              aria-label={t("cycleCompletionAriaLabel")}
              aria-valuenow={completionRate}
              aria-valuemin={0}
              aria-valuemax={100}
              className="h-3 bg-accent rounded-full overflow-hidden"
            >
              <div
                className="h-full bg-cyan-500 rounded-full transition-all"
                style={{ width: `${completionRate}%` }}
              />
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-muted/50 rounded-xl border border-border p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Users className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{cycle.total_reviews}</p>
                <p className="text-sm text-muted-foreground">{t("stats.totalReviews")}</p>
              </div>
            </div>
          </div>
          <div className="bg-muted/50 rounded-xl border border-border p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <CheckCircle className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{cycle.completed_reviews}</p>
                <p className="text-sm text-muted-foreground">{t("stats.completed")}</p>
              </div>
            </div>
          </div>
          <div className="bg-muted/50 rounded-xl border border-border p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-cyan-500/10">
                <UserCheck className="h-5 w-5 text-cyan-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{cycle.pending_self_reviews}</p>
                <p className="text-sm text-muted-foreground">{t("stats.pendingSelf")}</p>
              </div>
            </div>
          </div>
          <div className="bg-muted/50 rounded-xl border border-border p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <MessageSquare className="h-5 w-5 text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{cycle.pending_peer_reviews}</p>
                <p className="text-sm text-muted-foreground">{t("stats.pendingPeer")}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Phase Deadlines */}
            <div className="bg-muted/50 rounded-xl border border-border p-6">
              <h2 className="text-lg font-medium text-foreground mb-4 flex items-center gap-2">
                <Clock className="h-5 w-5 text-amber-400" />
                {t("headings.phaseDeadlines")}
              </h2>
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-3 bg-accent/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-cyan-500/10">
                      <UserCheck className="h-4 w-4 text-cyan-400" />
                    </div>
                    <span className="text-foreground">{t("phaseLabels.selfReview")}</span>
                  </div>
                  <span className={`text-sm ${cycle.self_review_deadline ? "text-foreground" : "text-muted-foreground"}`}>
                    {formatDate(cycle.self_review_deadline)}
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-3 bg-accent/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-purple-500/10">
                      <MessageSquare className="h-4 w-4 text-purple-400" />
                    </div>
                    <span className="text-foreground">{t("phaseLabels.peerReview")}</span>
                  </div>
                  <span className={`text-sm ${cycle.peer_review_deadline ? "text-foreground" : "text-muted-foreground"}`}>
                    {formatDate(cycle.peer_review_deadline)}
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-3 bg-accent/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-amber-500/10">
                      <Users className="h-4 w-4 text-amber-400" />
                    </div>
                    <span className="text-foreground">{t("phaseLabels.managerReview")}</span>
                  </div>
                  <span className={`text-sm ${cycle.manager_review_deadline ? "text-foreground" : "text-muted-foreground"}`}>
                    {formatDate(cycle.manager_review_deadline)}
                  </span>
                </div>
              </div>
            </div>

            {/* Participants Section */}
            <div className="bg-muted/50 rounded-xl border border-border p-6">
              <h2 className="text-lg font-medium text-foreground mb-4 flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-400" />
                {t("headings.participants")}
              </h2>
              {cycle.total_reviews > 0 ? (
                <p className="text-muted-foreground text-sm">
                  {cycle.total_reviews} team member{cycle.total_reviews > 1 ? "s" : ""} enrolled in this review cycle.
                </p>
              ) : cycle.status === "draft" ? (
                <div className="text-center py-8">
                  <Users className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm mb-2">{t("participants.noneEnrolled")}</p>
                  <p className="text-muted-foreground text-xs mb-4">
                    Participants will be automatically enrolled from your workspace teams when you start the cycle.
                  </p>
                  <button
                    onClick={() => setShowStartConfirm(true)}
                    className="px-4 py-2 text-sm bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition"
                  >
                    Start Cycle to Add Participants
                  </button>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Users className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">{t("participants.noneInCycle")}</p>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Settings Summary */}
            <div className="bg-muted/50 rounded-xl border border-border p-6">
              <h2 className="text-lg font-medium text-foreground mb-4 flex items-center gap-2">
                <Settings className="h-5 w-5 text-muted-foreground" />
                {t("headings.settings")}
              </h2>
              {cycle.settings ? (
                <div className="space-y-3 text-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <span className="text-muted-foreground">{t("settings.selfReview")}</span>
                    <span className={cycle.settings.enable_self_review ? "text-emerald-400" : "text-muted-foreground"}>
                      {cycle.settings.enable_self_review ? t("settings.enabled") : t("settings.disabled")}
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <span className="text-muted-foreground">{t("settings.peerReview")}</span>
                    <span className={cycle.settings.enable_peer_review ? "text-emerald-400" : "text-muted-foreground"}>
                      {cycle.settings.enable_peer_review ? t("settings.enabled") : t("settings.disabled")}
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <span className="text-muted-foreground">{t("settings.managerReview")}</span>
                    <span className={cycle.settings.enable_manager_review ? "text-emerald-400" : "text-muted-foreground"}>
                      {cycle.settings.enable_manager_review ? t("settings.enabled") : t("settings.disabled")}
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <span className="text-muted-foreground">{t("settings.anonymousPeer")}</span>
                    <span className={cycle.settings.anonymous_peer_reviews ? "text-emerald-400" : "text-muted-foreground"}>
                      {cycle.settings.anonymous_peer_reviews ? t("settings.yes") : t("settings.no")}
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <span className="text-muted-foreground">{t("settings.githubMetrics")}</span>
                    <span className={cycle.settings.include_github_metrics ? "text-emerald-400" : "text-muted-foreground"}>
                      {cycle.settings.include_github_metrics ? t("settings.included") : t("settings.notIncluded")}
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <span className="text-muted-foreground">{t("settings.peerReviewers")}</span>
                    <span className="text-foreground">
                      {cycle.settings.min_peer_reviewers} - {cycle.settings.max_peer_reviewers}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">{t("settings.none")}</p>
              )}
            </div>

            {/* Quick Info */}
            <div className="bg-muted/50 rounded-xl border border-border p-6">
              <h2 className="text-lg font-medium text-foreground mb-4">{t("headings.info")}</h2>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("info.created")}</span>
                  <span className="text-foreground">{formatDate(cycle.created_at)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("info.lastUpdated")}</span>
                  <span className="text-foreground">{formatDate(cycle.updated_at)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("stats.pendingManager")}</span>
                  <span className="text-foreground">{cycle.pending_manager_reviews}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <ConfirmDialog
          open={showStartConfirm}
          onOpenChange={(open) => {
            setShowStartConfirm(open);
            if (!open) setActivateError(null);
          }}
          title={t("confirm.startTitle")}
          description={
            <>
              {t("confirm.startDescription")}
              {activateError && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mt-3">
                  <p className="text-red-400 text-sm">{activateError}</p>
                </div>
              )}
            </>
          }
          confirmLabel={t("actions.startCycle")}
          tone="neutral"
          onConfirm={handleStartCycle}
        />

        <ConfirmDialog
          open={showAdvanceConfirm}
          onOpenChange={setShowAdvanceConfirm}
          title={t("confirm.advanceTitle")}
          description={t("confirm.advanceDescriptionTemplate", {
            from: statusLabels[cycle.status] || cycle.status,
            to: nextPhaseLabel(cycle.status) ?? t("confirm.advanceFallbackNext"),
          })}
          confirmLabel={t("actions.advancePhase")}
          tone="warning"
          onConfirm={handleAdvancePhase}
        />
      </div>
    </div>
  );
}
