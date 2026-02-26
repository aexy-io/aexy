"use client";

import { useState } from "react";
// Force dev server recompile
import { History, ChevronLeft, ChevronRight, FileEdit, Plus, Trash2, Share2, Settings, X } from "lucide-react";
import { useTableAuditLog } from "@/hooks/useTables";
import type { TableAuditEntry } from "@/lib/api";

const ACTION_CONFIG: Record<string, { label: string; icon: typeof Plus; color: string }> = {
  record_created: { label: "Created record", icon: Plus, color: "text-green-400" },
  record_updated: { label: "Updated record", icon: FileEdit, color: "text-blue-400" },
  record_deleted: { label: "Deleted record", icon: Trash2, color: "text-red-400" },
  collaborator_added: { label: "Added collaborator", icon: Share2, color: "text-purple-400" },
  collaborator_removed: { label: "Removed collaborator", icon: Share2, color: "text-orange-400" },
  settings_changed: { label: "Changed settings", icon: Settings, color: "text-yellow-400" },
};

function getActionInfo(action: string) {
  return ACTION_CONFIG[action] || { label: action, icon: History, color: "text-muted-foreground" };
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function ChangesDetail({ changes }: { changes: Record<string, unknown> | null }) {
  if (!changes || Object.keys(changes).length === 0) return null;

  return (
    <div className="mt-2 pl-8 space-y-1">
      {Object.entries(changes).map(([field, value]) => {
        const change = value as { old?: unknown; new?: unknown } | unknown;
        if (typeof change === "object" && change !== null && "old" in change) {
          const c = change as { old: unknown; new: unknown };
          return (
            <div key={field} className="text-xs text-muted-foreground flex items-center gap-1">
              <span className="font-medium text-foreground/70">{field}:</span>
              <span className="line-through text-red-400/60">{String(c.old ?? "empty")}</span>
              <span className="text-muted-foreground">&rarr;</span>
              <span className="text-green-400/80">{String(c.new ?? "empty")}</span>
            </div>
          );
        }
        return (
          <div key={field} className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground/70">{field}:</span>{" "}
            {String(value)}
          </div>
        );
      })}
    </div>
  );
}

function AuditEntryRow({ entry }: { entry: TableAuditEntry }) {
  const [expanded, setExpanded] = useState(false);
  const info = getActionInfo(entry.action);
  const Icon = info.icon;
  const hasChanges = entry.changes && Object.keys(entry.changes).length > 0;

  return (
    <div
      className={`px-4 py-3 hover:bg-accent/50 transition-colors ${hasChanges ? "cursor-pointer" : ""}`}
      onClick={() => hasChanges && setExpanded(!expanded)}
    >
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 p-1 rounded ${info.color} bg-current/10`}>
          <Icon className={`h-3.5 w-3.5 ${info.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              {entry.actor_name || "System"}
            </span>
            <span className="text-sm text-muted-foreground">{info.label}</span>
            {hasChanges && (
              <span className="text-xs text-muted-foreground">
                {expanded ? "▾" : "▸"}
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {formatRelativeTime(entry.created_at)}
            {entry.record_id && (
              <span className="ml-2 text-muted-foreground/60">
                Record {entry.record_id.slice(0, 8)}...
              </span>
            )}
          </div>
        </div>
      </div>
      {expanded && <ChangesDetail changes={entry.changes} />}
    </div>
  );
}

const ACTION_FILTERS = [
  { value: "", label: "All actions" },
  { value: "record_created", label: "Created" },
  { value: "record_updated", label: "Updated" },
  { value: "record_deleted", label: "Deleted" },
  { value: "collaborator_added", label: "Collaborator added" },
  { value: "settings_changed", label: "Settings changed" },
];

interface TableAuditLogProps {
  workspaceId: string | null;
  tableId: string | null;
  open: boolean;
  onClose: () => void;
}

export function TableAuditLog({ workspaceId, tableId, open, onClose }: TableAuditLogProps) {
  const [actionFilter, setActionFilter] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 25;

  const { entries, total, isLoading } = useTableAuditLog(
    workspaceId,
    tableId,
    { limit: pageSize, offset: page * pageSize, action: actionFilter || undefined }
  );

  const totalPages = Math.ceil(total / pageSize);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-muted rounded-xl w-full max-w-2xl border border-border max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <History className="h-5 w-5 text-purple-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Activity Log</h2>
              <p className="text-xs text-muted-foreground">{total} entries</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-accent rounded-lg text-muted-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Filter */}
        <div className="px-6 py-3 border-b border-border">
          <select
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(0); }}
            className="px-3 py-1.5 bg-accent border border-border rounded-lg text-sm text-foreground"
          >
            {ACTION_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>

        {/* Entries */}
        <div className="flex-1 overflow-y-auto divide-y divide-border/50">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-purple-500 border-t-transparent" />
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <History className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">
                {actionFilter ? "No entries match this filter" : "No activity recorded yet"}
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Enable auditing in table settings to track changes
              </p>
            </div>
          ) : (
            entries.map((entry) => <AuditEntryRow key={entry.id} entry={entry} />)
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-border">
            <span className="text-xs text-muted-foreground">
              Page {page + 1} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="p-1.5 hover:bg-accent rounded disabled:opacity-30 text-muted-foreground"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                disabled={page >= totalPages - 1}
                className="p-1.5 hover:bg-accent rounded disabled:opacity-30 text-muted-foreground"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
