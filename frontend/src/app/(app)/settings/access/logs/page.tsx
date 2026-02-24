"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  FileText,
  AlertCircle,
  Crown,
  Filter,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useSubscription } from "@/hooks/useSubscription";
import { useAppAccessLogs, useAppAccessLogsSummary } from "@/hooks/useAppAccess";
import { AppAccessLog } from "@/lib/api";
import { DataTable, DataTableColumn } from "@/components/ui/data-table";
import { formatDistanceToNow } from "date-fns";

const ACTION_LABELS: Record<string, string> = {
  template_created: "Template Created",
  template_updated: "Template Updated",
  template_deleted: "Template Deleted",
  access_updated: "Access Updated",
  template_applied: "Template Applied",
  access_reset: "Access Reset",
  bulk_template_applied: "Bulk Template Applied",
  app_access_granted: "App Access Granted",
  app_access_revoked: "App Access Revoked",
  module_access_granted: "Module Access Granted",
  module_access_revoked: "Module Access Revoked",
  access_denied: "Access Denied",
};

const ACTION_COLORS: Record<string, string> = {
  template_created: "bg-green-500/20 text-green-400",
  template_updated: "bg-blue-500/20 text-blue-400",
  template_deleted: "bg-red-500/20 text-red-400",
  access_updated: "bg-violet-500/20 text-violet-400",
  template_applied: "bg-cyan-500/20 text-cyan-400",
  access_reset: "bg-amber-500/20 text-amber-400",
  bulk_template_applied: "bg-purple-500/20 text-purple-400",
  app_access_granted: "bg-green-500/20 text-green-400",
  app_access_revoked: "bg-red-500/20 text-red-400",
  module_access_granted: "bg-green-500/20 text-green-400",
  module_access_revoked: "bg-red-500/20 text-red-400",
  access_denied: "bg-red-500/20 text-red-400 border border-red-500/30",
};

export default function AccessLogsPage() {
  const { currentWorkspaceId } = useWorkspace();
  const workspaceId = currentWorkspaceId || "";
  const { isEnterprise, isLoading: subscriptionLoading } = useSubscription(currentWorkspaceId);

  const [page, setPage] = useState(0);
  const [actionFilter, setActionFilter] = useState<string>("");
  const pageSize = 20;

  const { logs, total, isLoading, error, refetch } = useAppAccessLogs(workspaceId, {
    action: actionFilter || undefined,
    limit: pageSize,
    offset: page * pageSize,
  });

  const { summary, isLoading: summaryLoading } = useAppAccessLogsSummary(workspaceId, 30);

  const totalPages = Math.ceil(total / pageSize);

  const logColumns = useMemo<DataTableColumn<AppAccessLog>[]>(() => [
    {
      id: "action",
      header: "Action",
      cell: (log) => (
        <span
          className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
            ACTION_COLORS[log.action] || "bg-muted text-foreground"
          }`}
        >
          {ACTION_LABELS[log.action] || log.action}
        </span>
      ),
      sortable: false,
    },
    {
      id: "target",
      header: "Target",
      cell: (log) => (
        <div className="text-sm">
          <span className="text-foreground">{log.target_type}</span>
          {log.target_id && (
            <span className="text-muted-foreground ml-1">
              #{log.target_id.slice(0, 8)}
            </span>
          )}
        </div>
      ),
      sortable: false,
    },
    {
      id: "description",
      header: "Description",
      cell: (log) => (
        <div>
          <p className="text-sm text-foreground truncate max-w-[300px]">
            {log.description || "-"}
          </p>
          {log.extra_data && Object.keys(log.extra_data).length > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {Object.entries(log.extra_data)
                .slice(0, 2)
                .map(([k, v]) => `${k}: ${v}`)
                .join(", ")}
            </p>
          )}
        </div>
      ),
      sortable: false,
    },
    {
      id: "time",
      header: "Time",
      cell: (log) => (
        <span className="text-muted-foreground">
          {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
        </span>
      ),
      sortable: false,
    },
  ], []);

  if (subscriptionLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div>
          <div className="h-6 w-32 bg-accent rounded mb-2" />
          <div className="h-4 w-64 bg-accent rounded" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 bg-accent rounded-xl" />
          ))}
        </div>
        <div className="bg-card border border-border rounded-lg">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-4 p-4 border-b border-border/50">
              <div className="h-6 w-28 bg-accent rounded-full" />
              <div className="h-4 w-32 bg-accent rounded" />
              <div className="h-3 w-24 bg-accent rounded ml-auto" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!isEnterprise) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Access Logs</h1>
          <p className="text-muted-foreground text-sm mt-1">
            View audit trail of access control changes
          </p>
        </div>

        <div className="text-center py-16">
          <div className="mx-auto w-20 h-20 rounded-full bg-amber-500/10 flex items-center justify-center mb-6">
            <Crown className="h-10 w-10 text-amber-400" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Enterprise Feature</h2>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            Access logs are available on the Enterprise plan. Upgrade to track
            all access control changes and security events.
          </p>
          <Link href="/settings/plans">
            <Button>View Plans</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Access Logs</h1>
          <p className="text-muted-foreground text-sm mt-1">
            View audit trail of access control changes
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div>
        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-card border border-border rounded-lg p-4">
              <p className="text-sm text-muted-foreground">Total Events (30 days)</p>
              <p className="text-2xl font-bold text-foreground">
                {summary.total_events.toLocaleString()}
              </p>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <p className="text-sm text-muted-foreground">Access Updates</p>
              <p className="text-2xl font-bold text-violet-400">
                {(
                  (summary.action_counts["access_updated"] || 0) +
                  (summary.action_counts["template_applied"] || 0)
                ).toLocaleString()}
              </p>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <p className="text-sm text-muted-foreground">Template Changes</p>
              <p className="text-2xl font-bold text-blue-400">
                {(
                  (summary.action_counts["template_created"] || 0) +
                  (summary.action_counts["template_updated"] || 0) +
                  (summary.action_counts["template_deleted"] || 0)
                ).toLocaleString()}
              </p>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <p className="text-sm text-muted-foreground">Access Denials</p>
              <p className="text-2xl font-bold text-red-400">
                {(summary.action_counts["access_denied"] || 0).toLocaleString()}
              </p>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <select
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
                setPage(0);
              }}
              className="rounded-md border border-border bg-muted px-3 py-1.5 text-sm text-foreground"
            >
              <option value="">All Actions</option>
              {Object.entries(ACTION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1" />

          <p className="text-sm text-muted-foreground">
            {total.toLocaleString()} total events
          </p>
        </div>

        {/* Logs Table */}
        {error ? (
          <div className="text-center py-20">
            <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-2" />
            <p className="text-red-400">Failed to load access logs</p>
          </div>
        ) : (
          <DataTable<AppAccessLog>
            columns={logColumns}
            data={logs}
            rowKey={(log) => log.id}
            isLoading={isLoading}
            emptyIcon={<FileText className="h-8 w-8" />}
            emptyTitle="No access logs found"
            emptyDescription="Logs will appear here when access control changes are made"
            currentPage={page + 1}
            totalPages={totalPages}
            totalItems={total}
            onPageChange={(p) => setPage(p - 1)}
          />
        )}
      </div>
    </div>
  );
}
