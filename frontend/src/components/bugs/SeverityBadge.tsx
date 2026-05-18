"use client";

import React from "react";
import {
  AlertTriangle,
  AlertCircle,
  AlertOctagon,
  Info,
} from "lucide-react";
import { BugSeverity } from "@/lib/api";
import { SEVERITY_COLORS } from "@/lib/statusColors";
import { cn } from "@/lib/utils";

// Derives bg/text from centralized SEVERITY_COLORS, adds label + icon
const SEVERITY_CONFIG: Record<BugSeverity, { label: string; color: string; bgColor: string; icon: React.ReactNode }> = {
  blocker: {
    label: "Blocker",
    color: SEVERITY_COLORS.blocker.text,
    bgColor: SEVERITY_COLORS.blocker.bg,
    icon: <AlertOctagon className="h-3 w-3" />,
  },
  critical: {
    label: "Critical",
    color: SEVERITY_COLORS.critical.text,
    bgColor: SEVERITY_COLORS.critical.bg,
    icon: <AlertCircle className="h-3 w-3" />,
  },
  major: {
    label: "Major",
    color: SEVERITY_COLORS.major.text,
    bgColor: SEVERITY_COLORS.major.bg,
    icon: <AlertTriangle className="h-3 w-3" />,
  },
  minor: {
    label: "Minor",
    color: SEVERITY_COLORS.minor.text,
    bgColor: SEVERITY_COLORS.minor.bg,
    icon: <Info className="h-3 w-3" />,
  },
  trivial: {
    label: "Trivial",
    color: SEVERITY_COLORS.trivial.text,
    bgColor: SEVERITY_COLORS.trivial.bg,
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
      {showIcon && React.cloneElement(
        config.icon as React.ReactElement<{ className?: string }>,
        { className: iconSizes[size] },
      )}
      {config.label}
    </span>
  );
}
