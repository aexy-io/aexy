"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  Calendar,
  CheckCircle,
  Clock,
  Loader2,
  MessageSquare,
  Send,
  User,
  XCircle,
} from "lucide-react";

import { Breadcrumb } from "@/components/ui/breadcrumb";
import { useAuth } from "@/hooks/useAuth";
import { ReviewRequest, reviewsApi } from "@/lib/api";

const STATUS_BADGE: Record<
  string,
  { label: string; color: string; bg: string; Icon: typeof Clock }
> = {
  pending: {
    label: "Awaiting your decision",
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/10",
    Icon: Clock,
  },
  accepted: {
    label: "Accepted — submit your feedback",
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-500/10",
    Icon: CheckCircle,
  },
  completed: {
    label: "Completed",
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

export default function PeerRequestDetailPage() {
  const params = useParams();
  const router = useRouter();
  const requestId = params.requestId as string;
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();

  const [request, setRequest] = useState<ReviewRequest | null>(null);
  // Defer "loading" until we know auth state. Otherwise an unauthenticated
  // visitor sees a perpetual spinner — fetchRequest (which clears the flag)
  // is gated on isAuthenticated, so it would never run.
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Accept / decline flow
  const [showDeclineForm, setShowDeclineForm] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [isResponding, setIsResponding] = useState(false);

  // Submission flow (when status === "accepted")
  // Kept narrow on purpose — managers/HR get the full COIN form on the
  // review-detail page later; this surface needs strengths + growth +
  // a free-text note, which is what 90% of peer reviewers will write.
  const [strengths, setStrengths] = useState<string[]>([""]);
  const [growth, setGrowth] = useState<string[]>([""]);
  const [generalNote, setGeneralNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchRequest = async () => {
    if (!requestId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await reviewsApi.getPeerRequest(requestId);
      setRequest(data);
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Failed to load request");
    } finally {
      setIsLoading(false);
    }
  };

  // Gate the fetch on authentication so we never fire the request
  // with no JWT — the backend now requires the caller to be a party
  // to the request or a workspace admin, so unauthenticated calls
  // return 404 and would render a confusing error.
  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      // Side-effect redirects belong in an effect, not in render.
      router.push("/");
      return;
    }
    fetchRequest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId, authLoading, isAuthenticated]);

  const handleAccept = async () => {
    if (!request || isResponding) return;
    setIsResponding(true);
    try {
      const updated = await reviewsApi.respondToPeerRequest(request.id, {
        accept: true,
      });
      setRequest(updated);
      toast.success("Accepted — write your feedback below");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to accept request");
    } finally {
      setIsResponding(false);
    }
  };

  const handleDecline = async () => {
    if (!request || isResponding) return;
    if (!declineReason.trim()) {
      toast.error("Add a short reason so the requester knows why");
      return;
    }
    setIsResponding(true);
    try {
      const updated = await reviewsApi.respondToPeerRequest(request.id, {
        accept: false,
        decline_reason: declineReason.trim(),
      });
      setRequest(updated);
      setShowDeclineForm(false);
      toast.success("Request declined");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to decline request");
    } finally {
      setIsResponding(false);
    }
  };

  const handleSubmit = async () => {
    if (!request || isSubmitting || !user?.id) return;
    const cleanStrengths = strengths.map((s) => s.trim()).filter(Boolean);
    const cleanGrowth = growth.map((s) => s.trim()).filter(Boolean);
    if (cleanStrengths.length === 0 && cleanGrowth.length === 0 && !generalNote.trim()) {
      toast.error("Add at least one strength, growth area, or note before submitting");
      return;
    }
    setIsSubmitting(true);
    try {
      // Map to the ReviewResponses shape the backend expects. The minimal
      // version only fills strengths + growth + the question_responses
      // catch-all; achievements / areas_for_growth structured arrays are
      // left empty (the manager-finalization step doesn't require them).
      await reviewsApi.submitPeerReview(request.id, user.id, {
        responses: {
          achievements: [],
          areas_for_growth: [],
          question_responses: generalNote.trim()
            ? { general: generalNote.trim() }
            : {},
          strengths: cleanStrengths,
          growth_areas: cleanGrowth,
        },
      });
      toast.success("Peer review submitted — thanks for the feedback");
      // Refetch to flip the status badge into "Completed".
      await fetchRequest();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to submit review");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading || !isAuthenticated || isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !request) {
    return (
      <div className="min-h-screen bg-background">
        <main className="max-w-3xl mx-auto px-4 py-8">
          <Breadcrumb
            items={[
              { label: "Reviews", href: "/reviews" },
              { label: "Peer Requests", href: "/reviews/peer-requests" },
              { label: "Request" },
            ]}
          />
          <div className="bg-card border border-border rounded-xl p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {error || "Request not found"}
            </p>
            <Link
              href="/reviews/peer-requests"
              className="inline-flex items-center gap-1.5 text-sm text-purple-400 hover:text-purple-300 mt-3"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to peer requests
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const status = STATUS_BADGE[request.status] || STATUS_BADGE.pending;
  const StatusIcon = status.Icon;
  const isMine = request.reviewer_id === user?.id;

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-3xl mx-auto px-4 py-8">
        <Breadcrumb
          items={[
            { label: "Reviews", href: "/reviews" },
            { label: "Peer Requests", href: "/reviews/peer-requests" },
            { label: request.requester_name || "Request" },
          ]}
        />

        {/* Header */}
        <div className="bg-card border border-border rounded-xl p-6 mb-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-amber-500/10 rounded-lg">
                <MessageSquare className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-foreground">
                  Peer review request
                </h1>
                <p className="text-sm text-muted-foreground">
                  from{" "}
                  <span className="text-foreground font-medium">
                    {request.requester_name || "Unknown"}
                  </span>
                </p>
              </div>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${status.color} ${status.bg}`}
            >
              <StatusIcon className="h-3.5 w-3.5" />
              {status.label}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground mb-4">
            <div className="flex items-center gap-2">
              <User className="h-3.5 w-3.5" />
              Source: <span className="capitalize text-foreground">{request.request_source}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5" />
              {new Date(request.created_at).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </div>
          </div>

          {request.message && (
            <div className="bg-muted/40 border border-border rounded-lg p-3 text-sm">
              <p className="text-xs text-muted-foreground mb-1">Message</p>
              <p className="text-foreground whitespace-pre-wrap">{request.message}</p>
            </div>
          )}
        </div>

        {/* Action area depends on status */}
        {!isMine && (
          <div className="bg-card border border-border rounded-xl p-6 text-sm text-muted-foreground">
            This request is for another reviewer. You can view it but not act
            on it.
          </div>
        )}

        {isMine && request.status === "pending" && !showDeclineForm && (
          <div className="bg-card border border-border rounded-xl p-6 flex flex-col sm:flex-row sm:items-center gap-3">
            <p className="text-sm text-muted-foreground flex-1">
              Accept to write feedback, or decline with a short reason.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeclineForm(true)}
                disabled={isResponding}
                className="px-4 py-2 text-sm rounded-lg border border-border text-foreground hover:bg-accent transition disabled:opacity-50"
              >
                Decline
              </button>
              <button
                onClick={handleAccept}
                disabled={isResponding}
                className="px-4 py-2 text-sm rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white transition flex items-center gap-2 disabled:opacity-50"
              >
                {isResponding ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4" />
                )}
                Accept
              </button>
            </div>
          </div>
        )}

        {isMine && request.status === "pending" && showDeclineForm && (
          <div className="bg-card border border-border rounded-xl p-6 space-y-3">
            <p className="text-sm text-foreground font-medium">
              Why are you declining?
            </p>
            <p className="text-xs text-muted-foreground">
              This is shared with the requester so they know whether to
              reassign or follow up.
            </p>
            <textarea
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              rows={3}
              placeholder="e.g. I haven't worked closely with this person this cycle."
              className="w-full bg-background border border-border rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowDeclineForm(false);
                  setDeclineReason("");
                }}
                disabled={isResponding}
                className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-accent transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDecline}
                disabled={isResponding || !declineReason.trim()}
                className="px-4 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-500 text-white transition flex items-center gap-2 disabled:opacity-50"
              >
                {isResponding ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                Decline request
              </button>
            </div>
          </div>
        )}

        {isMine && request.status === "accepted" && (
          <div className="bg-card border border-border rounded-xl p-6 space-y-5">
            <div>
              <h2 className="text-base font-semibold text-foreground mb-1">
                Write your feedback
              </h2>
              <p className="text-xs text-muted-foreground">
                Add concrete examples. Strengths first, then growth areas —
                both surface in the manager's finalization view.
              </p>
            </div>

            <BulletEditor
              label="Strengths"
              placeholder="e.g. Drove the auth migration end-to-end and unblocked the mobile team."
              values={strengths}
              onChange={setStrengths}
            />

            <BulletEditor
              label="Growth areas"
              placeholder="e.g. Could share design rationale earlier in big-scope PRs."
              values={growth}
              onChange={setGrowth}
            />

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Anything else for context
              </label>
              <textarea
                value={generalNote}
                onChange={(e) => setGeneralNote(e.target.value)}
                rows={3}
                placeholder="Free-text notes that don't fit above."
                className="w-full bg-background border border-border rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
              />
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="px-4 py-2 text-sm rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white transition flex items-center gap-2 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Submit peer review
              </button>
            </div>
          </div>
        )}

        {isMine && (request.status === "completed" || request.status === "declined") && (
          <div className="bg-card border border-border rounded-xl p-6">
            <p className="text-sm text-foreground">
              {request.status === "completed"
                ? "Thanks — your feedback has been submitted."
                : "You declined this request."}
            </p>
            <Link
              href="/reviews/peer-requests"
              className="inline-flex items-center gap-1.5 text-sm text-purple-400 hover:text-purple-300 mt-3"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to peer requests
            </Link>
          </div>
        )}
      </main>
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
  // Keep at least one row; add empty row when the last one is filled so the
  // user never has to click "+ add" to type a second point.
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
              className="flex-1 bg-background border border-border rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/30 resize-none"
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
