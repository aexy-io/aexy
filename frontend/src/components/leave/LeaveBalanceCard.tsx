"use client";

import { LeaveBalance } from "@/lib/leave-api";

interface LeaveBalanceCardProps {
  balance: LeaveBalance;
}

export function LeaveBalanceCard({ balance }: LeaveBalanceCardProps) {
  const leaveType = balance.leave_type;
  const total = balance.total_allocated + balance.carried_forward;
  const usedPercent = total > 0 ? (balance.used / total) * 100 : 0;
  const pendingPercent = total > 0 ? (balance.pending / total) * 100 : 0;
  const availablePercent = total > 0 ? (balance.available / total) * 100 : 0;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{ backgroundColor: leaveType?.color || "#6366f1" }}
        />
        <h3 className="text-sm font-semibold text-white truncate">
          {leaveType?.name || "Unknown"}
        </h3>
        {leaveType?.is_paid === false && (
          <span className="text-[10px] uppercase tracking-wider text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">
            Unpaid
          </span>
        )}
      </div>

      {/* Progress Bar */}
      <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden flex">
        {/* Used portion (gray) */}
        <div
          className="h-full bg-slate-500 transition-all duration-300"
          style={{ width: `${Math.min(usedPercent, 100)}%` }}
        />
        {/* Pending portion (blue) */}
        <div
          className="h-full bg-blue-500 transition-all duration-300"
          style={{ width: `${Math.min(pendingPercent, 100 - usedPercent)}%` }}
        />
        {/* Available portion (green) */}
        <div
          className="h-full bg-emerald-500 transition-all duration-300"
          style={{ width: `${Math.min(availablePercent, 100 - usedPercent - pendingPercent)}%` }}
        />
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 text-xs text-slate-400">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-slate-500" />
          <span>{balance.used} used</span>
        </div>
        {balance.pending > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <span>{balance.pending} pending</span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <span>{balance.available} available</span>
        </div>
      </div>

      {/* Numbers summary */}
      <div className="mt-3 pt-3 border-t border-slate-800">
        <p className="text-sm text-slate-300">
          <span className="font-medium text-white">{balance.used}</span> used{" "}
          <span className="text-slate-600">/</span>{" "}
          <span className="font-medium text-white">{total}</span> total{" "}
          <span className="text-slate-500">
            ({balance.available} available)
          </span>
        </p>
        {balance.carried_forward > 0 && (
          <p className="text-xs text-slate-500 mt-1">
            Includes {balance.carried_forward} carried forward
          </p>
        )}
      </div>
    </div>
  );
}
