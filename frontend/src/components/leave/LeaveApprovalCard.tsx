"use client";

import { useState } from "react";
import {
  Calendar,
  Clock,
  Check,
  X,
  User,
  MessageSquare,
} from "lucide-react";
import { LeaveRequest } from "@/lib/leave-api";

interface LeaveApprovalCardProps {
  request: LeaveRequest;
  onApprove: (id: string) => void;
  onReject: (id: string, reason?: string) => void;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function LeaveApprovalCard({
  request,
  onApprove,
  onReject,
}: LeaveApprovalCardProps) {
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [actionTaken, setActionTaken] = useState<"approve" | "reject" | null>(null);

  const leaveType = request.leave_type;
  const developer = request.developer;
  const isSingleDay = request.start_date === request.end_date;

  const handleApprove = () => {
    setActionTaken("approve");
    onApprove(request.id);
  };

  const handleReject = () => {
    setActionTaken("reject");
    onReject(request.id, rejectReason || undefined);
    setShowRejectInput(false);
    setRejectReason("");
  };

  return (
    <div className="bg-background border border-border rounded-xl p-5">
      {/* Requester info */}
      <div className="flex items-start gap-3">
        {developer?.avatar_url ? (
          <img
            src={developer.avatar_url}
            alt={developer.name || "User"}
            className="w-10 h-10 rounded-full object-cover flex-shrink-0"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
            <User className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-foreground truncate">
            {developer?.name || developer?.email || "Unknown User"}
          </h3>
          <div className="flex items-center gap-2 mt-0.5">
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: leaveType?.color || "#6366f1" }}
            />
            <span className="text-xs text-muted-foreground truncate">
              {leaveType?.name || "Leave"}
            </span>
          </div>
        </div>
        <span className="text-xs font-medium px-2.5 py-1 rounded-full border bg-yellow-500/10 text-yellow-400 border-yellow-500/20 flex-shrink-0">
          Pending
        </span>
      </div>

      {/* Date range */}
      <div className="mt-4 space-y-1.5">
        <div className="flex items-center gap-2 text-sm text-foreground">
          <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span>
            {isSingleDay
              ? formatDate(request.start_date)
              : `${formatDate(request.start_date)} - ${formatDate(request.end_date)}`}
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span>
            {request.total_days} {request.total_days === 1 ? "day" : "days"}
            {request.is_half_day && (
              <span className="ml-1 text-muted-foreground">
                ({request.half_day_period === "first_half" ? "First half" : "Second half"})
              </span>
            )}
          </span>
        </div>
      </div>

      {/* Reason */}
      {request.reason && (
        <div className="mt-3 flex items-start gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
          <p>{request.reason}</p>
        </div>
      )}

      {/* Reject reason input */}
      {showRejectInput && (
        <div className="mt-3">
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason for rejection (optional)..."
            rows={2}
            className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-red-500/50 resize-none"
          />
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border">
        {!showRejectInput ? (
          <>
            <button
              onClick={handleApprove}
              disabled={actionTaken !== null}
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 transition disabled:opacity-50"
            >
              <Check className="h-4 w-4" />
              Approve
            </button>
            <button
              onClick={() => setShowRejectInput(true)}
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-red-600/10 border border-red-500/20 text-red-400 hover:bg-red-600/20 transition"
            >
              <X className="h-4 w-4" />
              Reject
            </button>
          </>
        ) : (
          <>
            <button
              onClick={handleReject}
              disabled={actionTaken !== null}
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-500 transition disabled:opacity-50"
            >
              <X className="h-4 w-4" />
              Confirm Reject
            </button>
            <button
              onClick={() => {
                setShowRejectInput(false);
                setRejectReason("");
              }}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-border text-foreground hover:bg-muted transition"
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
