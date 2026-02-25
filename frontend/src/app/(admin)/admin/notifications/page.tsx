"use client";

import { useState, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Bell,
  Search,
  Filter,
  Mail,
  CheckCircle2,
} from "lucide-react";
import { useAdminNotifications } from "@/hooks/useAdmin";
import { formatDistanceToNow } from "date-fns";
import { AdminNotification } from "@/lib/api";
import { DataTable, DataTableColumn } from "@/components/ui/data-table";

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

  const columns = useMemo<DataTableColumn<AdminNotification>[]>(
    () => [
      {
        id: "recipient",
        header: "Recipient",
        sortable: true,
        sortValue: (row) =>
          (row.recipient_name || row.recipient_email || "").toLowerCase(),
        cell: (row) => (
          <div>
            <p className="text-foreground">
              {row.recipient_name || row.recipient_email}
            </p>
            {row.recipient_name && (
              <p className="text-muted-foreground text-xs">
                {row.recipient_email}
              </p>
            )}
          </div>
        ),
      },
      {
        id: "event_type",
        header: "Event Type",
        sortable: true,
        sortValue: (row) => row.event_type,
        cell: (row) => (
          <span className="px-2 py-1 bg-accent rounded text-xs text-foreground">
            {row.event_type.replace(/_/g, " ")}
          </span>
        ),
      },
      {
        id: "title",
        header: "Title",
        sortable: true,
        sortValue: (row) => row.title.toLowerCase(),
        cell: (row) => (
          <p className="text-foreground max-w-xs truncate">{row.title}</p>
        ),
      },
      {
        id: "read",
        header: "Read",
        sortable: true,
        sortValue: (row) => (row.is_read ? 1 : 0),
        cell: (row) => (
          <div className="flex items-center gap-2">
            {row.is_read ? (
              <span className="text-emerald-400 text-xs flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Read
              </span>
            ) : (
              <span className="text-muted-foreground text-xs">Unread</span>
            )}
          </div>
        ),
      },
      {
        id: "email",
        header: "Email",
        sortable: true,
        sortValue: (row) => (row.email_sent ? 1 : 0),
        cell: (row) =>
          row.email_sent ? (
            <span className="text-blue-400 text-xs flex items-center gap-1">
              <Mail className="h-3 w-3" />
              Sent
            </span>
          ) : (
            <span className="text-muted-foreground text-xs">-</span>
          ),
      },
      {
        id: "created",
        header: "Created",
        sortable: true,
        sortValue: (row) => new Date(row.created_at).getTime(),
        cell: (row) => (
          <span
            className="text-muted-foreground text-sm"
            title={row.created_at}
          >
            {formatDistanceToNow(new Date(row.created_at), {
              addSuffix: true,
            })}
          </span>
        ),
      },
    ],
    []
  );

  const totalPages = data ? Math.ceil(data.total / 25) : undefined;

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
      {error ? (
        <div className="bg-muted rounded-xl border border-border flex items-center justify-center h-64 text-red-400">
          <Bell className="h-5 w-5 mr-2" />
          Failed to load notifications
        </div>
      ) : (
        <DataTable<AdminNotification>
          columns={columns}
          data={data?.items ?? []}
          rowKey={(row) => row.id}
          isLoading={isLoading}
          skeletonRows={10}
          emptyIcon={<Bell className="h-12 w-12" />}
          emptyTitle="No notifications found"
          currentPage={page}
          totalPages={totalPages}
          totalItems={data?.total}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
