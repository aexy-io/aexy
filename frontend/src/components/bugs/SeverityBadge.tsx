"use client";

import React from "react";
import {
  AlertTriangle,
  AlertCircle,
  AlertOctagon,
  Info,
} from "lucide-react";
import { BugSeverity } from "@/lib/api";
import { cn } from "@/lib/utils";

const SEVERITY_CONFIG: Record<BugSeverity, { label: string; color: string; bgColor: string; icon: React.ReactNode }> = {
  blocker: {
    label: "Blocker",
    color: "text-white",
    bgColor: "bg-red-600",
    icon: <AlertOctagon className="h-3 w-3" />,
  },
  critical: {
    label: "Critical",
    color: "text-white",
    bgColor: "bg-red-500",
    icon: <AlertCircle className="h-3 w-3" />,
  },
  major: {
    label: "Major",
    color: "text-white",
    bgColor: "bg-orange-500",
    icon: <AlertTriangle className="h-3 w-3" />,
  },
  minor: {
    label: "Minor",
    color: "text-black",
    bgColor: "bg-yellow-500",
    icon: <Info className="h-3 w-3" />,
  },
  trivial: {
    label: "Trivial",
    color: "text-white",
    bgColor: "bg-slate-500",
    icon: <Info className="h-3 w-3" />,
  },
};

interface SeverityBadgeProps {
  severity: BugSeverity;
  showIcon?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function SeverityBadge({
  severity,
  showIcon = true,
  size = "sm",
  className,
}: SeverityBadgeProps) {
  const config = SEVERITY_CONFIG[severity];

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
