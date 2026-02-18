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
    <tr className="border-b border-border hover:bg-muted/50">
      <td className="px-4 py-3">
        <div>
          <p className="text-foreground">{notification.recipient_name || notification.recipient_email}</p>
          {notification.recipient_name && (
            <p className="text-muted-foreground text-xs">{notification.recipient_email}</p>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <span className="px-2 py-1 bg-accent rounded text-xs text-foreground">
          {notification.event_type.replace(/_/g, " ")}
        </span>
      </td>
      <td className="px-4 py-3">
        <p className="text-foreground max-w-xs truncate">{notification.title}</p>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {notification.is_read ? (
            <span className="text-emerald-400 text-xs flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Read
            </span>
          ) : (
            <span className="text-muted-foreground text-xs">Unread</span>
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
          <span className="text-muted-foreground text-xs">-</span>
        )}
      </td>
      <td className="px-4 py-3">
        <span className="text-muted-foreground text-sm" title={notification.created_at}>
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
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
            <Bell className="h-7 w-7 text-purple-400" />
            Notifications
          </h1>
          <p className="text-muted-foreground mt-1">View all platform notifications</p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 px-3 py-2 bg-muted border border-border rounded-lg text-foreground hover:text-foreground hover:bg-accent transition"
        >
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
              placeholder="Search notifications..."
              className="w-full pl-10 pr-4 py-2 bg-muted border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500"
            />
          </div>
        </form>

        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <select
            value={eventType}
            onChange={(e) => handleEventTypeChange(e.target.value)}
            className="bg-muted border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-blue-500"
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
      <div className="bg-muted rounded-xl border border-border overflow-hidden">
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
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <Bell className="h-12 w-12 mb-3 text-muted-foreground" />
            <p>No notifications found</p>
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead className="bg-background/50">
                <tr className="text-left text-muted-foreground text-sm">
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
              <div className="px-4 py-3 border-t border-border flex items-center justify-between">
                <span className="text-muted-foreground text-sm">
                  Showing {(page - 1) * 25 + 1} - {Math.min(page * 25, data.total)} of{" "}
                  {data.total} notifications
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
