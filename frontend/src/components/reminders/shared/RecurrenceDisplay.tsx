"use client";

import { RefreshCw, Calendar, Clock } from "lucide-react";
import { ReminderFrequency } from "@/lib/api";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";

const FREQUENCY_LABELS: Record<ReminderFrequency, string> = {
  once: "One-time",
  daily: "Daily",
  weekly: "Weekly",
  biweekly: "Bi-weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
  custom: "Custom",
};

interface RecurrenceDisplayProps {
  frequency: ReminderFrequency;
  cronExpression?: string;
  nextOccurrence?: string;
  timezone?: string;
  showIcon?: boolean;
  showNextOccurrence?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function RecurrenceDisplay({
  frequency,
  cronExpression,
  nextOccurrence,
  timezone,
  showIcon = true,
  showNextOccurrence = false,
  size = "sm",
  className,
}: RecurrenceDisplayProps) {
  const sizeClasses = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base",
  };

  const iconSizes = {
    sm: "h-3 w-3",
    md: "h-4 w-4",
    lg: "h-5 w-5",
  };

  const frequencyLabel = FREQUENCY_LABELS[frequency];
  const isCustom = frequency === "custom" && cronExpression;

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className={cn("flex items-center gap-1.5 text-foreground", sizeClasses[size])}>
        {showIcon && <RefreshCw className={cn(iconSizes[size], "text-muted-foreground")} />}
        <span>{frequencyLabel}</span>
        {isCustom && (
          <span className="text-muted-foreground font-mono">({cronExpression})</span>
        )}
        {timezone && (
          <span className="text-muted-foreground">({timezone})</span>
        )}
      </div>
      {showNextOccurrence && nextOccurrence && (
        <div className={cn("flex items-center gap-1.5 text-muted-foreground", sizeClasses[size])}>
          <Calendar className={cn(iconSizes[size], "text-muted-foreground")} />
          <span>Next: {format(parseISO(nextOccurrence), "MMM d, yyyy 'at' h:mm a")}</span>
        </div>
      )}
    </div>
  );
}

interface FrequencyBadgeProps {
  frequency: ReminderFrequency;
  size?: "sm" | "md";
  className?: string;
}

export function FrequencyBadge({
  frequency,
  size = "sm",
  className,
}: FrequencyBadgeProps) {
  const sizeClasses = {
    sm: "text-xs px-2 py-0.5",
    md: "text-sm px-2.5 py-1",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md font-medium bg-accent/50 text-foreground border border-border/50",
        sizeClasses[size],
        className
      )}
    >
      <RefreshCw className="h-3 w-3" />
      {FREQUENCY_LABELS[frequency]}
    </span>
  );
}
