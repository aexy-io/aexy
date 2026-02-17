"use client";

import Link from "next/link";
import { Palmtree, ChevronRight } from "lucide-react";
import { useLeaveBalances } from "@/hooks/useLeave";

export function LeaveBalanceWidget() {
  const { data: balances, isLoading } = useLeaveBalances();

  if (isLoading) {
    return (
      <div className="bg-background/50 border border-border rounded-xl p-6 animate-pulse">
        <div className="h-6 w-40 bg-muted rounded mb-4" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const items = balances?.slice(0, 5) || [];

  return (
    <div className="bg-background/50 border border-border rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/10 rounded-lg">
            <Palmtree className="h-5 w-5 text-blue-400" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">Leave Balance</h3>
        </div>
        <Link
          href="/leave"
          className="text-blue-400 hover:text-blue-300 text-sm flex items-center gap-1 transition"
        >
          View all <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="p-4 space-y-3">
        {items.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-4">
            No leave balances configured
          </p>
        ) : (
          items.map((balance) => {
            const total = balance.total_allocated + balance.carried_forward;
            const usedPercent = total > 0 ? (balance.used / total) * 100 : 0;
            const pendingPercent = total > 0 ? (balance.pending / total) * 100 : 0;

            return (
              <div
                key={balance.id}
                className="p-3 bg-muted/50 rounded-lg border border-border/50"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{
                        backgroundColor: balance.leave_type?.color || "#3b82f6",
                      }}
                    />
                    <span className="text-sm font-medium text-foreground">
                      {balance.leave_type?.name || "Leave"}
                    </span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {balance.available} left
                  </span>
                </div>
                <div className="w-full bg-accent rounded-full h-2 overflow-hidden">
                  <div className="h-full flex">
                    <div
                      className="bg-muted-foreground h-full"
                      style={{ width: `${Math.min(usedPercent, 100)}%` }}
                    />
                    <div
                      className="bg-amber-500 h-full"
                      style={{ width: `${Math.min(pendingPercent, 100 - usedPercent)}%` }}
                    />
                  </div>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-xs text-muted-foreground">
                    {balance.used} used
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {total} total
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
