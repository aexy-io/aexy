"use client";

import Link from "next/link";
import {
  AlertCircle,
  ChevronRight,
  Clock,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import { useTicketStats } from "@/hooks/useTicketing";
import { useWorkspace } from "@/hooks/useWorkspace";

export function SLAOverviewWidget() {
  const { currentWorkspace } = useWorkspace();
  const { stats, isLoading } = useTicketStats(currentWorkspace?.id || null);

  if (isLoading) {
    return (
      <div className="bg-background/50 border border-border rounded-xl p-6 animate-pulse">
        <div className="h-6 w-36 bg-muted rounded mb-4" />
        <div className="space-y-3">
          <div className="h-24 bg-muted rounded-lg" />
          <div className="grid grid-cols-2 gap-3">
            <div className="h-16 bg-muted rounded-lg" />
            <div className="h-16 bg-muted rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  const totalTickets = stats?.total_tickets || 0;
  const slaBreached = stats?.sla_breached || 0;
  const complianceRate =
    totalTickets > 0
      ? Math.round(((totalTickets - slaBreached) / totalTickets) * 100)
      : 100;

  return (
    <div className="bg-background/50 border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 bg-red-500/10 rounded-lg shrink-0">
            <AlertCircle className="h-4 w-4 text-red-400" />
          </div>
          <h3 className="text-sm font-semibold text-foreground truncate">
            SLA Overview
          </h3>
        </div>
        <Link
          href="/tickets"
          className="text-red-400 hover:text-red-300 text-xs flex items-center gap-0.5 transition whitespace-nowrap shrink-0"
        >
          View all <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="p-6">
        {!currentWorkspace ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">
              Select a workspace to view SLA overview.
            </p>
          </div>
        ) : totalTickets === 0 ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <ShieldCheck className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">
              No tickets yet. SLA metrics will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Compliance rate - large display */}
            <div className="text-center p-4 bg-muted/50 rounded-lg border border-border/50">
              <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">
                SLA Compliance
              </p>
              <p
                className={`text-4xl font-bold ${
                  complianceRate >= 90
                    ? "text-green-400"
                    : complianceRate >= 70
                      ? "text-amber-400"
                      : "text-red-400"
                }`}
              >
                {complianceRate}%
              </p>
              <p className="text-muted-foreground text-xs mt-1">
                {totalTickets - slaBreached} of {totalTickets} tickets within
                SLA
              </p>
            </div>

            {/* Breached & Open Tickets */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-muted/50 rounded-lg border border-border/50">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle
                    className={`h-4 w-4 ${slaBreached > 0 ? "text-red-400" : "text-muted-foreground"}`}
                  />
                  <span className="text-muted-foreground text-xs">
                    Breached
                  </span>
                </div>
                <p
                  className={`text-xl font-bold ${slaBreached > 0 ? "text-red-400" : "text-foreground"}`}
                >
                  {slaBreached}
                </p>
              </div>

              <div className="p-3 bg-muted/50 rounded-lg border border-border/50">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground text-xs">
                    Open
                  </span>
                </div>
                <p className="text-xl font-bold text-foreground">
                  {stats?.open_tickets ?? 0}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
