"use client";

import Link from "next/link";
import { List, ChevronRight, Inbox } from "lucide-react";
import { useTickets } from "@/hooks/useTicketing";
import { useWorkspace } from "@/hooks/useWorkspace";

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-500/20 text-blue-400",
  pending: "bg-amber-500/20 text-amber-400",
  resolved: "bg-green-500/20 text-green-400",
  closed: "bg-muted/50 text-muted-foreground",
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "text-red-400",
  high: "text-orange-400",
  medium: "text-amber-400",
  low: "text-muted-foreground",
};

const PRIORITY_DOTS: Record<string, string> = {
  urgent: "bg-red-400",
  high: "bg-orange-400",
  medium: "bg-amber-400",
  low: "bg-muted-foreground",
};

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

export function RecentTicketsWidget() {
  const { currentWorkspace } = useWorkspace();
  const { tickets, isLoading } = useTickets(currentWorkspace?.id || null, {
    limit: 5,
    offset: 0,
  });

  if (isLoading) {
    return (
      <div className="bg-background/50 border border-border rounded-xl p-6 animate-pulse">
        <div className="h-6 w-36 bg-muted rounded mb-4" />
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background/50 border border-border rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-pink-500/10 rounded-lg">
            <List className="h-5 w-5 text-pink-400" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">
            Recent Tickets
          </h3>
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
              <List className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">
              Select a workspace to view recent tickets.
            </p>
          </div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <Inbox className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">
              No tickets yet. Tickets will appear here when created.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {tickets.slice(0, 5).map((ticket) => (
              <Link
                key={ticket.id}
                href={`/tickets/${ticket.id}`}
                className="flex items-center justify-between p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition group"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {/* Priority indicator dot */}
                  <div
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      PRIORITY_DOTS[ticket.priority || "low"]
                    }`}
                    title={ticket.priority || "low"}
                  />
                  {/* Ticket number + submitter - truncated */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-purple-400 flex-shrink-0">
                        TKT-{ticket.ticket_number}
                      </span>
                      <span className="text-sm text-foreground truncate">
                        {ticket.submitter_name ||
                          ticket.submitter_email ||
                          "Anonymous"}
                      </span>
                    </div>
                    {ticket.form_name && (
                      <p className="text-xs text-muted-foreground truncate">
                        {ticket.form_name}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                  {/* Status badge */}
                  <span
                    className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                      STATUS_COLORS[ticket.status] || STATUS_COLORS.open
                    }`}
                  >
                    {ticket.status}
                  </span>
                  {/* Priority label */}
                  {ticket.priority && (
                    <span
                      className={`text-xs hidden sm:inline ${
                        PRIORITY_COLORS[ticket.priority] || PRIORITY_COLORS.low
                      }`}
                    >
                      {ticket.priority}
                    </span>
                  )}
                  {/* Relative time */}
                  <span className="text-xs text-muted-foreground w-16 text-right">
                    {formatRelativeTime(ticket.created_at)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
