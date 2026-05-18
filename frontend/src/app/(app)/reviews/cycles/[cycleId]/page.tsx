"use client";

import { useState } from "react";
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
import { useReviewCycle } from "@/hooks/useReviews";
import { ReviewCycleStatus, reviewsApi } from "@/lib/api";
import { REVIEW_CYCLE_STATUS_COLORS, getStatusColor } from "@/lib/statusColors";

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
  const params = useParams();
  const cycleId = params.cycleId as string;
  const { isLoading: authLoading } = useAuth();
  const { cycle, isLoading, error, refetch } = useReviewCycle(cycleId);

  const [isActivating, setIsActivating] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [isResending, setIsResending] = useState<null | "activation" | "deadline" | "phase_change">(null);
  const [showStartConfirm, setShowStartConfirm] = useState(false);
  const [showAdvanceConfirm, setShowAdvanceConfirm] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);

  const handleResend = async (
    kind: "activation" | "deadline" | "phase_change",
  ) => {
    if (!cycleId || isResending) return;
    setIsResending(kind);
    try {
      const result = await reviewsApi.resendCycleNotifications(cycleId, { kind });
      if (result.sent > 0) {
        toast.success(
          `Sent ${result.sent} ${kind.replace("_", " ")} notification${result.sent === 1 ? "" : "s"}`,
        );
      } else {
        toast.info(
          result.reason
            ? `No notifications sent — ${result.reason}`
            : "No eligible recipients for this notification",
        );
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to resend notifications");
    } finally {
      setIsResending(null);
    }
  };

  const handleStartCycle = async () => {
    if (!cycleId) return;
    setIsActivating(true);
    setActivateError(null);
    try {
      await reviewsApi.activateCycle(cycleId);
      await refetch();
      setShowStartConfirm(false);
    } catch (err: any) {
      setActivateError(err?.response?.data?.detail || "Failed to start cycle");
    } finally {
      setIsActivating(false);
    }
  };

  const handleAdvancePhase = async () => {
    if (!cycleId || isAdvancing) return;
    setIsAdvancing(true);
    try {
      await reviewsApi.advanceCyclePhase(cycleId);
      await refetch();
      setShowAdvanceConfirm(false);
      toast.success("Cycle advanced to the next phase");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to advance phase");
    } finally {
      setIsAdvancing(false);
    }
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 border-4 border-primary-500/20 rounded-full"></div>
            <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
          </div>
          <p className="text-muted-foreground text-sm">Loading review cycle...</p>
        </div>
      </div>
    );
  }

  if (error || !cycle) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Calendar className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-medium text-foreground mb-2">Review cycle not found</h2>
          <p className="text-muted-foreground mb-6">The review cycle you're looking for doesn't exist or you don't have access.</p>
          <Link href="/reviews/cycles" className="text-cyan-400 hover:text-cyan-300 transition">
            Back to Cycles
          </Link>
        </div>
      </div>
    );
  }

  const statusStyle = getStatusColor(REVIEW_CYCLE_STATUS_COLORS, cycle.status);
  const completionRate = cycle.total_reviews > 0
    ? Math.round((cycle.completed_reviews / cycle.total_reviews) * 100)
    : 0;

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Not set";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-5xl mx-auto px-4 py-8">
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
            <div className="flex items-center gap-2">
              {cycle.status === "draft" && (
                <button
                  onClick={() => setShowStartConfirm(true)}
                  className="px-4 py-2 text-sm bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition flex items-center gap-2"
                >
                  <Play className="h-4 w-4" />
                  Start Cycle
                </button>
              )}
              {cycle.status !== "completed" && cycle.status !== "draft" && (
                <button
                  onClick={() => setShowAdvanceConfirm(true)}
                  disabled={isAdvancing}
                  className="px-4 py-2 text-sm bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-lg transition flex items-center gap-2"
                >
                  {isAdvancing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FastForward className="h-4 w-4" />
                  )}
                  Advance Phase
                </button>
              )}
              {cycle.status !== "draft" && cycle.status !== "completed" && (
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild>
                    <button
                      disabled={isResending !== null}
                      className="px-3 py-2 text-sm bg-accent hover:bg-muted disabled:opacity-50 text-foreground rounded-lg transition flex items-center gap-2"
                      title="Resend a cycle notification to participants"
                    >
                      {isResending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Bell className="h-4 w-4" />
                      )}
                      Notify
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
                        Resend notification
                      </DropdownMenu.Label>
                      <DropdownMenu.Item
                        onSelect={(e) => {
                          e.preventDefault();
                          handleResend("activation");
                        }}
                        disabled={isResending !== null}
                        className="px-3 py-2 text-sm hover:bg-accent transition outline-none cursor-pointer data-[disabled]:opacity-50"
                      >
                        Cycle started — all enrolled
                      </DropdownMenu.Item>
                      <DropdownMenu.Item
                        onSelect={(e) => {
                          e.preventDefault();
                          handleResend("deadline");
                        }}
                        disabled={isResending !== null}
                        className="px-3 py-2 text-sm hover:bg-accent transition outline-none cursor-pointer data-[disabled]:opacity-50"
                      >
                        Deadline reminder — pending only
                      </DropdownMenu.Item>
                      <DropdownMenu.Item
                        onSelect={(e) => {
                          e.preventDefault();
                          handleResend("phase_change");
                        }}
                        disabled={isResending !== null}
                        className="px-3 py-2 text-sm hover:bg-accent transition outline-none cursor-pointer data-[disabled]:opacity-50"
                      >
                        Phase change — all enrolled
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
              <span className="text-muted-foreground">Completion Progress</span>
              <span className="text-foreground font-medium">{completionRate}%</span>
            </div>
            <div className="h-3 bg-accent rounded-full overflow-hidden">
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
                <p className="text-sm text-muted-foreground">Total Reviews</p>
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
                <p className="text-sm text-muted-foreground">Completed</p>
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
                <p className="text-sm text-muted-foreground">Pending Self</p>
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
                <p className="text-sm text-muted-foreground">Pending Peer</p>
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
                Phase Deadlines
              </h2>
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-3 bg-accent/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-cyan-500/10">
                      <UserCheck className="h-4 w-4 text-cyan-400" />
                    </div>
                    <span className="text-foreground">Self Review</span>
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
                    <span className="text-foreground">Peer Review</span>
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
                    <span className="text-foreground">Manager Review</span>
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
                Participants
              </h2>
              {cycle.total_reviews > 0 ? (
                <p className="text-muted-foreground text-sm">
                  {cycle.total_reviews} team member{cycle.total_reviews > 1 ? "s" : ""} enrolled in this review cycle.
                </p>
              ) : cycle.status === "draft" ? (
                <div className="text-center py-8">
                  <Users className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm mb-2">No participants enrolled yet.</p>
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
                  <p className="text-muted-foreground text-sm">No participants in this cycle.</p>
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
                Settings
              </h2>
              {cycle.settings ? (
                <div className="space-y-3 text-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <span className="text-muted-foreground">Self Review</span>
                    <span className={cycle.settings.enable_self_review ? "text-emerald-400" : "text-muted-foreground"}>
                      {cycle.settings.enable_self_review ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <span className="text-muted-foreground">Peer Review</span>
                    <span className={cycle.settings.enable_peer_review ? "text-emerald-400" : "text-muted-foreground"}>
                      {cycle.settings.enable_peer_review ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <span className="text-muted-foreground">Manager Review</span>
                    <span className={cycle.settings.enable_manager_review ? "text-emerald-400" : "text-muted-foreground"}>
                      {cycle.settings.enable_manager_review ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <span className="text-muted-foreground">Anonymous Peer</span>
                    <span className={cycle.settings.anonymous_peer_reviews ? "text-emerald-400" : "text-muted-foreground"}>
                      {cycle.settings.anonymous_peer_reviews ? "Yes" : "No"}
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <span className="text-muted-foreground">GitHub Metrics</span>
                    <span className={cycle.settings.include_github_metrics ? "text-emerald-400" : "text-muted-foreground"}>
                      {cycle.settings.include_github_metrics ? "Included" : "Not included"}
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <span className="text-muted-foreground">Peer Reviewers</span>
                    <span className="text-foreground">
                      {cycle.settings.min_peer_reviewers} - {cycle.settings.max_peer_reviewers}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">No settings configured.</p>
              )}
            </div>

            {/* Quick Info */}
            <div className="bg-muted/50 rounded-xl border border-border p-6">
              <h2 className="text-lg font-medium text-foreground mb-4">Info</h2>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Created</span>
                  <span className="text-foreground">{formatDate(cycle.created_at)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last Updated</span>
                  <span className="text-foreground">{formatDate(cycle.updated_at)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pending Manager</span>
                  <span className="text-foreground">{cycle.pending_manager_reviews}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Start Cycle Confirmation Modal */}
        {showStartConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-muted rounded-xl border border-border p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-medium text-foreground mb-2">Start Review Cycle?</h3>
              <p className="text-muted-foreground text-sm mb-4">
                This will activate the cycle and automatically enroll all team members from your workspace.
                Individual reviews will be created for each participant.
              </p>
              {activateError && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4">
                  <p className="text-red-400 text-sm">{activateError}</p>
                </div>
              )}
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowStartConfirm(false);
                    setActivateError(null);
                  }}
                  disabled={isActivating}
                  className="px-4 py-2 text-sm bg-accent hover:bg-muted text-foreground rounded-lg transition disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleStartCycle}
                  disabled={isActivating}
                  className="px-4 py-2 text-sm bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition flex items-center gap-2 disabled:opacity-50"
                >
                  {isActivating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Starting...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" />
                      Start Cycle
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Advance Phase Confirmation Modal */}
        {showAdvanceConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-muted rounded-xl border border-border p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-medium text-foreground mb-2">
                Advance to next phase?
              </h3>
              <p className="text-muted-foreground text-sm mb-4">
                Moves this cycle from{" "}
                <span className="font-medium text-foreground">
                  {statusLabels[cycle.status] || cycle.status}
                </span>{" "}
                →{" "}
                <span className="font-medium text-foreground">
                  {nextPhaseLabel(cycle.status) ?? "next phase"}
                </span>
                . Participants will be notified and the relevant submission
                forms will open / close.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowAdvanceConfirm(false)}
                  disabled={isAdvancing}
                  className="px-4 py-2 text-sm bg-accent hover:bg-muted text-foreground rounded-lg transition disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAdvancePhase}
                  disabled={isAdvancing}
                  className="px-4 py-2 text-sm bg-amber-600 hover:bg-amber-500 text-white rounded-lg transition flex items-center gap-2 disabled:opacity-50"
                >
                  {isAdvancing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Advancing...
                    </>
                  ) : (
                    <>
                      <FastForward className="h-4 w-4" />
                      Advance Phase
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
