"use client";

import Link from "next/link";
import { Flag, ChevronRight, Inbox } from "lucide-react";
import { useTicketStats } from "@/hooks/useTicketing";
import { useWorkspace } from "@/hooks/useWorkspace";

export function TicketsByPriorityWidget() {
  const { currentWorkspace } = useWorkspace();
  const { stats, isLoading } = useTicketStats(currentWorkspace?.id || null);

  if (isLoading) {
    return (
      <div className="bg-background/50 border border-border rounded-xl p-6 animate-pulse">
        <div className="h-6 w-40 bg-muted rounded mb-4" />
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-8 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const totalTickets = stats?.total_tickets || 0;
  const openTickets = stats?.open_tickets || 0;
  const closedTickets = totalTickets - openTickets;
  const hasData = totalTickets > 0;

  return (
    <div className="bg-background/50 border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 bg-amber-500/10 rounded-lg shrink-0">
            <Flag className="h-4 w-4 text-amber-400" />
          </div>
          <h3 className="text-sm font-semibold text-foreground truncate">
            Ticket Breakdown
          </h3>
        </div>
        <Link
          href="/tickets"
          className="text-amber-400 hover:text-amber-300 text-xs flex items-center gap-0.5 transition whitespace-nowrap shrink-0"
        >
          View all <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="p-6">
        {!currentWorkspace ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <Flag className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">
              Select a workspace to view tickets.
            </p>
          </div>
        ) : !hasData ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <Inbox className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">
              No tickets yet. Breakdown will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Open vs Closed stacked bar */}
            <p className="text-xs text-muted-foreground uppercase tracking-wider">
              Open vs Closed
            </p>
            <div className="h-8 bg-muted/50 rounded-md overflow-hidden flex">
              {openTickets > 0 && (
                <div
                  className="h-full bg-blue-500 flex items-center justify-center transition-all"
                  style={{
                    width: `${(openTickets / totalTickets) * 100}%`,
                    minWidth: "32px",
                  }}
                >
                  <span className="text-foreground text-xs font-medium">
                    {openTickets}
                  </span>
                </div>
              )}
              {closedTickets > 0 && (
                <div
                  className="h-full bg-muted-foreground flex items-center justify-center transition-all"
                  style={{
                    width: `${(closedTickets / totalTickets) * 100}%`,
                    minWidth: "32px",
                  }}
                >
                  <span className="text-foreground text-xs font-medium">
                    {closedTickets}
                  </span>
                </div>
              )}
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm bg-blue-500" />
                <span>Open ({openTickets})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm bg-muted-foreground" />
                <span>Closed ({closedTickets})</span>
              </div>
            </div>

            {/* SLA summary */}
            {(stats?.sla_breached ?? 0) > 0 && (
              <div className="pt-3 border-t border-border">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">SLA Breached</span>
                  <span className="text-sm font-medium text-red-400">{stats?.sla_breached}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
