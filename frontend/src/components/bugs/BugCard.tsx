"use client";

import React from "react";
import {
  MoreVertical,
  User,
  AlertTriangle,
  AlertCircle,
  AlertOctagon,
  Info,
  Bug as BugIcon,
  CheckCircle2,
  Clock,
  XCircle,
} from "lucide-react";
import { Bug, BugStatus, BugSeverity, BugPriority } from "@/lib/api";
import { Badge } from "@/components/ui/premium-card";
import { cn } from "@/lib/utils";

const SEVERITY_CONFIG: Record<BugSeverity, { label: string; color: string; icon: React.ReactNode }> = {
  blocker: { label: "Blocker", color: "bg-red-600 text-white", icon: <AlertOctagon className="h-3 w-3" /> },
  critical: { label: "Critical", color: "bg-red-500 text-white", icon: <AlertCircle className="h-3 w-3" /> },
  major: { label: "Major", color: "bg-orange-500 text-white", icon: <AlertTriangle className="h-3 w-3" /> },
  minor: { label: "Minor", color: "bg-yellow-500 text-black", icon: <Info className="h-3 w-3" /> },
  trivial: { label: "Trivial", color: "bg-slate-500 text-white", icon: <Info className="h-3 w-3" /> },
};

const STATUS_CONFIG: Record<BugStatus, { label: string; color: string }> = {
  new: { label: "New", color: "bg-blue-500" },
  confirmed: { label: "Confirmed", color: "bg-purple-500" },
  in_progress: { label: "In Progress", color: "bg-amber-500" },
  fixed: { label: "Fixed", color: "bg-cyan-500" },
  verified: { label: "Verified", color: "bg-green-500" },
  closed: { label: "Closed", color: "bg-slate-500" },
  wont_fix: { label: "Won't Fix", color: "bg-slate-600" },
  duplicate: { label: "Duplicate", color: "bg-slate-600" },
  cannot_reproduce: { label: "Cannot Reproduce", color: "bg-slate-600" },
};

const PRIORITY_CONFIG: Record<BugPriority, { label: string; variant: "error" | "warning" | "info" | "default" }> = {
  critical: { label: "Critical", variant: "error" },
  high: { label: "High", variant: "warning" },
  medium: { label: "Medium", variant: "info" },
  low: { label: "Low", variant: "default" },
};

interface BugCardProps {
  bug: Bug;
  onClick?: (bug: Bug) => void;
  onDelete?: (bugId: string) => void;
  className?: string;
}

export function BugCard({ bug, onClick, onDelete, className }: BugCardProps) {
  const [showMenu, setShowMenu] = React.useState(false);
  const severityConfig = SEVERITY_CONFIG[bug.severity];
  const statusConfig = STATUS_CONFIG[bug.status];
  const priorityConfig = PRIORITY_CONFIG[bug.priority];

  return (
    <div
      className={cn(
        "group relative bg-slate-800/50 border border-slate-700/50 rounded-lg p-4 hover:border-slate-600/50 hover:bg-slate-800/70 transition-all cursor-pointer",
        className
      )}
      onClick={() => onClick?.(bug)}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <BugIcon className="h-4 w-4 text-red-400" />
          <span className="text-xs font-mono text-slate-400">{bug.key}</span>
          <span
            className={cn(
              "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium",
              severityConfig.color
            )}
          >
            {severityConfig.icon}
            {severityConfig.label}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <div className={cn("w-2 h-2 rounded-full", statusConfig.color)} title={statusConfig.label} />
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className="p-1 rounded hover:bg-slate-700/50 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <MoreVertical className="h-4 w-4 text-slate-400" />
          </button>
        </div>
      </div>

      {/* Title */}
      <h3 className="text-sm font-medium text-white mb-2 line-clamp-2">{bug.title}</h3>

      {/* Description preview */}
      {bug.description && (
        <p className="text-xs text-slate-400 mb-3 line-clamp-2">{bug.description}</p>
      )}

      {/* Tags */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Badge variant={priorityConfig.variant} className="text-xs">
          {priorityConfig.label}
        </Badge>
        {bug.is_regression && (
          <span className="text-xs text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">
            Regression
          </span>
        )}
        {bug.environment && (
          <span className="text-xs text-slate-400 bg-slate-700/50 px-1.5 py-0.5 rounded">
            {bug.environment}
          </span>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {bug.affected_version && (
            <span className="text-xs text-slate-500">v{bug.affected_version}</span>
          )}
          {bug.steps_to_reproduce && bug.steps_to_reproduce.length > 0 && (
            <span className="text-xs text-slate-500">
              {bug.steps_to_reproduce.length} steps
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {bug.assignee_id && (
            <div className="w-6 h-6 rounded-full bg-slate-600 flex items-center justify-center">
              <User className="h-3 w-3 text-slate-300" />
            </div>
          )}
        </div>
      </div>

      {/* Dropdown Menu */}
      {showMenu && (
        <div
          className="absolute right-2 top-10 z-10 bg-slate-800 border border-slate-700 rounded-lg shadow-lg py-1 min-w-[140px]"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-700/50 flex items-center gap-2"
            onClick={() => {
              onClick?.(bug);
              setShowMenu(false);
            }}
          >
            <BugIcon className="h-4 w-4" />
            View Details
          </button>
          {onDelete && (
            <button
              className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-slate-700/50 flex items-center gap-2"
              onClick={() => {
                onDelete(bug.id);
                setShowMenu(false);
              }}
            >
              <XCircle className="h-4 w-4" />
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}
