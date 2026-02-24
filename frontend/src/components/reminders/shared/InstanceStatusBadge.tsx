"use client";

import {
  Clock,
  Bell,
  CheckCircle,
  CheckCircle2,
  SkipForward,
  AlertTriangle,
  AlertOctagon,
} from "lucide-react";
import { ReminderInstanceStatus } from "@/lib/api";
import { cn } from "@/lib/utils";
import { REMINDER_INSTANCE_COLORS, getStatusColor } from "@/lib/statusColors";

const STATUS_CONFIG: Record<ReminderInstanceStatus, { label: string; icon: React.ReactNode }> = {
  pending: {
    label: "Pending",
    icon: <Clock className="h-3 w-3" />,
  },
  notified: {
    label: "Notified",
    icon: <Bell className="h-3 w-3" />,
  },
  acknowledged: {
    label: "Acknowledged",
    icon: <CheckCircle className="h-3 w-3" />,
  },
  completed: {
    label: "Completed",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  skipped: {
    label: "Skipped",
    icon: <SkipForward className="h-3 w-3" />,
  },
  escalated: {
    label: "Escalated",
    icon: <AlertTriangle className="h-3 w-3" />,
  },
  overdue: {
    label: "Overdue",
    icon: <AlertOctagon className="h-3 w-3" />,
  },
};

interface InstanceStatusBadgeProps {
  status: ReminderInstanceStatus;
  size?: "sm" | "md" | "lg";
  showIcon?: boolean;
  className?: string;
}

export function InstanceStatusBadge({
  status,
  size = "sm",
  showIcon = true,
  className,
}: InstanceStatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  const colors = getStatusColor(REMINDER_INSTANCE_COLORS, status);

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
