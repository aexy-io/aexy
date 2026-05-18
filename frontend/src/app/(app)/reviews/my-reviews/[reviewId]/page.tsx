"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Calendar,
  CheckCircle,
  ClipboardCheck,
  Clock,
  Loader2,
  Send,
  UserCheck,
  Users,
  XCircle,
} from "lucide-react";

import { Breadcrumb } from "@/components/ui/breadcrumb";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { InvitePeerReviewersModal } from "@/components/reviews/InvitePeerReviewersModal";
import { ReviewRequest, reviewsApi } from "@/lib/api";

const REQUEST_STATUS: Record<
  string,
  { label: string; color: string; bg: string; Icon: typeof Clock }
> = {
  pending: {
    label: "Awaiting response",
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/10",
    Icon: Clock,
  },
  accepted: {
    label: "Accepted",
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-500/10",
    Icon: CheckCircle,
  },
  completed: {
    label: "Submitted",
    color: "text-green-600 dark:text-green-400",
    bg: "bg-green-500/10",
    Icon: CheckCircle,
  },
  declined: {
    label: "Declined",
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-500/10",
    Icon: XCircle,
  },
};

const PHASE_LABELS: Record<string, string> = {
  draft: "Draft",
  active: "Active",
  self_review: "Self review",
  peer_review: "Peer review",
  manager_review: "Manager review",
  completed: "Completed",
};

