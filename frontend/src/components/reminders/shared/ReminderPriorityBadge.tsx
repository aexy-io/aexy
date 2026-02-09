"use client";

import { AlertTriangle, AlertCircle, AlertOctagon, Info } from "lucide-react";
import { ReminderPriority } from "@/lib/api";
import { cn } from "@/lib/utils";
import React from "react";

const PRIORITY_CONFIG: Record<ReminderPriority, { label: string; color: string; bgColor: string; icon: React.ReactNode }> = {
  critical: {
    label: "Critical",
    color: "text-white",
    bgColor: "bg-red-600",
    icon: <AlertOctagon className="h-3 w-3" />,
  },
  high: {
    label: "High",
    color: "text-white",
    bgColor: "bg-orange-500",
    icon: <AlertCircle className="h-3 w-3" />,
  },
  medium: {
    label: "Medium",
    color: "text-white",
    bgColor: "bg-amber-500",
    icon: <AlertTriangle className="h-3 w-3" />,
  },
  low: {
    label: "Low",
    color: "text-white",
    bgColor: "bg-slate-500",
    icon: <Info className="h-3 w-3" />,
  },
};

interface ReminderPriorityBadgeProps {
  priority: ReminderPriority;
  size?: "sm" | "md" | "lg";
  showIcon?: boolean;
  className?: string;
}

export function ReminderPriorityBadge({
  priority,
  size = "sm",
  showIcon = true,
  className,
}: ReminderPriorityBadgeProps) {
  const config = PRIORITY_CONFIG[priority];

  const sizeClasses = {
    sm: "px-1.5 py-0.5 text-xs",
    md: "px-2 py-1 text-sm",
    lg: "px-3 py-1.5 text-base",
  };

  const iconSizes = {
    sm: "h-3 w-3",
    md: "h-4 w-4",
    lg: "h-5 w-5",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-medium rounded",
        config.bgColor,
        config.color,
        sizeClasses[size],
        className
      )}
    >
      {showIcon && React.cloneElement(config.icon as React.ReactElement, {
        className: iconSizes[size],
      })}
      {config.label}
    </span>
  );
}
