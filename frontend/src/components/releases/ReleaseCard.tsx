"use client";

import React from "react";
import {
  MoreVertical,
  Package,
  Calendar,
  User,
  CheckCircle2,
  Circle,
  AlertTriangle,
  Lock,
  Rocket,
  XCircle,
} from "lucide-react";
import { Release, ReleaseStatus, ReleaseRiskLevel } from "@/lib/api";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<ReleaseStatus, { label: string; color: string; bgColor: string; icon: React.ReactNode }> = {
  planning: { label: "Planning", color: "text-muted-foreground", bgColor: "bg-muted-foreground", icon: <Circle className="h-3 w-3" /> },
  in_progress: { label: "In Progress", color: "text-blue-400", bgColor: "bg-blue-500", icon: <Circle className="h-3 w-3" /> },
  code_freeze: { label: "Code Freeze", color: "text-cyan-400", bgColor: "bg-cyan-500", icon: <Lock className="h-3 w-3" /> },
  testing: { label: "Testing", color: "text-purple-400", bgColor: "bg-purple-500", icon: <Circle className="h-3 w-3" /> },
  released: { label: "Released", color: "text-green-400", bgColor: "bg-green-500", icon: <Rocket className="h-3 w-3" /> },
  cancelled: { label: "Cancelled", color: "text-muted-foreground", bgColor: "bg-muted", icon: <XCircle className="h-3 w-3" /> },
};

const RISK_CONFIG: Record<ReleaseRiskLevel, { label: string; color: string }> = {
  low: { label: "Low Risk", color: "text-green-400" },
  medium: { label: "Medium Risk", color: "text-amber-400" },
  high: { label: "High Risk", color: "text-orange-400" },
  critical: { label: "Critical Risk", color: "text-red-400" },
};

interface ReleaseCardProps {
  release: Release;
  onClick?: (release: Release) => void;
  onDelete?: (releaseId: string) => void;
  className?: string;
}

export function ReleaseCard({ release, onClick, onDelete, className }: ReleaseCardProps) {
  const [showMenu, setShowMenu] = React.useState(false);
  const statusConfig = STATUS_CONFIG[release.status];
  const riskConfig = RISK_CONFIG[release.risk_level];

  const completedItems = release.readiness_checklist.filter((item) => item.completed).length;
  const totalItems = release.readiness_checklist.length;
  const readinessPercentage = totalItems > 0 ? (completedItems / totalItems) * 100 : 0;

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getDaysUntilRelease = () => {
    if (!release.target_date) return null;
    const target = new Date(release.target_date);
    const now = new Date();
    const diffTime = target.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const daysUntil = getDaysUntilRelease();

  return (
    <div
      className={cn(
        "group relative bg-muted/50 border border-border/50 rounded-lg p-4 hover:border-border/50 hover:bg-muted/70 transition-all cursor-pointer",
        className
      )}
      onClick={() => onClick?.(release)}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-muted-foreground" />
          <span
            className={cn(
              "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium text-foreground",
              statusConfig.bgColor
            )}
          >
            {statusConfig.icon}
            {statusConfig.label}
          </span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
          className="p-1 rounded hover:bg-accent/50 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <MoreVertical className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {/* Title and Version */}
      <div className="mb-2">
        <h3 className="text-sm font-medium text-foreground">{release.name}</h3>
        {release.version && (
          <span className="text-xs font-mono text-muted-foreground">v{release.version}</span>
        )}
      </div>

      {/* Description */}
      {release.description && (
        <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{release.description}</p>
      )}

      {/* Target Date */}
      {release.target_date && (
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            Target: {formatDate(release.target_date)}
          </span>
          {daysUntil !== null && release.status !== "released" && (
            <span
              className={cn(
                "text-xs px-1.5 py-0.5 rounded",
                daysUntil < 0
                  ? "bg-red-500/20 text-red-400"
                  : daysUntil <= 7
                  ? "bg-amber-500/20 text-amber-400"
                  : "bg-accent text-muted-foreground"
              )}
            >
              {daysUntil < 0
                ? `${Math.abs(daysUntil)} days overdue`
                : daysUntil === 0
                ? "Today"
                : `${daysUntil} days left`}
            </span>
          )}
        </div>
      )}

      {/* Risk Level */}
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className={cn("h-4 w-4", riskConfig.color)} />
        <span className={cn("text-xs", riskConfig.color)}>{riskConfig.label}</span>
      </div>

      {/* Readiness Progress */}
      {totalItems > 0 && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>Readiness Checklist</span>
            <span>
              {completedItems}/{totalItems}
            </span>
          </div>
          <div className="h-1.5 bg-accent rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full transition-all duration-300",
                readinessPercentage === 100 ? "bg-green-500" : "bg-blue-500"
              )}
              style={{ width: `${readinessPercentage}%` }}
            />
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-border/50">
        <div className="text-xs text-muted-foreground">
          {release.actual_release_date
            ? `Released: ${formatDate(release.actual_release_date)}`
            : release.status === "released"
            ? "Released"
            : "Not released yet"}
        </div>
        {release.owner_id && (
          <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center">
            <User className="h-3 w-3 text-foreground" />
          </div>
        )}
      </div>

      {/* Dropdown Menu */}
      {showMenu && (
        <div
          className="absolute right-2 top-10 z-10 bg-muted border border-border rounded-lg shadow-lg py-1 min-w-[140px]"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-accent/50 flex items-center gap-2"
            onClick={() => {
              onClick?.(release);
              setShowMenu(false);
            }}
          >
            <Package className="h-4 w-4" />
            View Details
          </button>
          {onDelete && (
            <button
              className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-accent/50 flex items-center gap-2"
              onClick={() => {
                onDelete(release.id);
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