export default function MyReviewDetailPage() {
  const params = useParams();
  const router = useRouter();
  const reviewId = params.reviewId as string;
  const queryClient = useQueryClient();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const { currentWorkspace } = useWorkspace();

  const [showInviteReviewers, setShowInviteReviewers] = useState(false);

  // Defer auth redirect to a useEffect — never call router.push during render.
  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push("/");
  }, [authLoading, isAuthenticated, router]);

  // Fetch the review + cycle in parallel.
  const { data: review, isLoading: reviewLoading, error: reviewError } = useQuery({
    queryKey: ["review", reviewId],
    queryFn: () => reviewsApi.getReview(reviewId),
    enabled: !!reviewId && isAuthenticated,
  });

  const { data: cycle } = useQuery({
    queryKey: ["reviewCycle", review?.review_cycle_id],
    queryFn: () => reviewsApi.getCycle(review!.review_cycle_id),
    enabled: !!review?.review_cycle_id,
  });

  const { data: peerRequests = [], isLoading: peerLoading } = useQuery({
    queryKey: ["peerRequestsForReview", reviewId],
    queryFn: () => reviewsApi.listPeerRequestsForReview(reviewId),
    enabled: !!reviewId && isAuthenticated,
  });

  // Only the reviewee gets the self-nominate flow here — managers /
  // admins land on /reviews/manage/[memberId] which has its own picker
  // with the `manager_assign` mode.
  const isReviewee = review && user?.id === review.developer_id;

  const peerMode = cycle?.settings?.peer_selection_mode;
  const canNominate =
    isReviewee && (peerMode === "employee_choice" || peerMode === "both");
  const peerSelectionExplanation =
    peerMode === "manager_assigned"
      ? "Your manager assigns peer reviewers for this cycle."
      : peerMode === "employee_choice"
      ? "Nominate teammates you'd like to review you."
      : peerMode === "both"
      ? "You and your manager can both nominate reviewers."
      : null;

  const minReviewers = cycle?.settings?.min_peer_reviewers;
  const maxReviewers = cycle?.settings?.max_peer_reviewers;

  // Tally active peer requests so the user knows whether they've met
  // the cycle's minimum reviewer count without scanning the list.
  const activeRequestCount = peerRequests.filter(
    (r) => r.status === "pending" || r.status === "accepted" || r.status === "completed",
  ).length;

  if (authLoading || !isAuthenticated || reviewLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (reviewError || !review) {
    return (
      <div className="min-h-screen bg-background">
        <main className="max-w-4xl mx-auto px-4 py-8">
          <div className="bg-card border border-border rounded-xl p-8 text-center">
            <p className="text-sm text-muted-foreground">
              We couldn&apos;t load this review.
            </p>
            <Link
              href="/reviews"
              className="inline-flex items-center gap-1.5 text-sm text-purple-400 hover:text-purple-300 mt-3"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to reviews
            </Link>
          </div>
        </main>
      </div>
    );
  }

  // Authorize at the route boundary: only the reviewee can view this page.
  // Managers / admins use /reviews/manage/[memberId] which has the full
  // finalization tools. 404 rather than 403 to avoid an "exists but you
  // can't see it" oracle.
  if (!isReviewee) {
    return (
      <div className="min-h-screen bg-background">
        <main className="max-w-4xl mx-auto px-4 py-8">
          <div className="bg-card border border-border rounded-xl p-8 text-center">
            <p className="text-sm text-muted-foreground">
              This review isn&apos;t yours to view here.
            </p>
            <Link
              href="/reviews"
              className="inline-flex items-center gap-1.5 text-sm text-purple-400 hover:text-purple-300 mt-3"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to reviews
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const selfSubmitted = !!review.self_review;

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-4xl mx-auto px-4 py-8">
        <Breadcrumb
          items={[
            { label: "Reviews", href: "/reviews" },
            { label: cycle?.name || "My review" },
          ]}
        />

        {/* Header */}
        <div className="bg-card border border-border rounded-xl p-6 mb-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-purple-500/10 rounded-lg">
                <ClipboardCheck className="h-5 w-5 text-purple-400" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-foreground">
                  {cycle?.name || "Your review"}
                </h1>
                <p className="text-sm text-muted-foreground">
                  Current phase:{" "}
                  <span className="text-foreground font-medium">
                    {PHASE_LABELS[cycle?.status || ""] || cycle?.status || "—"}
                  </span>
                  {review.manager_name && (
                    <>
                      {" · Manager: "}
                      <span className="text-foreground">{review.manager_name}</span>
                    </>
                  )}
                </p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-foreground">
              {PHASE_LABELS[review.status] || review.status}
            </span>
          </div>

          {/* Deadline strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
            <DeadlineCard
              label="Self review"
              date={cycle?.self_review_deadline}
              done={selfSubmitted}
            />
            <DeadlineCard
              label="Peer review"
              date={cycle?.peer_review_deadline}
              done={activeRequestCount > 0 &&
                peerRequests.every((r) => r.status === "completed" || r.status === "declined")}
            />
            <DeadlineCard
              label="Manager review"
              date={cycle?.manager_review_deadline}
              done={!!review.manager_review}
            />
          </div>
        </div>

        {/* Self review block */}
        <div className="bg-card border border-border rounded-xl p-6 mb-6">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div>
              <h2 className="text-base font-semibold text-foreground">
                Your self review
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {selfSubmitted
                  ? "Submitted — your manager will see this when they open the cycle."
                  : "Reflect on your wins and growth this cycle. The manager-finalize step builds on what you write here."}
              </p>
            </div>
            {selfSubmitted ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-green-600 dark:text-green-400 bg-green-500/10">
                <CheckCircle className="h-3.5 w-3.5" />
                Submitted
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10">
                <Clock className="h-3.5 w-3.5" />
                Not started
              </span>
            )}
          </div>

          {selfSubmitted ? (
            <SelfReviewSummary
              strengths={review.self_review?.responses.strengths || []}
              growthAreas={review.self_review?.responses.growth_areas || []}
              note={review.self_review?.responses.question_responses?.general}
            />
          ) : (
            <SelfReviewForm
              reviewId={review.id}
              onSubmitted={() => {
                queryClient.invalidateQueries({ queryKey: ["review", reviewId] });
              }}
            />
          )}
        </div>

        {/* Peer reviewers block */}
        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex items-start justify-between gap-4 mb-3 flex-wrap">
            <div>
              <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                <Users className="h-4 w-4 text-cyan-400" />
                Peer reviewers
              </h2>
              {peerSelectionExplanation && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {peerSelectionExplanation}
                </p>
              )}
              {(minReviewers != null || maxReviewers != null) && (
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {activeRequestCount} active ·{" "}
                  {minReviewers != null && (
                    <>
                      need at least{" "}
                      <span
                        className={
                          activeRequestCount >= minReviewers
                            ? "text-green-500"
                            : "text-amber-500"
                        }
                      >
                        {minReviewers}
                      </span>
                    </>
                  )}
                  {maxReviewers != null && <> · max {maxReviewers}</>}
                </p>
              )}
            </div>
            {canNominate && (
              <button
                onClick={() => setShowInviteReviewers(true)}
                className="px-3 py-1.5 text-sm rounded-md bg-cyan-600 hover:bg-cyan-500 text-white transition flex items-center gap-1.5"
              >
                <UserCheck className="h-3.5 w-3.5" />
                Nominate reviewers
              </button>
            )}
          </div>

          {peerLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : peerRequests.length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground">
              {canNominate
                ? "No reviewers yet. Pick teammates above to invite."
                : "No reviewers assigned yet."}
            </div>
          ) : (
            <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
              {peerRequests.map((r) => (
                <PeerRequestRow key={r.id} request={r} />
              ))}
            </ul>
          )}
        </div>

        {/* Acknowledge action — only when manager review is complete */}
        {review.status === "completed" && (
          <AcknowledgeCard
            reviewId={review.id}
            onAcknowledged={() =>
              queryClient.invalidateQueries({ queryKey: ["review", reviewId] })
            }
          />
        )}

        {canNominate && (
          <InvitePeerReviewersModal
            open={showInviteReviewers}
            onClose={() => setShowInviteReviewers(false)}
            reviewId={review.id}
            callerDeveloperId={user!.id}
            workspaceId={currentWorkspace?.id ?? null}
            revieweeDeveloperId={review.developer_id}
            minReviewers={minReviewers}
            maxReviewers={maxReviewers}
            mode="self_nominate"
            onAssigned={() => {
              queryClient.invalidateQueries({ queryKey: ["review", reviewId] });
              queryClient.invalidateQueries({
                queryKey: ["peerRequestsForReview", reviewId],
              });
            }}
          />
        )}
      </main>
    </div>
  );
}

