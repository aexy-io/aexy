"use client";

import Link from "next/link";
import {
  CheckSquare,
  ChevronRight,
  Check,
  X,
  Loader2,
} from "lucide-react";
import { usePendingApprovals, useLeaveRequestMutations } from "@/hooks/useLeave";

export function PendingLeaveApprovalsWidget() {
  const { data: approvals, isLoading } = usePendingApprovals();
  const { approve, reject } = useLeaveRequestMutations();

  if (isLoading) {
    return (
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 animate-pulse">
        <div className="h-6 w-52 bg-slate-800 rounded mb-4" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-slate-800 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const items = approvals?.slice(0, 5) || [];

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500/10 rounded-lg">
            <CheckSquare className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">
              Leave Approvals
            </h3>
            {approvals && approvals.length > 0 && (
              <span className="text-xs text-amber-400">
                {approvals.length} pending
              </span>
            )}
          </div>
        </div>
        <Link
          href="/leave?tab=approvals"
          className="text-amber-400 hover:text-amber-300 text-sm flex items-center gap-1 transition"
        >
          View all <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      <div className="p-4 space-y-3">
        {items.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-4">
            No pending approvals
          </p>
        ) : (
          items.map((request) => {
            const isApproving = approve.isPending && approve.variables === request.id;
            const isRejecting = reject.isPending && reject.variables?.requestId === request.id;

            return (
              <div
                key={request.id}
                className="p-3 bg-slate-800/50 rounded-lg border border-slate-700/50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {request.developer?.avatar_url ? (
                        <img
                          src={request.developer.avatar_url}
                          alt=""
                          className="w-6 h-6 rounded-full"
                        />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-xs text-slate-400">
                          {request.developer?.name?.[0] || "?"}
                        </div>
                      )}
                      <span className="text-sm font-medium text-white truncate">
                        {request.developer?.name || "Unknown"}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{
                          backgroundColor:
                            request.leave_type?.color || "#3b82f6",
                        }}
                      />
                      <span>{request.leave_type?.name || "Leave"}</span>
                      <span className="text-slate-600">|</span>
                      <span>
                        {new Date(request.start_date).toLocaleDateString(
                          "en-US",
                          { month: "short", day: "numeric" }
                        )}
                        {request.start_date !== request.end_date &&
                          ` - ${new Date(request.end_date).toLocaleDateString(
                            "en-US",
                            { month: "short", day: "numeric" }
                          )}`}
                      </span>
                      <span className="text-slate-600">|</span>
                      <span>{request.total_days}d</span>
                    </div>
                  </div>

                  {/* Approve / Reject actions */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => approve.mutate(request.id)}
                      disabled={isApproving || isRejecting}
                      className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition disabled:opacity-50"
                      title="Approve"
                    >
                      {isApproving ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      onClick={() =>
                        reject.mutate({ requestId: request.id })
                      }
                      disabled={isApproving || isRejecting}
                      className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition disabled:opacity-50"
                      title="Reject"
                    >
                      {isRejecting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <X className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
