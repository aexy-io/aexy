"use client";

import Link from "next/link";
import {
  Ticket,
  AlertTriangle,
  Clock,
  CheckCircle,
  ChevronRight,
  Inbox,
} from "lucide-react";
import { useTicketStats } from "@/hooks/useTicketing";
import { useWorkspace } from "@/hooks/useWorkspace";

export function TicketStatsWidget() {
  const { currentWorkspace } = useWorkspace();
  const { stats, isLoading } = useTicketStats(currentWorkspace?.id || null);

  if (isLoading) {
    return (
      <div className="bg-background/50 border border-border rounded-xl p-6 animate-pulse">
        <div className="h-6 w-32 bg-muted rounded mb-4" />
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const openTickets = stats?.open_tickets || 0;
  const totalTickets = stats?.total_tickets || 0;
  const slaBreached = stats?.sla_breached || 0;
  const closedTickets = totalTickets - openTickets;

  return (
    <div className="bg-background/50 border border-border rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-pink-500/10 rounded-lg">
            <Ticket className="h-5 w-5 text-pink-400" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">Ticket Stats</h3>
        </div>
        <Link
          href="/tickets"
          className="text-pink-400 hover:text-pink-300 text-sm flex items-center gap-1 transition"
        >
          View all <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="p-6">
        {!currentWorkspace ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <Ticket className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">
              Select a workspace to view ticket stats.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {/* Open Tickets */}
            <div className="p-4 bg-muted/50 rounded-lg border border-border/50">
              <div className="flex items-center gap-2 mb-2">
                <Inbox className="h-4 w-4 text-blue-400" />
                <span className="text-muted-foreground text-sm">Open</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{openTickets}</p>
            </div>

            {/* Resolved */}
            <div className="p-4 bg-muted/50 rounded-lg border border-border/50">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="h-4 w-4 text-green-400" />
                <span className="text-muted-foreground text-sm">Closed</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{closedTickets}</p>
            </div>

            {/* SLA Breached */}
            <div className="p-4 bg-muted/50 rounded-lg border border-border/50">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle
                  className={`h-4 w-4 ${slaBreached > 0 ? "text-red-400" : "text-muted-foreground"}`}
                />
                <span className="text-muted-foreground text-sm">SLA Breached</span>
              </div>
              <p
                className={`text-2xl font-bold ${slaBreached > 0 ? "text-red-400" : "text-foreground"}`}
              >
                {slaBreached}
              </p>
            </div>

            {/* Total */}
            <div className="p-4 bg-muted/50 rounded-lg border border-border/50">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground text-sm">Total</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{totalTickets}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
