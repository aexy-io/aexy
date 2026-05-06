"use client";

import { HardDrive } from "lucide-react";

import { cn } from "@/lib/utils";
import { useDriveUsage } from "@/hooks/useDrive";
import { useWorkspace } from "@/hooks/useWorkspace";

import { formatBytes } from "@/components/drive/QuotaBanner";

export function StorageUsageCard() {
  const { currentWorkspaceId } = useWorkspace();
  const usage = useDriveUsage(currentWorkspaceId).data;

  if (!usage) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        Loading storage usage…
      </div>
    );
  }

  const pct = Math.min(100, usage.percent_used);
  const barColor =
    pct >= 100
      ? "bg-red-500"
      : pct >= 80
        ? "bg-amber-500"
        : "bg-primary-500";

  return (
    <div
      data-testid="storage-usage-card"
      className="rounded-lg border border-border bg-muted/30 p-4"
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-muted-foreground" />
          <h4 className="text-sm font-medium text-foreground">Storage</h4>
        </div>
        <span className="text-xs text-muted-foreground">
          {usage.files_count} files
        </span>
      </div>
      <p className="text-2xl font-semibold text-foreground">
        {formatBytes(usage.used_bytes)}
        {!usage.unlimited && (
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            of {formatBytes(usage.limit_bytes)}
          </span>
        )}
      </p>
      {!usage.unlimited && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-muted">
          <div
            className={cn("h-full transition-all", barColor)}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      {usage.unlimited && (
        <p className="mt-1 text-xs text-emerald-300">
          Unlimited on your current plan.
        </p>
      )}
    </div>
  );
}
