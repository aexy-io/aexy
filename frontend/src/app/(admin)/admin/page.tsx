"use client";

import Link from "next/link";
import {
  Building2,
  Users,
  Mail,
  Bell,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  ChevronRight,
  TrendingUp,
} from "lucide-react";
import { useAdminDashboardStats, useAdminEmailLogs } from "@/hooks/useAdmin";
import { formatDistanceToNow } from "date-fns";

function StatCard({
  title,
  value,
  icon: Icon,
  href,
  trend,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  href?: string;
  trend?: string;
}) {
  const content = (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-5 hover:border-slate-600 transition group">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-slate-400 text-sm">{title}</p>
          <p className="text-2xl font-bold text-white mt-1">{value}</p>
          {trend && (
            <p className="text-emerald-400 text-sm mt-1 flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              {trend}
            </p>
          )}
        </div>
        <div className="p-2.5 bg-slate-700 rounded-lg group-hover:bg-slate-600 transition">
          <Icon className="h-5 w-5 text-slate-300" />
        </div>
      </div>
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
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
        <span className="text-slate-400">Email Delivery Rate (30 days)</span>
        <span className="text-white font-medium">{percentage}%</span>
      </div>
      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${getColor()} transition-all duration-500`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

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

export default function AdminDashboardPage() {
  const { data: stats, isLoading: statsLoading, error: statsError } = useAdminDashboardStats();
  const { data: recentEmails, isLoading: emailsLoading } = useAdminEmailLogs({
    page: 1,
    per_page: 5,
    status_filter: "failed",
  });

  if (statsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (statsError) {
    return (
      <div className="flex items-center justify-center h-64 text-red-400">
        <AlertCircle className="h-5 w-5 mr-2" />
        Failed to load dashboard stats
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
        <p className="text-slate-400 mt-1">Platform-wide monitoring and management</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Workspaces"
          value={stats?.total_workspaces || 0}
          icon={Building2}
          href="/admin/workspaces"
        />
        <StatCard
          title="Total Users"
          value={stats?.total_users || 0}
          icon={Users}
          href="/admin/users"
        />
        <StatCard
          title="Emails Sent"
          value={stats?.total_emails_sent?.toLocaleString() || 0}
          icon={Mail}
          href="/admin/emails"
          trend={`${stats?.emails_sent_today || 0} today`}
        />
        <StatCard
          title="Notifications"
          value={stats?.total_notifications?.toLocaleString() || 0}
          icon={Bell}
          href="/admin/notifications"
        />
      </div>

      {/* Delivery Rate */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
        <DeliveryRateBar rate={stats?.email_delivery_rate || 1} />
        <div className="mt-4 flex gap-6 text-sm">
          <div>
            <span className="text-slate-400">Sent Today:</span>
            <span className="text-white ml-2">{stats?.emails_sent_today || 0}</span>
          </div>
          <div>
            <span className="text-slate-400">This Week:</span>
            <span className="text-white ml-2">{stats?.emails_sent_this_week || 0}</span>
          </div>
          <div>
            <span className="text-slate-400">Failed Today:</span>
            <span className="text-red-400 ml-2">{stats?.emails_failed_today || 0}</span>
          </div>
          <div>
            <span className="text-slate-400">Active Workspaces (30d):</span>
            <span className="text-white ml-2">{stats?.active_workspaces_30d || 0}</span>
          </div>
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Link
          href="/admin/emails"
          className="flex items-center justify-between bg-slate-800 rounded-xl border border-slate-700 p-4 hover:border-blue-500/50 transition group"
        >
          <div className="flex items-center gap-3">
            <Mail className="h-5 w-5 text-blue-400" />
            <span className="text-white">Email Delivery</span>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-500 group-hover:text-white transition" />
        </Link>
        <Link
          href="/admin/notifications"
          className="flex items-center justify-between bg-slate-800 rounded-xl border border-slate-700 p-4 hover:border-purple-500/50 transition group"
        >
          <div className="flex items-center gap-3">
            <Bell className="h-5 w-5 text-purple-400" />
            <span className="text-white">Notifications</span>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-500 group-hover:text-white transition" />
        </Link>
        <Link
          href="/admin/workspaces"
          className="flex items-center justify-between bg-slate-800 rounded-xl border border-slate-700 p-4 hover:border-emerald-500/50 transition group"
        >
          <div className="flex items-center gap-3">
            <Building2 className="h-5 w-5 text-emerald-400" />
            <span className="text-white">Workspaces</span>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-500 group-hover:text-white transition" />
        </Link>
        <Link
          href="/admin/users"
          className="flex items-center justify-between bg-slate-800 rounded-xl border border-slate-700 p-4 hover:border-amber-500/50 transition group"
        >
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-amber-400" />
            <span className="text-white">Users</span>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-500 group-hover:text-white transition" />
        </Link>
      </div>

      {/* Recent Failed Emails */}
      <div className="bg-slate-800 rounded-xl border border-slate-700">
        <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Recent Failed Emails</h2>
          <Link href="/admin/emails?status=failed" className="text-sm text-blue-400 hover:underline">
            View All
          </Link>
        </div>
        <div className="divide-y divide-slate-700">
          {emailsLoading ? (
            <div className="p-8 flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : recentEmails?.items?.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-500" />
              <p>No failed emails</p>
            </div>
          ) : (
            recentEmails?.items?.map((email) => (
              <div key={email.id} className="px-5 py-4 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-white truncate">{email.recipient_email}</p>
                  <p className="text-slate-400 text-sm truncate">{email.subject}</p>
                </div>
                <div className="flex items-center gap-4">
                  <StatusBadge status={email.status} />
                  <span className="text-slate-500 text-sm whitespace-nowrap">
                    {formatDistanceToNow(new Date(email.created_at), { addSuffix: true })}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
