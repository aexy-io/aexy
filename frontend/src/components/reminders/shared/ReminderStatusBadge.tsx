"use client";

import { Circle, Pause, Archive } from "lucide-react";
import { ReminderStatus } from "@/lib/api";
import { cn } from "@/lib/utils";
import { REMINDER_STATUS_COLORS, getStatusColor } from "@/lib/statusColors";

const STATUS_CONFIG: Record<ReminderStatus, { label: string; icon: React.ReactNode }> = {
  active: {
    label: "Active",
    icon: <Circle className="h-2.5 w-2.5 fill-current" />,
  },
  paused: {
    label: "Paused",
    icon: <Pause className="h-3 w-3" />,
  },
  archived: {
    label: "Archived",
    icon: <Archive className="h-3 w-3" />,
  },
};

interface ReminderStatusBadgeProps {
  status: ReminderStatus;
  size?: "sm" | "md" | "lg";
  showIcon?: boolean;
  className?: string;
}

export function ReminderStatusBadge({
  status,
  size = "md",
  showIcon = true,
  className,
}: ReminderStatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  const colors = getStatusColor(REMINDER_STATUS_COLORS, status);

  const sizeClasses = {
    sm: "text-xs px-2 py-0.5",
    md: "text-sm px-2.5 py-1",
    lg: "text-base px-3 py-1.5",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium",
        colors.bg,
        colors.text,
        sizeClasses[size],
        className
      )}
    >
      {showIcon && config.icon}
      {config.label}
    </span>
  );
}
