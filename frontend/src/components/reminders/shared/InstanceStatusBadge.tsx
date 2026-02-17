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

const STATUS_CONFIG: Record<ReminderInstanceStatus, { label: string; className: string; icon: React.ReactNode }> = {
  pending: {
    label: "Pending",
    className: "bg-muted-foreground/20 text-muted-foreground",
    icon: <Clock className="h-3 w-3" />,
  },
  notified: {
    label: "Notified",
    className: "bg-blue-500/20 text-blue-400",
    icon: <Bell className="h-3 w-3" />,
  },
  acknowledged: {
    label: "Acknowledged",
    className: "bg-purple-500/20 text-purple-400",
    icon: <CheckCircle className="h-3 w-3" />,
  },
  completed: {
    label: "Completed",
    className: "bg-green-500/20 text-green-400",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  skipped: {
    label: "Skipped",
    className: "bg-amber-500/20 text-amber-400",
    icon: <SkipForward className="h-3 w-3" />,
  },
  escalated: {
    label: "Escalated",
    className: "bg-orange-500/20 text-orange-400",
    icon: <AlertTriangle className="h-3 w-3" />,
  },
  overdue: {
    label: "Overdue",
    className: "bg-red-500/20 text-red-400",
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
