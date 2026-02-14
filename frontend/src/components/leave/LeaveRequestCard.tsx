"use client";

import { useState } from "react";
import { Calendar, Clock, X, Undo2 } from "lucide-react";
import { LeaveRequest } from "@/lib/leave-api";
import { useLeaveRequestMutations } from "@/hooks/useLeave";

interface LeaveRequestCardProps {
  request: LeaveRequest;
}

const statusConfig: Record<
  LeaveRequest["status"],
  { label: string; className: string }
> = {
  pending: { label: "Pending", className: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
  approved: { label: "Approved", className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  rejected: { label: "Rejected", className: "bg-red-500/10 text-red-400 border-red-500/20" },
  cancelled: { label: "Cancelled", className: "bg-slate-500/10 text-slate-400 border-slate-500/20" },
  withdrawn: { label: "Withdrawn", className: "bg-slate-500/10 text-slate-400 border-slate-500/20" },
};

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function LeaveRequestCard({ request }: LeaveRequestCardProps) {
  const { cancel, withdraw } = useLeaveRequestMutations();
  const [confirming, setConfirming] = useState<"cancel" | "withdraw" | null>(null);

  const status = statusConfig[request.status];
  const leaveType = request.leave_type;
  const isSingleDay = request.start_date === request.end_date;

  const handleCancel = () => {
    if (confirming === "cancel") {
      cancel.mutate(request.id);
      setConfirming(null);
    } else {
      setConfirming("cancel");
    }
  };

  const handleWithdraw = () => {
    if (confirming === "withdraw") {
      withdraw.mutate(request.id);
      setConfirming(null);
    } else {
      setConfirming("withdraw");
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      {/* Top row: leave type + status */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: leaveType?.color || "#6366f1" }}
          />
          <h3 className="text-sm font-semibold text-white truncate">
            {leaveType?.name || "Leave"}
          </h3>
        </div>
        <span
          className={`text-xs font-medium px-2.5 py-1 rounded-full border flex-shrink-0 ${status.className}`}
        >
          {status.label}
        </span>
      </div>

      {/* Dates */}
      <div className="flex items-center gap-2 mt-3 text-sm text-slate-300">
        <Calendar className="h-4 w-4 text-slate-500 flex-shrink-0" />
        <span>
          {isSingleDay
            ? formatDate(request.start_date)
            : `${formatDate(request.start_date)} - ${formatDate(request.end_date)}`}
        </span>
      </div>

      {/* Days + half-day info */}
      <div className="flex items-center gap-2 mt-1.5 text-sm text-slate-400">
        <Clock className="h-4 w-4 text-slate-500 flex-shrink-0" />
        <span>
          {request.total_days} {request.total_days === 1 ? "day" : "days"}
          {request.is_half_day && (
            <span className="ml-1 text-slate-500">
              ({request.half_day_period === "first_half" ? "First half" : "Second half"})
            </span>
          )}
        </span>
      </div>

      {/* Reason */}
      {request.reason && (
        <p className="mt-3 text-sm text-slate-400 bg-slate-800/50 rounded-lg px-3 py-2">
          {request.reason}
        </p>
      )}

      {/* Rejection reason */}
      {request.status === "rejected" && request.rejection_reason && (
        <div className="mt-3 text-sm bg-red-500/5 border border-red-500/10 rounded-lg px-3 py-2">
          <span className="text-red-400 font-medium text-xs">Rejection reason: </span>
          <span className="text-red-300">{request.rejection_reason}</span>
        </div>
      )}

      {/* Actions */}
      {(request.status === "pending" || request.status === "approved") && (
        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-800">
          {request.status === "pending" && (
            <button
              onClick={handleWithdraw}
              disabled={withdraw.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white transition disabled:opacity-50"
            >
              <Undo2 className="h-3.5 w-3.5" />
              {confirming === "withdraw" ? "Confirm Withdraw?" : "Withdraw"}
            </button>
          )}
          {request.status === "approved" && (
            <button
              onClick={handleCancel}
              disabled={cancel.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10 transition disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" />
              {confirming === "cancel" ? "Confirm Cancel?" : "Cancel Leave"}
            </button>
          )}
          {confirming && (
            <button
              onClick={() => setConfirming(null)}
              className="text-xs text-slate-500 hover:text-slate-300 transition"
            >
              Never mind
            </button>
          )}
        </div>
      )}
    </div>
  );
}
