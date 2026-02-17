"use client";

import { useState } from "react";
import {
  User,
  Calendar,
  Filter,
  Loader2,
} from "lucide-react";
import { LeaveRequest } from "@/lib/leave-api";
import { useLeaveRequests } from "@/hooks/useLeave";

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

export function TeamLeaveTable() {
  const [statusFilter, setStatusFilter] = useState("");
  const { data: requests, isLoading } = useLeaveRequests(
    statusFilter ? { status: statusFilter } : undefined
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
      </div>
    );
  }

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
          {requests?.length || 0} request{(requests?.length || 0) !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="bg-background border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">
                  Employee
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">
                  Leave Type
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">
                  Dates
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">
                  Days
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {requests?.map((request) => {
                const status = statusBadge[request.status];
                const developer = request.developer;
                const leaveType = request.leave_type;
                const isSingleDay = request.start_date === request.end_date;

                return (
                  <tr
                    key={request.id}
                    className="hover:bg-muted/50 transition"
                  >
                    {/* Employee */}
                    <td className="px-4 py-3">
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
                    </td>

                    {/* Leave Type */}
                    <td className="px-4 py-3">
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
                    </td>

                    {/* Dates */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-sm text-foreground">
                        <Calendar className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        <span>
                          {isSingleDay
                            ? formatDate(request.start_date)
                            : `${formatDate(request.start_date)} - ${formatDate(request.end_date)}`}
                        </span>
                      </div>
                    </td>

                    {/* Days */}
                    <td className="px-4 py-3">
                      <span className="text-sm text-foreground">
                        {request.total_days}
                        {request.is_half_day && (
                          <span className="text-xs text-muted-foreground ml-1">
                            (half)
                          </span>
                        )}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs font-medium px-2.5 py-1 rounded-full border ${status.className}`}
                      >
                        {status.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {(!requests || requests.length === 0) && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-sm text-muted-foreground"
                  >
                    No leave requests found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
