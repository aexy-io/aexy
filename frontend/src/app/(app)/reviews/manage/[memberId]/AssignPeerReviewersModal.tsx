"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle, Loader2, Search, UserCheck, X } from "lucide-react";

import { ReviewRequest, reviewsApi } from "@/lib/api";
import { useWorkspaceMembers } from "@/hooks/useWorkspace";

interface Props {
  open: boolean;
  onClose: () => void;
  /** IndividualReview.id — the review being assigned reviewers for. */
  reviewId: string;
  /** Current user / the manager assigning the reviewers. */
  managerId: string;
  /** Workspace whose member roster we'll surface. */
  workspaceId: string | null;
  /** The developer being reviewed — exclude from the picker (can't peer-review yourself). */
  revieweeDeveloperId: string;
  /** From the cycle settings, when known. Soft-enforced. */
  minReviewers?: number;
  maxReviewers?: number;
  onAssigned?: () => void;
}

const REQUEST_STATUS_LABELS: Record<string, string> = {
  pending: "Invited",
  accepted: "Accepted",
  completed: "Submitted",
  declined: "Declined",
};

// A reviewer who already has an active or completed request shouldn't be
// re-invited. Declined requests are reopened to selection so a manager
// can swap-and-retry without manual cleanup.
function isActiveRequest(status: string): boolean {
  return status === "pending" || status === "accepted" || status === "completed";
}

