"use client";

import { useState, useMemo, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Mail,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Search,
  Filter,
} from "lucide-react";
import { useAdminEmailLogs, useResendEmail } from "@/hooks/useAdmin";
import { formatDistanceToNow } from "date-fns";
import { AdminEmailLog } from "@/lib/api";
import { DataTable, DataTableColumn } from "@/components/ui/data-table";

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { color: string; icon: React.ElementType }> = {
    sent: { color: "text-emerald-400 bg-emerald-400/10", icon: CheckCircle2 },
    delivered: { color: "text-emerald-400 bg-emerald-400/10", icon: CheckCircle2 },
    failed: { color: "text-red-400 bg-red-400/10", icon: XCircle },
    bounced: { color: "text-orange-400 bg-orange-400/10", icon: AlertCircle },
    pending: { color: "text-yellow-400 bg-yellow-400/10", icon: AlertCircle },
  };

  const { color, icon: Icon } = config[status] || config.pending;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${color}`}>
      <Icon className="h-3 w-3" />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "sent", label: "Sent" },
  { value: "delivered", label: "Delivered" },
  { value: "failed", label: "Failed" },
  { value: "bounced", label: "Bounced" },
  { value: "pending", label: "Pending" },
];

export default function AdminEmailsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "");
  const [page, setPage] = useState(parseInt(searchParams.get("page") || "1"));

  const { data, isLoading, error, refetch } = useAdminEmailLogs({
    page,
    per_page: 25,
    status_filter: statusFilter || undefined,
    search: search || undefined,
  });

  const resendMutation = useResendEmail();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (statusFilter) params.set("status", statusFilter);
    router.push(`/admin/emails?${params.toString()}`);
  };

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    setPage(1);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (value) params.set("status", value);
    router.push(`/admin/emails?${params.toString()}`);
  };

  const handleResend = useCallback(
    async (emailId: string) => {
      try {
        await resendMutation.mutateAsync(emailId);
        refetch();
      } catch (err) {
        console.error("Failed to resend email:", err);
      }
    },
    [resendMutation, refetch]
  );

  const columns: DataTableColumn<AdminEmailLog>[] = useMemo(
    () => [
      {
        id: "recipient",
        header: "Recipient",
        sortable: true,
        sortValue: (row) => row.recipient_email,
        cell: (row) => (
          <div>
            <p className="text-foreground">{row.recipient_email}</p>
            {row.workspace_name && (
              <p className="text-muted-foreground text-xs">{row.workspace_name}</p>
            )}
          </div>
        ),
      },
      {
        id: "subject",
        header: "Subject",
        sortable: true,
        sortValue: (row) => row.subject,
        cell: (row) => (
          <p className="text-foreground max-w-xs truncate">{row.subject}</p>
        ),
      },
      {
        id: "status",
        header: "Status",
        sortable: true,
        sortValue: (row) => row.status,
        cell: (row) => <StatusBadge status={row.status} />,
      },
      {
        id: "template",
        header: "Template",
        sortable: true,
        sortValue: (row) => row.template_name || "",
        cell: (row) =>
          row.template_name ? (
            <span className="text-muted-foreground text-sm">{row.template_name}</span>
          ) : (
            <span className="text-muted-foreground text-sm">-</span>
          ),
      },
      {
        id: "sent",
        header: "Sent",
        sortable: true,
        sortValue: (row) => new Date(row.created_at).getTime(),
        cell: (row) => (
          <span className="text-muted-foreground text-sm" title={row.created_at}>
            {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
          </span>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        cell: (row) => {
          const canResend = row.status === "failed" || row.status === "bounced";
          if (!canResend) return null;
          return (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleResend(row.id);
              }}
              disabled={resendMutation.isPending}
              className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300 disabled:opacity-50"
            >
              {resendMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              Resend
            </button>
          );
        },
      },
    ],
    [resendMutation.isPending, handleResend]
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
            <Mail className="h-7 w-7 text-blue-400" />
            Email Logs
          </h1>
          <p className="text-muted-foreground mt-1">Monitor and manage all email deliveries</p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 px-3 py-2 bg-muted border border-border rounded-lg text-foreground hover:text-foreground hover:bg-accent transition"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <form onSubmit={handleSearch} className="flex-1 max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by recipient email..."
              className="w-full pl-10 pr-4 py-2 bg-muted border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500"
            />
          </div>
        </form>

        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <select
            value={statusFilter}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="bg-muted border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-blue-500"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      {error ? (
        <div className="bg-muted rounded-xl border border-border overflow-hidden">
          <div className="flex items-center justify-center h-64 text-red-400">
            <AlertCircle className="h-5 w-5 mr-2" />
            Failed to load email logs
          </div>
        </div>
      ) : (
        <DataTable<AdminEmailLog>
          columns={columns}
          data={data?.items ?? []}
          rowKey={(row) => row.id}
          isLoading={isLoading}
          skeletonRows={10}
          emptyIcon={<Mail className="h-12 w-12" />}
          emptyTitle="No email logs found"
          emptyDescription={
            search || statusFilter ? "Try adjusting your search or filters" : undefined
          }
          currentPage={page}
          totalPages={data ? Math.ceil(data.total / 25) : 1}
          totalItems={data?.total}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
