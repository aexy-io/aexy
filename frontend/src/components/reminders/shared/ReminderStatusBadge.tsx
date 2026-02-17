"use client";

import { Circle, Pause, Archive } from "lucide-react";
import { ReminderStatus } from "@/lib/api";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<ReminderStatus, { label: string; className: string; icon: React.ReactNode }> = {
  active: {
    label: "Active",
    className: "bg-green-500/20 text-green-400",
    icon: <Circle className="h-2.5 w-2.5 fill-current" />,
  },
  paused: {
    label: "Paused",
    className: "bg-amber-500/20 text-amber-400",
    icon: <Pause className="h-3 w-3" />,
  },
  archived: {
    label: "Archived",
    className: "bg-muted-foreground/20 text-muted-foreground",
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

  const sizeClasses = {
    sm: "text-xs px-2 py-0.5",
    md: "text-sm px-2.5 py-1",
    lg: "text-base px-3 py-1.5",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium",
        config.className,
        sizeClasses[size],
        className
      )}
    >
      {showIcon && config.icon}
      {config.label}
    </span>
  );
}
