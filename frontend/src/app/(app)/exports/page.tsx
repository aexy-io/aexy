"use client";

import { useState } from "react";
import {
  Download,
  FileText,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Trash2,
  Plus,
  RefreshCw,
  FileSpreadsheet,
  FileJson,
  File,
} from "lucide-react";
import { useExports, useExportStatus } from "@/hooks/useExports";
import { EmptyState } from "@/components/EmptyState";
import { PremiumGate } from "@/components/PremiumGate";
import { DataTable, DataTableColumn } from "@/components/ui/data-table";
import { ExportJob } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";

const EXPORT_TYPES = [
  { value: "team_analytics", label: "Team Analytics", description: "Team performance and collaboration metrics" },
  { value: "developer_profile", label: "Developer Profile", description: "Individual developer insights and stats" },
  { value: "report", label: "Custom Report", description: "Export an existing custom report" },
] as const;

const EXPORT_FORMATS = [
  { value: "csv", label: "CSV", icon: FileSpreadsheet, description: "Comma-separated values" },
  { value: "json", label: "JSON", icon: FileJson, description: "Structured data format" },
  { value: "pdf", label: "PDF", icon: FileText, description: "Print-ready document" },
  { value: "xlsx", label: "Excel", icon: FileSpreadsheet, description: "Spreadsheet format" },
] as const;

