"use client";

import Link from "next/link";
import { FileText, ChevronRight, Inbox } from "lucide-react";
import { useTicketForms } from "@/hooks/useTicketing";
import { useWorkspace } from "@/hooks/useWorkspace";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted/50 text-muted-foreground",
  inactive: "bg-muted/50 text-muted-foreground",
  active: "bg-green-500/20 text-green-400",
  archived: "bg-amber-500/20 text-amber-400",
};

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDay = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDay === 0) return "today";
  if (diffDay === 1) return "yesterday";
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

export function RecentFormsWidget() {
  const { currentWorkspace } = useWorkspace();
  const { forms, isLoading } = useTicketForms(currentWorkspace?.id || null);

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

  const displayForms = forms.slice(0, 5);

  return (
    <div className="bg-background/50 border border-border rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-cyan-500/10 rounded-lg">
            <FileText className="h-5 w-5 text-cyan-400" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">
            Recent Forms
          </h3>
        </div>
        <Link
          href="/tickets/forms"
          className="text-cyan-400 hover:text-cyan-300 text-sm flex items-center gap-1 transition"
        >
          View all <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="p-6">
        {!currentWorkspace ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">
              Select a workspace to view forms.
            </p>
          </div>
        ) : displayForms.length === 0 ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <Inbox className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">
              No forms yet. Create a form to start collecting submissions.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {displayForms.map((form) => (
              <Link
                key={form.id}
                href={`/tickets/forms/${form.id}`}
                className="flex items-center justify-between p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <FileText className="h-4 w-4 text-cyan-400 flex-shrink-0" />
                  <span className="text-sm text-foreground truncate">
                    {form.name}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                  {/* Status badge */}
                  <span
                    className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                      form.is_active
                        ? STATUS_COLORS.active
                        : STATUS_COLORS.draft
                    }`}
                  >
                    {form.is_active ? "active" : "inactive"}
                  </span>
                  {/* Submission count */}
                  <span className="text-xs text-muted-foreground">
                    {form.submission_count}{" "}
                    {form.submission_count === 1 ? "sub" : "subs"}
                  </span>
                  {/* Created date */}
                  <span className="text-xs text-muted-foreground hidden sm:inline">
                    {formatDate(form.created_at)}
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