export function AssignPeerReviewersModal({
  open,
  onClose,
  reviewId,
  managerId,
  workspaceId,
  revieweeDeveloperId,
  minReviewers = 1,
  maxReviewers = 5,
  onAssigned,
}: Props) {
  const { members, isLoading } = useWorkspaceMembers(workspaceId);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Existing peer requests for this review — used to disable + label
  // reviewers who've already been invited so the manager doesn't create
  // duplicate ReviewRequest rows for the same reviewer.
  const [existing, setExisting] = useState<ReviewRequest[]>([]);
  const [loadingExisting, setLoadingExisting] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingExisting(true);
    reviewsApi
      .listPeerRequestsForReview(reviewId)
      .then((rows) => {
        if (!cancelled) setExisting(rows);
      })
      .catch(() => {
        // Non-fatal: failing to load existing requests just degrades to
        // the prior (duplicate-allowing) behavior — surface a soft toast.
        if (!cancelled) {
          toast.error("Couldn't load existing invites");
          setExisting([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingExisting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, reviewId]);

  // Map reviewer_id → most-relevant existing request status.
  const existingByReviewer = useMemo(() => {
    const map = new Map<string, ReviewRequest>();
    for (const r of existing) {
      const prev = map.get(r.reviewer_id);
      if (!prev) {
        map.set(r.reviewer_id, r);
        continue;
      }
      // Prefer active > declined so an old decline doesn't mask a re-invite.
      if (isActiveRequest(r.status) && !isActiveRequest(prev.status)) {
        map.set(r.reviewer_id, r);
      }
    }
    return map;
  }, [existing]);

  const filtered = useMemo(() => {
    if (!members) return [];
    const q = search.trim().toLowerCase();
    return members
      // Don't list the reviewee themselves.
      .filter((m) => m.developer_id !== revieweeDeveloperId)
      .filter((m) => {
        if (!q) return true;
        return (
          (m.developer_name || "").toLowerCase().includes(q) ||
          (m.developer_email || "").toLowerCase().includes(q) ||
          (m.role || "").toLowerCase().includes(q)
        );
      });
  }, [members, search, revieweeDeveloperId]);

  // Eligible member count excludes the reviewee. Clamp at 0 — otherwise
  // an empty workspace renders "of -1 members".
  const eligibleCount = Math.max(
    0,
    (members ?? []).filter((m) => m.developer_id !== revieweeDeveloperId).length,
  );

  if (!open) return null;

  const toggle = (developerId: string) => {
    // Block re-selecting reviewers who already have a live request.
    const existingReq = existingByReviewer.get(developerId);
    if (existingReq && isActiveRequest(existingReq.status)) {
      toast.info(
        `Already ${REQUEST_STATUS_LABELS[existingReq.status]?.toLowerCase() || existingReq.status} — can't re-invite`,
      );
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(developerId)) {
        next.delete(developerId);
      } else if (next.size < maxReviewers) {
        next.add(developerId);
      } else {
        toast.error(`Max ${maxReviewers} reviewers per cycle`);
      }
      return next;
    });
  };

  const handleAssign = async () => {
    if (selected.size < minReviewers) {
      toast.error(
        `Pick at least ${minReviewers} reviewer${minReviewers === 1 ? "" : "s"}`
      );
      return;
    }
    setSubmitting(true);
    try {
      await reviewsApi.assignPeerReviewers(reviewId, managerId, {
        reviewer_ids: Array.from(selected),
        message: message.trim() || undefined,
      });
      toast.success(
        `Invited ${selected.size} reviewer${selected.size === 1 ? "" : "s"}`
      );
      setSelected(new Set());
      setMessage("");
      setSearch("");
      onAssigned?.();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to assign reviewers");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Invite peer reviewers
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Pick {minReviewers}–{maxReviewers} teammates. Each gets a
              notification and can accept or decline.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-accent text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Search */}
        <div className="px-5 py-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by name, email, or role"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-background border border-border rounded-md pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
            />
          </div>
          <p className="text-[11px] text-muted-foreground mt-1.5">
            {selected.size} selected · {filtered.length} of {eligibleCount}{" "}
            workspace member{eligibleCount === 1 ? "" : "s"}
            {loadingExisting && " · loading existing invites…"}
          </p>
        </div>

        {/* Members list */}
        <div className="overflow-y-auto flex-1">
          {isLoading && (
            <div className="p-5 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          )}
          {!isLoading && filtered.length === 0 && (
            <div className="p-5 text-sm text-muted-foreground text-center">
              No matching workspace members.
            </div>
          )}
          {!isLoading && filtered.length > 0 && (
            <ul className="divide-y divide-border">
              {filtered.map((m) => {
                const isSelected = selected.has(m.developer_id);
                const existingReq = existingByReviewer.get(m.developer_id);
                const isAlreadyInvited =
                  existingReq && isActiveRequest(existingReq.status);
                return (
                  <li
                    key={m.developer_id}
                    onClick={() => toggle(m.developer_id)}
                    className={`px-5 py-2.5 flex items-center gap-3 transition ${
                      isAlreadyInvited
                        ? "opacity-50 cursor-not-allowed"
                        : "cursor-pointer"
                    } ${
                      isSelected ? "bg-cyan-500/10" : "hover:bg-accent/40"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={isAlreadyInvited}
                      onChange={() => toggle(m.developer_id)}
                      onClick={(e) => e.stopPropagation()}
                      className="h-4 w-4 disabled:cursor-not-allowed"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {m.developer_name || m.developer_email || "Unknown"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {m.developer_email} · {m.role}
                      </p>
                    </div>
                    {existingReq && (
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full ${
                          isAlreadyInvited
                            ? "bg-muted text-muted-foreground"
                            : "bg-red-500/10 text-red-400"
                        }`}
                        title={`Existing request: ${existingReq.status}`}
                      >
                        <CheckCircle className="h-3 w-3" />
                        {REQUEST_STATUS_LABELS[existingReq.status] ||
                          existingReq.status}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Optional message */}
        <div className="px-5 py-3 border-t border-border">
          <label className="text-xs text-muted-foreground block mb-1">
            Message to all selected reviewers (optional)
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
            placeholder="e.g. Focus on cross-team collaboration this cycle."
            className="w-full bg-background border border-border rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
          />
        </div>

        {/* Actions */}
        <footer className="px-5 py-3 border-t border-border flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-accent transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleAssign}
            disabled={submitting || selected.size === 0}
            className="px-3 py-1.5 text-sm rounded-md bg-cyan-600 hover:bg-cyan-500 text-white transition flex items-center gap-1.5 disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <UserCheck className="h-3.5 w-3.5" />
            )}
            Invite {selected.size > 0 ? selected.size : ""} reviewer
            {selected.size === 1 ? "" : "s"}
          </button>
        </footer>
      </div>
    </div>
  );
}
