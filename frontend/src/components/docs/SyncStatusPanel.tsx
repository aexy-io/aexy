"use client";

import { useState } from "react";
import {
  RefreshCw,
  Clock,
  Zap,
  Calendar,
  Hand,
  CheckCircle,
  AlertCircle,
  Loader2,
  Settings,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SyncStatusPanelProps {
  workspaceId: string;
  documentId?: string;
  syncType: "real_time" | "daily_batch" | "manual";
  pendingChanges: number;
  lastSyncedAt?: string;
  isProcessing?: boolean;
  onManualSync?: () => Promise<void>;
}

const syncTypeConfig = {
  real_time: {
    icon: Zap,
    label: "Real-time Sync",
    description: "Documentation updates automatically when code changes",
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-50 dark:bg-green-900/20",
    borderColor: "border-green-800/50",
  },
  daily_batch: {
    icon: Calendar,
    label: "Daily Sync",
    description: "Documentation syncs once per day with code changes",
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-50 dark:bg-blue-900/20",
    borderColor: "border-blue-800/50",
  },
  manual: {
    icon: Hand,
    label: "Manual Sync",
    description: "Click to sync documentation with code changes",
    color: "text-muted-foreground",
    bgColor: "bg-muted/50",
    borderColor: "border-border",
  },
};

export function SyncStatusPanel({
  workspaceId,
  documentId,
  syncType,
  pendingChanges,
  lastSyncedAt,
  isProcessing = false,
  onManualSync,
}: SyncStatusPanelProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const config = syncTypeConfig[syncType];
  const Icon = config.icon;

  const handleSync = async () => {
    if (!onManualSync || isSyncing) return;

    setIsSyncing(true);
    try {
      await onManualSync();
    } finally {
      setIsSyncing(false);
    }
  };

  const formatLastSync = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        config.bgColor,
        config.borderColor
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className={cn("h-4 w-4", config.color)} />
          <span className="text-sm font-medium text-foreground">{config.label}</span>
        </div>
        {syncType !== "real_time" && onManualSync && (
          <button
            onClick={handleSync}
            disabled={isSyncing || isProcessing}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-foreground bg-primary-600 hover:bg-primary-500 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSyncing || isProcessing ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <RefreshCw className="h-3.5 w-3.5" />
                Sync Now
              </>
            )}
          </button>
        )}
      </div>

      {/* Description */}
      <p className="text-xs text-muted-foreground mb-3">{config.description}</p>

      {/* Status */}
      <div className="flex items-center gap-4 text-xs">
        {/* Last Synced */}
        <div className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">
            {lastSyncedAt ? (
              <>Last synced {formatLastSync(lastSyncedAt)}</>
            ) : (
              <>Never synced</>
            )}
          </span>
        </div>

        {/* Pending Changes */}
        {pendingChanges > 0 && (
          <div className="flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-amber-400">
              {pendingChanges} pending change{pendingChanges > 1 ? "s" : ""}
            </span>
          </div>
        )}

        {/* All Synced */}
        {pendingChanges === 0 && lastSyncedAt && (
          <div className="flex items-center gap-1.5">
            <CheckCircle className="h-3.5 w-3.5 text-green-400" />
            <span className="text-green-400">Up to date</span>
          </div>
        )}
      </div>

      {/* Upgrade Hint for Manual Sync */}
      {syncType === "manual" && pendingChanges > 0 && (
        <div className="mt-3 flex items-start gap-2 p-2 bg-muted/50 rounded-lg">
          <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            Upgrade to Pro for daily automatic syncing, or Premium for
            real-time sync when code changes.
          </p>
        </div>
      )}
    </div>
  );
}

// Compact version for the document editor sidebar
export function SyncStatusBadge({
  syncType,
  pendingChanges,
  isProcessing,
}: {
  syncType: "real_time" | "daily_batch" | "manual";
  pendingChanges: number;
  isProcessing?: boolean;
}) {
  const config = syncTypeConfig[syncType];
  const Icon = config.icon;

  if (isProcessing) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 rounded-lg text-xs">
        <Loader2 className="h-3 w-3 animate-spin" />
        Syncing
      </div>
    );
  }

  if (pendingChanges > 0) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400 rounded-lg text-xs">
        <AlertCircle className="h-3 w-3" />
        {pendingChanges} pending
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs",
        config.bgColor,
        config.color
      )}
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </div>
  );
}