function ExportStatusBadge({ status }: { status: ExportJob["status"] }) {
  const config: Record<string, { color: string; icon: React.ElementType }> = {
    pending: { color: "text-yellow-400 bg-yellow-400/10", icon: Clock },
    processing: { color: "text-blue-400 bg-blue-400/10", icon: Loader2 },
    completed: { color: "text-emerald-400 bg-emerald-400/10", icon: CheckCircle2 },
    failed: { color: "text-red-400 bg-red-400/10", icon: AlertCircle },
  };

  const { color, icon: Icon } = config[status] || config.pending;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${color}`}>
      <Icon className={`h-3 w-3 ${status === "processing" ? "animate-spin" : ""}`} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function CreateExportForm({
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  onSubmit: (data: { export_type: string; format: string }) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  const [exportType, setExportType] = useState("");
  const [format, setFormat] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!exportType || !format) return;
    onSubmit({ export_type: exportType, format });
  };

  return (
    <form onSubmit={handleSubmit} className="bg-card rounded-xl border border-border p-5 space-y-4">
      <h3 className="text-sm font-semibold text-foreground">New Export</h3>
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Export Type</label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {EXPORT_TYPES.map((type) => (
            <button
              key={type.value}
              type="button"
              onClick={() => setExportType(type.value)}
              className={`text-left p-3 rounded-lg border transition ${
                exportType === type.value
                  ? "bg-primary/10 border-primary/30 text-foreground"
                  : "bg-muted border-border text-muted-foreground hover:text-foreground hover:border-border"
              }`}
            >
              <p className="text-sm font-medium">{type.label}</p>
              <p className="text-xs mt-0.5 opacity-75">{type.description}</p>
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Format</label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {EXPORT_FORMATS.map((fmt) => {
            const Icon = fmt.icon;
            return (
              <button
                key={fmt.value}
                type="button"
                onClick={() => setFormat(fmt.value)}
                className={`flex items-center gap-2 p-3 rounded-lg border transition ${
                  format === fmt.value
                    ? "bg-primary/10 border-primary/30 text-foreground"
                    : "bg-muted border-border text-muted-foreground hover:text-foreground hover:border-border"
                }`}
              >
                <Icon className="h-4 w-4" />
                <div>
                  <p className="text-sm font-medium">{fmt.label}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={isSubmitting || !exportType || !format}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
        >
          {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Start Export
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-muted text-foreground rounded-lg text-sm hover:bg-accent transition"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

/** Resolves live status for in-progress jobs, falls back to the original job data. */
function useLiveJob(job: ExportJob): ExportJob {
  const { data: liveStatus } = useExportStatus(
    job.status === "pending" || job.status === "processing" ? job.id : null
  );
  return liveStatus || job;
}

/* ---------- Cell components (React components so they can use hooks) ---------- */

function TypeCell({ job }: { job: ExportJob }) {
  const current = useLiveJob(job);
  return (
    <div className="flex items-center gap-2">
      <File className="h-4 w-4 text-muted-foreground" />
      <div>
        <p className="text-sm text-foreground capitalize">
          {current.export_type.replace(/_/g, " ")}
        </p>
        <p className="text-xs text-muted-foreground uppercase">{current.format}</p>
      </div>
    </div>
  );
}

function StatusCell({ job }: { job: ExportJob }) {
  const current = useLiveJob(job);
  return <ExportStatusBadge status={current.status} />;
}

function SizeCell({ job }: { job: ExportJob }) {
  const current = useLiveJob(job);
  return <span className="text-sm text-muted-foreground">{formatFileSize(current.file_size_bytes)}</span>;
}

function CreatedCell({ job }: { job: ExportJob }) {
  const current = useLiveJob(job);
  return (
    <span className="text-sm text-muted-foreground">
      {formatDistanceToNow(new Date(current.created_at), { addSuffix: true })}
    </span>
  );
}

function ActionsCell({
  job,
  onDelete,
  onDownload,
}: {
  job: ExportJob;
  onDelete: (id: string) => void;
  onDownload: (id: string) => void;
}) {
  const current = useLiveJob(job);
  return (
    <div className="flex items-center gap-1">
      {current.status === "completed" && (
        <button
          onClick={() => onDownload(current.id)}
          className="p-1.5 rounded-lg hover:bg-accent text-blue-400 hover:text-blue-300 transition"
          title="Download"
        >
          <Download className="h-4 w-4" />
        </button>
      )}
      <button
        onClick={() => onDelete(current.id)}
        className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-red-400 transition"
        title="Delete"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function exportColumns(
  onDelete: (id: string) => void,
  onDownload: (id: string) => void,
): DataTableColumn<ExportJob>[] {
  return [
    {
      id: "type",
      header: "Type",
      cell: (row) => <TypeCell job={row} />,
      sortValue: (row) => row.export_type,
      sortable: true,
    },
    {
      id: "status",
      header: "Status",
      cell: (row) => <StatusCell job={row} />,
      sortValue: (row) => row.status,
      sortable: true,
    },
    {
      id: "size",
      header: "Size",
      cell: (row) => <SizeCell job={row} />,
      sortValue: (row) => row.file_size_bytes ?? 0,
      sortable: true,
    },
    {
      id: "created",
      header: "Created",
      cell: (row) => <CreatedCell job={row} />,
      sortValue: (row) => new Date(row.created_at).getTime(),
      sortable: true,
    },
    {
      id: "actions",
      header: "Actions",
      cell: (row) => (
        <ActionsCell job={row} onDelete={onDelete} onDownload={onDownload} />
      ),
    },
  ];
}

export default function ExportsPage() {
  const { exports: jobs, isLoading, refetch, createExport, isCreating, deleteExport, getDownloadUrl } = useExports(50);
  const [showCreate, setShowCreate] = useState(false);

  const handleCreate = async (data: { export_type: string; format: string }) => {
    try {
      await createExport(data as any);
      setShowCreate(false);
    } catch (error) {
      console.error("Failed to create export:", error);
    }
  };

  const handleDelete = async (jobId: string) => {
    try {
      await deleteExport(jobId);
    } catch (error) {
      console.error("Failed to delete export:", error);
    }
  };

  const handleDownload = (jobId: string) => {
    const url = getDownloadUrl(jobId);
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    // Open download with auth
    const link = document.createElement("a");
    link.href = url;
    if (token) {
      // Use fetch for authenticated download
      fetch(url, { headers: { Authorization: `Bearer ${token}` } })
        .then((res) => res.blob())
        .then((blob) => {
          const blobUrl = URL.createObjectURL(blob);
          link.href = blobUrl;
          link.download = `export-${jobId}`;
          link.click();
          URL.revokeObjectURL(blobUrl);
        });
    } else {
      link.click();
    }
  };

  const pendingCount = jobs.filter((j) => j.status === "pending" || j.status === "processing").length;
  const completedCount = jobs.filter((j) => j.status === "completed").length;
  const failedCount = jobs.filter((j) => j.status === "failed").length;

  return (
    <PremiumGate feature="exports">
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Exports</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Export your data in various formats for analysis and reporting
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-lg text-foreground hover:bg-accent transition text-sm"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition"
          >
            <Plus className="h-4 w-4" />
            New Export
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card rounded-lg p-4 border border-border">
          <p className="text-2xl font-bold text-blue-400">{pendingCount}</p>
          <p className="text-muted-foreground text-sm">In Progress</p>
        </div>
        <div className="bg-card rounded-lg p-4 border border-border">
          <p className="text-2xl font-bold text-emerald-400">{completedCount}</p>
          <p className="text-muted-foreground text-sm">Completed</p>
        </div>
        <div className="bg-card rounded-lg p-4 border border-border">
          <p className="text-2xl font-bold text-red-400">{failedCount}</p>
          <p className="text-muted-foreground text-sm">Failed</p>
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <CreateExportForm
          onSubmit={handleCreate}
          onCancel={() => setShowCreate(false)}
          isSubmitting={isCreating}
        />
      )}

      {/* Export list */}
      {!isLoading && jobs.length === 0 ? (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-background/50">
            <h2 className="text-sm font-semibold text-foreground">Export History</h2>
          </div>
          <EmptyState
            icon={Download}
            title="No exports yet"
            description="Export your data in PDF, CSV, JSON, or XLSX format for analysis and reporting."
            actions={[
              { label: "Create Export", onClick: () => setShowCreate(true) },
            ]}
            compact
          />
        </div>
      ) : (
        <>
          <div className="px-1">
            <h2 className="text-sm font-semibold text-foreground mb-3">Export History</h2>
          </div>
          <DataTable<ExportJob>
            columns={exportColumns(handleDelete, handleDownload)}
            data={jobs}
            rowKey={(row) => row.id}
            isLoading={isLoading}
            skeletonRows={3}
            emptyIcon={<Download className="h-8 w-8" />}
            emptyTitle="No exports yet"
            emptyDescription="Export your data in PDF, CSV, JSON, or XLSX format for analysis and reporting."
          />
        </>
      )}
    </div>
    </PremiumGate>
  );
}
