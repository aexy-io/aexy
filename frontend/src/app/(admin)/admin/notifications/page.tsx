"use client";

import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Bell,
  Loader2,
  AlertCircle,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Mail,
  CheckCircle2,
} from "lucide-react";
import { useAdminNotifications } from "@/hooks/useAdmin";
import { formatDistanceToNow } from "date-fns";
import { AdminNotification } from "@/lib/api";

function NotificationRow({ notification }: { notification: AdminNotification }) {
  return (
    <tr className="border-b border-slate-700 hover:bg-slate-800/50">
      <td className="px-4 py-3">
        <div>
          <p className="text-white">{notification.recipient_name || notification.recipient_email}</p>
          {notification.recipient_name && (
            <p className="text-slate-500 text-xs">{notification.recipient_email}</p>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <span className="px-2 py-1 bg-slate-700 rounded text-xs text-slate-300">
          {notification.event_type.replace(/_/g, " ")}
        </span>
      </td>
      <td className="px-4 py-3">
        <p className="text-slate-300 max-w-xs truncate">{notification.title}</p>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {notification.is_read ? (
            <span className="text-emerald-400 text-xs flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Read
            </span>
          ) : (
            <span className="text-slate-500 text-xs">Unread</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        {notification.email_sent ? (
          <span className="text-blue-400 text-xs flex items-center gap-1">
            <Mail className="h-3 w-3" />
            Sent
          </span>
        ) : (
          <span className="text-slate-600 text-xs">-</span>
        )}
      </td>
      <td className="px-4 py-3">
        <span className="text-slate-400 text-sm" title={notification.created_at}>
          {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
        </span>
      </td>
    </tr>
  );
}

const EVENT_TYPE_OPTIONS = [
  { value: "", label: "All Event Types" },
  { value: "peer_review_requested", label: "Peer Review Requested" },
  { value: "peer_review_received", label: "Peer Review Received" },
  { value: "workspace_invite", label: "Workspace Invite" },
  { value: "assessment_invitation", label: "Assessment Invitation" },
  { value: "goal_at_risk", label: "Goal At Risk" },
  { value: "goal_completed", label: "Goal Completed" },
];

export default function AdminNotificationsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [eventType, setEventType] = useState(searchParams.get("event_type") || "");
  const [page, setPage] = useState(parseInt(searchParams.get("page") || "1"));

  const { data, isLoading, error, refetch } = useAdminNotifications({
    page,
    per_page: 25,
    event_type: eventType || undefined,
    search: search || undefined,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (eventType) params.set("event_type", eventType);
    router.push(`/admin/notifications?${params.toString()}`);
  };

  const handleEventTypeChange = (value: string) => {
    setEventType(value);
    setPage(1);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (value) params.set("event_type", value);
    router.push(`/admin/notifications?${params.toString()}`);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Bell className="h-7 w-7 text-purple-400" />
            Notifications
          </h1>
          <p className="text-slate-400 mt-1">View all platform notifications</p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700 transition"
        >
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <form onSubmit={handleSearch} className="flex-1 max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notifications..."
              className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
        </form>

        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-400" />
          <select
            value={eventType}
            onChange={(e) => handleEventTypeChange(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
          >
            {EVENT_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-64 text-red-400">
            <AlertCircle className="h-5 w-5 mr-2" />
            Failed to load notifications
          </div>
        ) : data?.items?.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400">
            <Bell className="h-12 w-12 mb-3 text-slate-600" />
            <p>No notifications found</p>
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead className="bg-slate-900/50">
                <tr className="text-left text-slate-400 text-sm">
                  <th className="px-4 py-3 font-medium">Recipient</th>
                  <th className="px-4 py-3 font-medium">Event Type</th>
                  <th className="px-4 py-3 font-medium">Title</th>
                  <th className="px-4 py-3 font-medium">Read</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {data?.items?.map((notification) => (
                  <NotificationRow key={notification.id} notification={notification} />
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {data && data.total > 25 && (
              <div className="px-4 py-3 border-t border-slate-700 flex items-center justify-between">
                <span className="text-slate-400 text-sm">
                  Showing {(page - 1) * 25 + 1} - {Math.min(page * 25, data.total)} of{" "}
                  {data.total} notifications
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-2 rounded-lg bg-slate-700 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-600"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-slate-300 px-3">Page {page}</span>
                  <button
                    onClick={() => setPage((p) => p + 1)}
                    disabled={!data.has_next}
                    className="p-2 rounded-lg bg-slate-700 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-600"
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
