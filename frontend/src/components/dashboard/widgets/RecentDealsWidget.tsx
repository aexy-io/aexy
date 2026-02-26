"use client";

import Link from "next/link";
import { TrendingUp, ChevronRight, ArrowUpRight } from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useCRMObjects, useCRMRecords } from "@/hooks/useCRM";

const stageColors: Record<string, string> = {
  lead: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  proposal: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  negotiation: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  won: "bg-green-500/10 text-green-400 border-green-500/20",
  "closed won": "bg-green-500/10 text-green-400 border-green-500/20",
  lost: "bg-red-500/10 text-red-400 border-red-500/20",
  "closed lost": "bg-red-500/10 text-red-400 border-red-500/20",
};

function getStageColor(stage: string): string {
  const lower = stage.toLowerCase();
  for (const [key, value] of Object.entries(stageColors)) {
    if (lower.includes(key)) return value;
  }
  return "bg-muted text-muted-foreground border-border";
}

export function RecentDealsWidget() {
  const { currentWorkspace } = useWorkspace();
  const { objects, isLoading: objectsLoading } = useCRMObjects(
    currentWorkspace?.id || null
  );

  const dealsObject = objects?.find(
    (o) => o.name.toLowerCase() === "deals" || o.slug === "deals"
  );

  const { records, isLoading: recordsLoading } = useCRMRecords(
    currentWorkspace?.id || null,
    dealsObject?.id || null,
    { limit: 100 }
  );

  const isLoading = objectsLoading || recordsLoading;

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

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value}`;
  };

  const recentDeals = [...(records || [])]
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    .slice(0, 5);

  return (
    <div className="bg-background/50 border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 bg-emerald-500/10 rounded-lg shrink-0">
            <TrendingUp className="h-4 w-4 text-emerald-400" />
          </div>
          <h3 className="text-sm font-semibold text-foreground truncate">
            Recent Deals
          </h3>
        </div>
        <Link
          href="/crm"
          className="text-emerald-400 hover:text-emerald-300 text-xs flex items-center gap-0.5 transition whitespace-nowrap shrink-0"
        >
          View all <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="p-6">
        {!currentWorkspace ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <TrendingUp className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">
              Select a workspace to view recent deals.
            </p>
          </div>
        ) : recentDeals.length > 0 ? (
          <div className="space-y-2">
            {recentDeals.map((deal) => {
              const name =
                deal.display_name ||
                String(deal.values?.name || "Untitled Deal");
              const value =
                typeof deal.values?.value === "number"
                  ? deal.values.value
                  : 0;
              const stage = String(deal.values?.stage || "Unknown");

              return (
                <div
                  key={deal.id}
                  className="flex items-center justify-between p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition"
                >
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-sm font-medium text-foreground truncate">
                      {name}
                    </span>
                    {value > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {formatCurrency(value)}
                      </span>
                    )}
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded-full border whitespace-nowrap ml-3 ${getStageColor(stage)}`}
                  >
                    {stage}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-muted-foreground text-sm">No deals yet.</p>
            <Link
              href="/crm"
              className="inline-flex items-center gap-1 mt-2 text-emerald-400 hover:text-emerald-300 text-sm transition"
            >
              Go to CRM <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
