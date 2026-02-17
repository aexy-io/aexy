"use client";

import { useState } from "react";
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
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useAdminEmailLogs, useResendEmail } from "@/hooks/useAdmin";
import { formatDistanceToNow, format } from "date-fns";
import { AdminEmailLog } from "@/lib/api";

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

function EmailRow({
  email,
  onResend,
  isResending,
}: {
  email: AdminEmailLog;
  onResend: (id: string) => void;
  isResending: boolean;
}) {
  const canResend = email.status === "failed" || email.status === "bounced";

  return (
    <tr className="border-b border-border hover:bg-muted/50">
      <td className="px-4 py-3">
        <div>
          <p className="text-foreground">{email.recipient_email}</p>
          {email.workspace_name && (
            <p className="text-muted-foreground text-xs">{email.workspace_name}</p>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <p className="text-foreground max-w-xs truncate">{email.subject}</p>
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={email.status} />
      </td>
      <td className="px-4 py-3">
        {email.template_name ? (
          <span className="text-muted-foreground text-sm">{email.template_name}</span>
        ) : (
          <span className="text-muted-foreground text-sm">-</span>
        )}
      </td>
      <td className="px-4 py-3">
        <span className="text-muted-foreground text-sm" title={email.created_at}>
          {formatDistanceToNow(new Date(email.created_at), { addSuffix: true })}
        </span>
      </td>
      <td className="px-4 py-3">
        {canResend && (
          <button
            onClick={() => onResend(email.id)}
            disabled={isResending}
            className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300 disabled:opacity-50"
          >
            {isResending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            Resend
          </button>
        )}
      </td>
    </tr>
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

  const handleResend = async (emailId: string) => {
    try {
      await resendMutation.mutateAsync(emailId);
      refetch();
    } catch (err) {
      console.error("Failed to resend email:", err);
    }
  };

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
      <div className="bg-muted rounded-xl border border-border overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-64 text-red-400">
            <AlertCircle className="h-5 w-5 mr-2" />
            Failed to load email logs
          </div>
        ) : data?.items?.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <Mail className="h-12 w-12 mb-3 text-muted-foreground" />
            <p>No email logs found</p>
            {(search || statusFilter) && (
              <button
                onClick={() => {
                  setSearch("");
                  setStatusFilter("");
                  router.push("/admin/emails");
                }}
                className="mt-2 text-blue-400 hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead className="bg-background/50">
                <tr className="text-left text-muted-foreground text-sm">
                  <th className="px-4 py-3 font-medium">Recipient</th>
                  <th className="px-4 py-3 font-medium">Subject</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Template</th>
                  <th className="px-4 py-3 font-medium">Sent</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data?.items?.map((email) => (
                  <EmailRow
                    key={email.id}
                    email={email}
                    onResend={handleResend}
                    isResending={resendMutation.isPending}
                  />
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {data && data.total > 25 && (
              <div className="px-4 py-3 border-t border-border flex items-center justify-between">
                <span className="text-muted-foreground text-sm">
                  Showing {(page - 1) * 25 + 1} - {Math.min(page * 25, data.total)} of{" "}
                  {data.total} emails
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-2 rounded-lg bg-accent text-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:bg-muted"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-foreground px-3">Page {page}</span>
                  <button
                    onClick={() => setPage((p) => p + 1)}
                    disabled={!data.has_next}
                    className="p-2 rounded-lg bg-accent text-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:bg-muted"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
