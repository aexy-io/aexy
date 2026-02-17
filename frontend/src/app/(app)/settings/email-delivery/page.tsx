"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Mail,
  Crown,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Filter,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useSubscription } from "@/hooks/useSubscription";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspaceEmailStats, useWorkspaceEmailLogs } from "@/hooks/useWorkspaceEmailDelivery";
import { formatDistanceToNow } from "date-fns";
import { WorkspaceEmailLog } from "@/lib/api";

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

function DeliveryRateBar({ rate }: { rate: number }) {
  const percentage = Math.round(rate * 100);
  const getColor = () => {
    if (percentage >= 95) return "bg-emerald-500";
    if (percentage >= 85) return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Delivery Rate</span>
        <span className="text-foreground font-medium">{percentage}%</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full ${getColor()} transition-all duration-500`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  subValue,
  color = "text-foreground",
}: {
  label: string;
  value: number;
  subValue?: string;
  color?: string;
}) {
  return (
    <div className="bg-card/50 rounded-lg p-4">
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value.toLocaleString()}</p>
      {subValue && <p className="text-muted-foreground text-xs mt-1">{subValue}</p>}
    </div>
  );
}

function EmailRow({ email }: { email: WorkspaceEmailLog }) {
  return (
    <tr className="border-b border-border hover:bg-card/50">
      <td className="px-4 py-3">
        <p className="text-foreground">{email.recipient_email}</p>
      </td>
      <td className="px-4 py-3">
        <p className="text-foreground max-w-xs truncate">{email.subject}</p>
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={email.status} />
      </td>
      <td className="px-4 py-3">
        {email.notification_type ? (
          <span className="text-muted-foreground text-sm">
            {email.notification_type.replace(/_/g, " ")}
          </span>
        ) : (
          <span className="text-muted-foreground text-sm">-</span>
        )}
      </td>
      <td className="px-4 py-3">
        <span className="text-muted-foreground text-sm" title={email.created_at}>
          {formatDistanceToNow(new Date(email.created_at), { addSuffix: true })}
        </span>
      </td>
    </tr>
  );
}

function EnterpriseUpgradePrompt() {
  const router = useRouter();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Email Delivery</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Monitor email delivery status and logs
        </p>
      </div>

      <div className="py-8">
        <div className="flex flex-col items-center justify-center text-center">
          <div className="p-4 bg-amber-500/20 rounded-full mb-6">
            <Crown className="h-12 w-12 text-amber-500" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-3">Enterprise Feature</h2>
          <p className="text-muted-foreground mb-8 max-w-md">
            Email Delivery monitoring is available on the Enterprise plan. Upgrade to monitor
            email delivery status, view logs, and track deliverability metrics.
          </p>
          <div className="space-y-3">
            <button
              onClick={() => router.push("/settings/billing")}
              className="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-black font-medium rounded-lg transition"
            >
              Upgrade to Enterprise
            </button>
            <p className="text-muted-foreground text-sm">
              Or{" "}
              <Link href="/settings/appearance" className="text-blue-400 hover:underline">
                return to settings
              </Link>
            </p>
          </div>

          {/* Feature Preview */}
          <div className="mt-12 w-full max-w-lg">
            <h3 className="text-sm font-medium text-muted-foreground mb-4">
              What you&apos;ll get with Enterprise:
            </h3>
            <ul className="text-left space-y-3">
              <li className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                <span className="text-foreground">
                  Real-time email delivery monitoring and status tracking
                </span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                <span className="text-foreground">
                  Delivery rate analytics and bounce tracking
                </span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                <span className="text-foreground">
                  Email log history for all workspace notifications
                </span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                <span className="text-foreground">
                  Filter and search by status, recipient, and type
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
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

export default function EmailDeliverySettingsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { currentWorkspaceId, currentWorkspace } = useWorkspace();
  const { isEnterprise, isLoading: subscriptionLoading, tier } = useSubscription(currentWorkspaceId);

  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);

  const developerId = typeof window !== "undefined" ? localStorage.getItem("developer_id") : null;

  const {
    data: stats,
    isLoading: statsLoading,
    error: statsError,
    refetch: refetchStats,
  } = useWorkspaceEmailStats(currentWorkspaceId, developerId);

  const {
    data: emailLogs,
    isLoading: logsLoading,
    error: logsError,
    refetch: refetchLogs,
  } = useWorkspaceEmailLogs(currentWorkspaceId, developerId, {
    page,
    per_page: 25,
    status_filter: statusFilter || undefined,
  });

  // Check workspace admin access
  const member = currentWorkspace?.members?.find((m) => m.developer_id === developerId);
  const isWorkspaceAdmin = member?.role === "owner" || member?.role === "admin";

  // Loading state
  if (subscriptionLoading) {
    return (
      <div className="py-20 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  // Enterprise check - show upgrade prompt
  if (!isEnterprise) {
    return <EnterpriseUpgradePrompt />;
  }

  // Not a workspace admin - show access denied
  if (!isWorkspaceAdmin) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Email Delivery</h1>
          <p className="text-muted-foreground text-sm mt-1">Access Denied</p>
        </div>
        <div className="py-8 text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">Admin Access Required</h2>
          <p className="text-muted-foreground mb-6">
            Only workspace owners and admins can access email delivery monitoring.
          </p>
          <Link href="/settings/appearance" className="text-blue-400 hover:underline">
            Return to settings
          </Link>
        </div>
      </div>
    );
  }

  const handleRefresh = () => {
    refetchStats();
    refetchLogs();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Email Delivery</h1>
          <p className="text-muted-foreground text-sm mt-1">Monitor email delivery status and logs</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            className="flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-lg text-foreground hover:text-foreground hover:bg-accent transition"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {/* Stats */}
        {statsLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : statsError ? (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Failed to load email statistics
          </div>
        ) : stats ? (
          <>
            {/* Delivery Rate */}
            <div className="bg-card rounded-xl border border-border p-5">
              <DeliveryRateBar rate={stats.delivery_rate} />
              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                  label="Sent Today"
                  value={stats.sent_today}
                  subValue="emails"
                />
                <StatCard
                  label="This Week"
                  value={stats.sent_this_week}
                  subValue="emails"
                />
                <StatCard
                  label="This Month"
                  value={stats.sent_this_month}
                  subValue="emails"
                />
                <StatCard
                  label="Failed"
                  value={stats.total_failed}
                  color="text-red-400"
                />
              </div>
            </div>

            {/* Status Breakdown */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="bg-card rounded-lg p-4 border border-border">
                <p className="text-emerald-400 text-2xl font-bold">{stats.total_delivered}</p>
                <p className="text-muted-foreground text-sm">Delivered</p>
              </div>
              <div className="bg-card rounded-lg p-4 border border-border">
                <p className="text-blue-400 text-2xl font-bold">{stats.total_sent}</p>
                <p className="text-muted-foreground text-sm">Sent</p>
              </div>
              <div className="bg-card rounded-lg p-4 border border-border">
                <p className="text-yellow-400 text-2xl font-bold">{stats.total_pending}</p>
                <p className="text-muted-foreground text-sm">Pending</p>
              </div>
              <div className="bg-card rounded-lg p-4 border border-border">
                <p className="text-orange-400 text-2xl font-bold">{stats.total_bounced}</p>
                <p className="text-muted-foreground text-sm">Bounced</p>
              </div>
              <div className="bg-card rounded-lg p-4 border border-border">
                <p className="text-red-400 text-2xl font-bold">{stats.total_failed}</p>
                <p className="text-muted-foreground text-sm">Failed</p>
              </div>
            </div>
          </>
        ) : null}

        {/* Email Logs */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-foreground">Email Logs</h2>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="bg-muted border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-blue-500"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {logsLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            </div>
          ) : logsError ? (
            <div className="flex items-center justify-center h-64 text-red-400">
              <AlertCircle className="h-5 w-5 mr-2" />
              Failed to load email logs
            </div>
          ) : emailLogs?.items?.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <Mail className="h-12 w-12 mb-3 text-muted-foreground" />
              <p>No email logs found</p>
              {statusFilter && (
                <button
                  onClick={() => setStatusFilter("")}
                  className="mt-2 text-blue-400 hover:underline"
                >
                  Clear filter
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px]">
                <thead className="bg-background/50">
                  <tr className="text-left text-muted-foreground text-sm">
                    <th className="px-4 py-3 font-medium">Recipient</th>
                    <th className="px-4 py-3 font-medium">Subject</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Sent</th>
                  </tr>
                </thead>
                <tbody>
                  {emailLogs?.items?.map((email) => (
                    <EmailRow key={email.id} email={email} />
                  ))}
                </tbody>
              </table>

              {/* Pagination */}
              {emailLogs && emailLogs.total > 25 && (
                <div className="px-4 py-3 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <span className="text-muted-foreground text-sm">
                    Showing {(page - 1) * 25 + 1} - {Math.min(page * 25, emailLogs.total)} of{" "}
                    {emailLogs.total} emails
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="p-2 rounded-lg bg-muted text-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="text-foreground px-3">Page {page}</span>
                    <button
                      onClick={() => setPage((p) => p + 1)}
                      disabled={!emailLogs.has_next}
                      className="p-2 rounded-lg bg-muted text-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
