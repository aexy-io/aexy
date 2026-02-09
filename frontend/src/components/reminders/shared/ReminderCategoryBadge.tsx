"use client";

import {
  ShieldCheck,
  FileSearch,
  ClipboardCheck,
  Lock,
  GraduationCap,
  Wrench,
  FileBarChart,
  Settings,
} from "lucide-react";
import { ReminderCategory } from "@/lib/api";
import { cn } from "@/lib/utils";
import React from "react";

const CATEGORY_CONFIG: Record<ReminderCategory, { label: string; className: string; icon: React.ReactNode }> = {
  compliance: {
    label: "Compliance",
    className: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    icon: <ShieldCheck className="h-3.5 w-3.5" />,
  },
  review: {
    label: "Review",
    className: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    icon: <FileSearch className="h-3.5 w-3.5" />,
  },
  audit: {
    label: "Audit",
    className: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
    icon: <ClipboardCheck className="h-3.5 w-3.5" />,
  },
  security: {
    label: "Security",
    className: "bg-red-500/20 text-red-400 border-red-500/30",
    icon: <Lock className="h-3.5 w-3.5" />,
  },
  training: {
    label: "Training",
    className: "bg-green-500/20 text-green-400 border-green-500/30",
    icon: <GraduationCap className="h-3.5 w-3.5" />,
  },
  maintenance: {
    label: "Maintenance",
    className: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    icon: <Wrench className="h-3.5 w-3.5" />,
  },
  reporting: {
    label: "Reporting",
    className: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
    icon: <FileBarChart className="h-3.5 w-3.5" />,
  },
  custom: {
    label: "Custom",
    className: "bg-slate-500/20 text-slate-400 border-slate-500/30",
    icon: <Settings className="h-3.5 w-3.5" />,
  },
};

interface ReminderCategoryBadgeProps {
  category: ReminderCategory;
  size?: "sm" | "md" | "lg";
  showIcon?: boolean;
  className?: string;
}

export function ReminderCategoryBadge({
  category,
  size = "sm",
  showIcon = true,
  className,
}: ReminderCategoryBadgeProps) {
  const config = CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG.custom;

  const sizeClasses = {
    sm: "px-2 py-0.5 text-xs",
    md: "px-2.5 py-1 text-sm",
    lg: "px-3 py-1.5 text-base",
  };

  const iconSizes = {
    sm: "h-3 w-3",
    md: "h-3.5 w-3.5",
    lg: "h-4 w-4",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-medium rounded-md border",
        config.className,
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