function DeadlineCard({
  label,
  date,
  done,
}: {
  label: string;
  date: string | null | undefined;
  done: boolean;
}) {
  const dateStr = date
    ? new Date(date).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : "—";
  return (
    <div className="bg-muted/40 border border-border rounded-lg px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-sm text-foreground font-medium flex items-center gap-1.5 mt-0.5">
        <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
        {dateStr}
        {done && <CheckCircle className="h-3.5 w-3.5 text-green-500" />}
      </p>
    </div>
  );
}

function PeerRequestRow({ request }: { request: ReviewRequest }) {
  const status = REQUEST_STATUS[request.status] || REQUEST_STATUS.pending;
  const Icon = status.Icon;
  return (
    <li className="px-4 py-2.5 flex items-center justify-between gap-3 bg-card">
      <div className="min-w-0">
        <p className="text-sm text-foreground truncate">
          {request.reviewer_name || request.reviewer_email || "Unknown reviewer"}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {request.request_source === "employee" ? "Self-nominated" : "Manager-assigned"}
          {" · "}
          invited{" "}
          {new Date(request.created_at).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}
        </p>
      </div>
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${status.color} ${status.bg}`}
      >
        <Icon className="h-3 w-3" />
        {status.label}
      </span>
    </li>
  );
}

function SelfReviewSummary({
  strengths,
  growthAreas,
  note,
}: {
  strengths: string[];
  growthAreas: string[];
  note?: string;
}) {
  if (strengths.length === 0 && growthAreas.length === 0 && !note) {
    return (
      <p className="text-sm text-muted-foreground">
        Your submission didn&apos;t include free-text responses.
      </p>
    );
  }
  return (
    <div className="grid sm:grid-cols-2 gap-4 mt-2">
      {strengths.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Strengths</p>
          <ul className="text-sm text-foreground list-disc list-inside space-y-1">
            {strengths.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      {growthAreas.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">
            Growth areas
          </p>
          <ul className="text-sm text-foreground list-disc list-inside space-y-1">
            {growthAreas.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        </div>
      )}
      {note && (
        <div className="sm:col-span-2">
          <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
          <p className="text-sm text-foreground whitespace-pre-wrap">{note}</p>
        </div>
      )}
    </div>
  );
}

function SelfReviewForm({
  reviewId,
  onSubmitted,
}: {
  reviewId: string;
  onSubmitted: () => void;
}) {
  const [strengths, setStrengths] = useState<string[]>([""]);
  const [growth, setGrowth] = useState<string[]>([""]);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const cleanStrengths = strengths.map((s) => s.trim()).filter(Boolean);
    const cleanGrowth = growth.map((s) => s.trim()).filter(Boolean);
    if (
      cleanStrengths.length === 0 &&
      cleanGrowth.length === 0 &&
      !note.trim()
    ) {
      toast.error("Add at least one strength, growth area, or note");
      return;
    }
    setSubmitting(true);
    try {
      await reviewsApi.submitSelfReview(reviewId, {
        responses: {
          achievements: [],
          areas_for_growth: [],
          question_responses: note.trim() ? { general: note.trim() } : {},
          strengths: cleanStrengths,
          growth_areas: cleanGrowth,
        },
      });
      toast.success("Self-review submitted");
      onSubmitted();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to submit self review");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 mt-2">
      <BulletEditor
        label="What went well"
        placeholder="e.g. Owned the auth migration end-to-end and unblocked mobile."
        values={strengths}
        onChange={setStrengths}
      />
      <BulletEditor
        label="Areas to grow"
        placeholder="e.g. Want to get sharper on architectural trade-offs."
        values={growth}
        onChange={setGrowth}
      />
      <div>
        <label className="text-xs font-medium text-muted-foreground block mb-1">
          Anything else
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Free-text notes that don't fit above."
          className="w-full bg-background border border-border rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/30"
        />
      </div>
      <div className="flex justify-end">
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="px-4 py-2 text-sm rounded-lg bg-purple-600 hover:bg-purple-500 text-white transition flex items-center gap-2 disabled:opacity-50"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          Submit self-review
        </button>
      </div>
    </div>
  );
}

function BulletEditor({
  label,
  placeholder,
  values,
  onChange,
}: {
  label: string;
  placeholder: string;
  values: string[];
  onChange: (next: string[]) => void;
}) {
  // Auto-append an empty row when the last one gets text so the user
  // doesn't have to hunt for a "+ add" button between thoughts.
  const handleChange = (idx: number, value: string) => {
    const next = [...values];
    next[idx] = value;
    if (idx === next.length - 1 && value.trim().length > 0) {
      next.push("");
    }
    onChange(next);
  };

  const handleRemove = (idx: number) => {
    const next = values.filter((_, i) => i !== idx);
    onChange(next.length > 0 ? next : [""]);
  };

  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground block mb-1">
        {label}
      </label>
      <div className="space-y-2">
        {values.map((value, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="text-muted-foreground pt-2">•</span>
            <textarea
              value={value}
              onChange={(e) => handleChange(i, e.target.value)}
              rows={1}
              placeholder={i === 0 ? placeholder : ""}
              className="flex-1 bg-background border border-border rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/30 resize-none"
            />
            {values.length > 1 && (
              <button
                onClick={() => handleRemove(i)}
                className="text-xs text-muted-foreground hover:text-destructive pt-2"
                type="button"
              >
                remove
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function AcknowledgeCard({
  reviewId,
  onAcknowledged,
}: {
  reviewId: string;
  onAcknowledged: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const handleAcknowledge = async () => {
    setSubmitting(true);
    try {
      await reviewsApi.acknowledgeReview(reviewId);
      toast.success("Review acknowledged");
      onAcknowledged();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to acknowledge");
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <div className="mt-6 bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-5 flex items-center justify-between gap-3 flex-wrap">
      <div>
        <p className="text-sm font-medium text-foreground">
          Your manager has completed this review.
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Acknowledge to close out the cycle for yourself.
        </p>
      </div>
      <button
        onClick={handleAcknowledge}
        disabled={submitting}
        className="px-4 py-2 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center gap-2 disabled:opacity-50"
      >
        {submitting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CheckCircle className="h-4 w-4" />
        )}
        Acknowledge
      </button>
    </div>
  );
}
