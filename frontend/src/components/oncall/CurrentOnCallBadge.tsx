"use client";

import { Phone, Clock, User } from "lucide-react";
import { OnCallSchedule } from "@/lib/api";

interface CurrentOnCallBadgeProps {
  currentSchedule: OnCallSchedule | null;
  nextSchedule?: OnCallSchedule | null;
  isActive: boolean;
  compact?: boolean;
}

export default function CurrentOnCallBadge({
  currentSchedule,
  nextSchedule,
  isActive,
  compact = false,
}: CurrentOnCallBadgeProps) {
  if (!isActive || !currentSchedule) {
    if (nextSchedule) {
      return (
        <div className={`flex items-center gap-2 ${compact ? "text-xs" : "text-sm"}`}>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className={compact ? "h-3 w-3" : "h-4 w-4"} />
            <span>Next on-call:</span>
          </div>
          <span className="text-foreground font-medium">
            {nextSchedule.developer?.name || nextSchedule.developer?.email || "Unknown"}
          </span>
          <span className="text-muted-foreground">
            ({new Date(nextSchedule.start_time).toLocaleDateString()})
          </span>
        </div>
      );
    }

    return (
      <div className={`flex items-center gap-2 text-muted-foreground ${compact ? "text-xs" : "text-sm"}`}>
        <Phone className={compact ? "h-3 w-3" : "h-4 w-4"} />
        <span>No one on-call</span>
      </div>
    );
  }

  const endTime = new Date(currentSchedule.end_time);
  const now = new Date();
  const hoursRemaining = Math.max(0, Math.round((endTime.getTime() - now.getTime()) / (1000 * 60 * 60)));

  return (
    <div className={`flex items-center gap-3 ${compact ? "" : "p-3 bg-green-900/20 rounded-lg border border-green-800/50"}`}>
      <div className={`${compact ? "hidden" : "flex"} items-center justify-center w-10 h-10 bg-green-600 rounded-full`}>
        <Phone className="h-5 w-5 text-foreground" />
      </div>
      <div className={compact ? "flex items-center gap-2" : ""}>
        <div className="flex items-center gap-2">
          {compact && <Phone className="h-3.5 w-3.5 text-green-400" />}
          <span className={`font-medium text-foreground ${compact ? "text-xs" : ""}`}>
            {currentSchedule.developer?.name || currentSchedule.developer?.email || "Unknown"}
          </span>
          <span className={`px-1.5 py-0.5 bg-green-600/30 text-green-400 rounded text-xs`}>
            On-Call
          </span>
        </div>
        {!compact && (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-0.5">
            <Clock className="h-3.5 w-3.5" />
            <span>
              {hoursRemaining > 0 ? `${hoursRemaining}h remaining` : "Ending soon"}
            </span>
          </div>
        )}
      </div>
      {currentSchedule.is_override && !compact && (
        <div className="ml-auto text-xs text-amber-400">Override</div>
      )}
    </div>
  );
}
