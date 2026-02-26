"use client";

import Link from "next/link";
import { FormInput, ChevronRight, Inbox } from "lucide-react";
import { useTickets } from "@/hooks/useTicketing";
import { useWorkspace } from "@/hooks/useWorkspace";

function formatDate(dateStr: string): string {
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

export function FormSubmissionsWidget() {
  const { currentWorkspace } = useWorkspace();
  const { tickets, isLoading } = useTickets(currentWorkspace?.id || null, {
    limit: 5,
    offset: 0,
  });

  if (isLoading) {
    return (
      <div className="bg-background/50 border border-border rounded-xl p-6 animate-pulse">
        <div className="h-6 w-40 bg-muted rounded mb-4" />
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-10 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background/50 border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 bg-teal-500/10 rounded-lg shrink-0">
            <FormInput className="h-4 w-4 text-teal-400" />
          </div>
          <h3 className="text-sm font-semibold text-foreground truncate">
            Form Submissions
          </h3>
        </div>
        <Link
          href="/tickets"
          className="text-teal-400 hover:text-teal-300 text-xs flex items-center gap-0.5 transition whitespace-nowrap shrink-0"
        >
          View all <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="p-6">
        {!currentWorkspace ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <FormInput className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">
              Select a workspace to view form submissions.
            </p>
          </div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <Inbox className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">
              No submissions yet. Submissions will appear here when forms are
              filled out.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {tickets.slice(0, 5).map((ticket) => (
              <Link
                key={ticket.id}
                href={`/tickets/${ticket.id}`}
                className="flex items-center justify-between p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <FormInput className="h-4 w-4 text-teal-400 flex-shrink-0" />
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
                <span className="text-xs text-muted-foreground flex-shrink-0 ml-3">
                  {formatDate(ticket.created_at)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
