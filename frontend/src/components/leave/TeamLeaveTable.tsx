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
  pending: { label: "Pending", className: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
  approved: { label: "Approved", className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  rejected: { label: "Rejected", className: "bg-red-500/10 text-red-400 border-red-500/20" },
  cancelled: { label: "Cancelled", className: "bg-slate-500/10 text-slate-400 border-slate-500/20" },
  withdrawn: { label: "Withdrawn", className: "bg-slate-500/10 text-slate-400 border-slate-500/20" },
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
        <Loader2 className="h-6 w-6 text-slate-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-500" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500/50"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <span className="text-xs text-slate-500">
          {requests?.length || 0} request{(requests?.length || 0) !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-3">
                  Employee
                </th>
                <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-3">
                  Leave Type
                </th>
                <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-3">
                  Dates
                </th>
                <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-3">
                  Days
                </th>
                <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-3">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {requests?.map((request) => {
                const status = statusBadge[request.status];
                const developer = request.developer;
                const leaveType = request.leave_type;
                const isSingleDay = request.start_date === request.end_date;

                return (
                  <tr
                    key={request.id}
                    className="hover:bg-slate-800/50 transition"
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
                          <div className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center flex-shrink-0">
                            <User className="h-3.5 w-3.5 text-slate-500" />
                          </div>
                        )}
                        <span className="text-sm font-medium text-white truncate">
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
                        <span className="text-sm text-slate-300">
                          {leaveType?.name || "Leave"}
                        </span>
                      </div>
                    </td>

                    {/* Dates */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-sm text-slate-300">
                        <Calendar className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
                        <span>
                          {isSingleDay
                            ? formatDate(request.start_date)
                            : `${formatDate(request.start_date)} - ${formatDate(request.end_date)}`}
                        </span>
                      </div>
                    </td>

                    {/* Days */}
                    <td className="px-4 py-3">
                      <span className="text-sm text-slate-300">
                        {request.total_days}
                        {request.is_half_day && (
                          <span className="text-xs text-slate-500 ml-1">
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
                    className="px-4 py-8 text-center text-sm text-slate-500"
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
