"use client";

import { useState, useMemo } from "react";
import {
  User,
  Calendar,
  Filter,
} from "lucide-react";
import { LeaveRequest } from "@/lib/leave-api";
import { useLeaveRequests } from "@/hooks/useLeave";
import { DataTable, DataTableColumn } from "@/components/ui/data-table";

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
  { value: "withdrawn", label: "Withdrawn" },
];

const statusBadge: Record<
  LeaveRequest["status"],
  { label: string; className: string }
> = {
  pending: { label: "Pending", className: "bg-yellow-50 text-yellow-600 dark:bg-yellow-500/10 dark:text-yellow-400 border-yellow-200 dark:border-yellow-500/20" },
  approved: { label: "Approved", className: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20" },
  rejected: { label: "Rejected", className: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400 border-red-200 dark:border-red-500/20" },
  cancelled: { label: "Cancelled", className: "bg-muted-foreground/10 text-muted-foreground border-muted-foreground/20" },
  withdrawn: { label: "Withdrawn", className: "bg-muted-foreground/10 text-muted-foreground border-muted-foreground/20" },
};

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

const columns: DataTableColumn<LeaveRequest>[] = [
  {
    id: "employee",
    header: "Employee",
    sortable: true,
    sortValue: (row) =>
      row.developer?.name || row.developer?.email || "Unknown",
    cell: (row) => {
      const developer = row.developer;
      return (
        <div className="flex items-center gap-2.5">
          {developer?.avatar_url ? (
            <img
              src={developer.avatar_url}
              alt={developer.name || "User"}
              className="w-7 h-7 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          )}
          <span className="text-sm font-medium text-foreground truncate">
            {developer?.name || developer?.email || "Unknown"}
          </span>
        </div>
      );
    },
  },
  {
    id: "leaveType",
    header: "Leave Type",
    sortable: true,
    sortValue: (row) => row.leave_type?.name || "Leave",
    cell: (row) => {
      const leaveType = row.leave_type;
      return (
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{
              backgroundColor: leaveType?.color || "#6366f1",
            }}
          />
          <span className="text-sm text-foreground">
            {leaveType?.name || "Leave"}
          </span>
        </div>
      );
    },
  },
  {
    id: "dates",
    header: "Dates",
    sortable: true,
    sortValue: (row) => row.start_date,
    cell: (row) => {
      const isSingleDay = row.start_date === row.end_date;
      return (
        <div className="flex items-center gap-1.5 text-sm text-foreground">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          <span>
            {isSingleDay
              ? formatDate(row.start_date)
              : `${formatDate(row.start_date)} - ${formatDate(row.end_date)}`}
          </span>
        </div>
      );
    },
  },
  {
    id: "days",
    header: "Days",
    sortable: true,
    sortValue: (row) => row.total_days,
    cell: (row) => (
      <span className="text-sm text-foreground">
        {row.total_days}
        {row.is_half_day && (
          <span className="text-xs text-muted-foreground ml-1">
            (half)
          </span>
        )}
      </span>
    ),
  },
  {
    id: "status",
    header: "Status",
    sortable: true,
    sortValue: (row) => row.status,
    cell: (row) => {
      const status = statusBadge[row.status];
      return (
        <span
          className={`text-xs font-medium px-2.5 py-1 rounded-full border ${status.className}`}
        >
          {status.label}
        </span>
      );
    },
  },
];

export function TeamLeaveTable() {
  const [statusFilter, setStatusFilter] = useState("");
  const { data: requests, isLoading } = useLeaveRequests(
    statusFilter ? { status: statusFilter } : undefined
  );

  const data = useMemo(() => requests || [], [requests]);

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-blue-500/50"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <span className="text-xs text-muted-foreground">
          {data.length} request{data.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={data}
        rowKey={(row) => row.id}
        isLoading={isLoading}
        skeletonRows={5}
        emptyTitle="No leave requests found"
        emptyDescription="Try adjusting the status filter or check back later."
      />
    </div>
  );
}
