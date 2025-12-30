"use client";

import { Flame, AlertTriangle, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { StreakInfo } from "@/lib/api";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface StreakIndicatorProps {
  streak: StreakInfo;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: {
    container: "gap-1",
    icon: "h-4 w-4",
    text: "text-sm",
    badge: "text-xs px-1.5 py-0.5",
  },
  md: {
    container: "gap-2",
    icon: "h-5 w-5",
    text: "text-base",
    badge: "text-xs px-2 py-0.5",
  },
  lg: {
    container: "gap-2",
    icon: "h-6 w-6",
    text: "text-lg",
    badge: "text-sm px-2 py-1",
  },
};

export function StreakIndicator({
  streak,
  size = "md",
  showLabel = true,
  className,
}: StreakIndicatorProps) {
  const classes = sizeClasses[size];

  // Determine streak state
  const isActive = streak.current_streak > 0;
  const isAtRisk = streak.streak_at_risk;
  const isActiveToday = streak.is_active_today;

  // Get color based on streak length
  const getStreakColor = () => {
    if (!isActive) return "text-gray-400";
    if (isAtRisk) return "text-amber-500";
    if (streak.current_streak >= 30) return "text-red-500";
    if (streak.current_streak >= 7) return "text-orange-500";
    return "text-amber-500";
  };

  // Get flame animation class
  const getFlameAnimation = () => {
    if (!isActive) return "";
    if (streak.current_streak >= 30) return "animate-pulse";
    return "";
  };

  const tooltipContent = isActive ? (
    <div className="space-y-1 text-sm">
      <div className="font-medium">
        {streak.current_streak} day streak!
      </div>
      {isActiveToday ? (
        <div className="flex items-center gap-1 text-green-400">
          <Check className="h-3 w-3" />
          Active today
        </div>
      ) : isAtRisk ? (
        <div className="flex items-center gap-1 text-amber-400">
          <AlertTriangle className="h-3 w-3" />
          Complete an activity to keep your streak!
        </div>
      ) : null}
      <div className="text-gray-400">
        Longest: {streak.longest_streak} days
      </div>
    </div>
  ) : (
    <div className="text-sm">
      Start learning to begin your streak!
    </div>
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "inline-flex items-center",
              classes.container,
              className
            )}
          >
            <div className={cn("relative", getStreakColor(), getFlameAnimation())}>
              <Flame className={classes.icon} />
              {isAtRisk && (
                <span className="absolute -top-1 -right-1 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                </span>
              )}
            </div>

            {showLabel && (
              <span className={cn("font-semibold", classes.text, getStreakColor())}>
                {streak.current_streak}
              </span>
            )}

            {isActiveToday && isActive && (
              <span className={cn(
                "rounded-full bg-green-100 text-green-700",
                classes.badge
              )}>
                <Check className="h-3 w-3 inline" />
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>{tooltipContent}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Compact streak badge for use in headers
interface StreakBadgeProps {
  streak: number;
  className?: string;
}

export function StreakBadge({ streak, className }: StreakBadgeProps) {
  if (streak === 0) return null;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 px-2 py-1 rounded-full",
        streak >= 30
          ? "bg-red-100 text-red-600"
          : streak >= 7
          ? "bg-orange-100 text-orange-600"
          : "bg-amber-100 text-amber-600",
        className
      )}
    >
      <Flame className="h-3.5 w-3.5" />
      <span className="text-sm font-medium">{streak}</span>
    </div>
  );
}
