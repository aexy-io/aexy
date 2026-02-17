"use client";

import { Check, X, MessageSquare, ArrowRightLeft, Clock } from "lucide-react";
import { SwapRequest } from "@/lib/api";

interface SwapRequestsListProps {
  swapRequests: SwapRequest[];
  currentUserId: string;
  onAccept: (swapId: string) => Promise<void>;
  onDecline: (swapId: string, message?: string) => Promise<void>;
  isAccepting: boolean;
  isDeclining: boolean;
}

export default function SwapRequestsList({
  swapRequests,
  currentUserId,
  onAccept,
  onDecline,
  isAccepting,
  isDeclining,
}: SwapRequestsListProps) {
  const pendingRequests = swapRequests.filter((r) => r.status === "pending");

  if (pendingRequests.length === 0) {
    return (
      <div className="bg-muted rounded-xl p-6 text-center">
        <ArrowRightLeft className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-muted-foreground">No pending swap requests</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {pendingRequests.map((request) => {
        const isTarget = request.target_id === currentUserId;
        const scheduleDate = request.schedule
          ? new Date(request.schedule.start_time).toLocaleDateString()
          : "Unknown date";

        return (
          <div
            key={request.id}
            className="bg-muted rounded-xl p-4 border border-border"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <ArrowRightLeft className="h-4 w-4 text-blue-400" />
                  <span className="font-medium text-foreground">
                    {isTarget ? "Swap Request Received" : "Swap Request Sent"}
                  </span>
                  <span className="px-2 py-0.5 bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400 rounded text-xs">
                    Pending
                  </span>
                </div>

                <div className="text-sm text-muted-foreground mb-2">
                  <span className="text-foreground font-medium">
                    {request.requester?.name || request.requester?.email}
                  </span>
                  {" wants to swap with "}
                  <span className="text-foreground font-medium">
                    {request.target?.name || request.target?.email}
                  </span>
                </div>

                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    <span>Shift: {scheduleDate}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    <span>Requested: {new Date(request.created_at).toLocaleDateString()}</span>
                  </div>
                </div>

                {request.message && (
                  <div className="mt-3 flex items-start gap-2 p-2 bg-accent/50 rounded">
                    <MessageSquare className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-foreground">{request.message}</p>
                  </div>
                )}
              </div>

              {isTarget && (
                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => onAccept(request.id)}
                    disabled={isAccepting}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-sm disabled:opacity-50"
                  >
                    <Check className="h-4 w-4" />
                    Accept
                  </button>
                  <button
                    onClick={() => onDecline(request.id)}
                    disabled={isDeclining}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30 transition text-sm disabled:opacity-50"
                  >
                    <X className="h-4 w-4" />
                    Decline
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
