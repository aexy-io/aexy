"use client";

import Link from "next/link";
import {
  DollarSign,
  ChevronRight,
  TrendingUp,
  Target,
  BarChart3,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useCRMObjects, useCRMRecords } from "@/hooks/useCRM";

export function DealStatsWidget() {
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
        <div className="h-6 w-32 bg-muted rounded mb-4" />
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const totalDeals = records?.length || 0;

  const pipelineValue =
    records?.reduce((sum, r) => {
      const val = r.values?.value;
      return sum + (typeof val === "number" ? val : 0);
    }, 0) || 0;

  const wonDeals =
    records?.filter((r) => {
      const stage = String(r.values?.stage || "").toLowerCase();
      return stage.includes("won") || stage === "closed won";
    }).length || 0;

  const activeDeals =
    records?.filter((r) => {
      const stage = String(r.values?.stage || "").toLowerCase();
      return !stage.includes("won") && !stage.includes("lost");
    }).length || 0;

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value}`;
  };

  return (
    <div className="bg-background/50 border border-border rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-500/10 rounded-lg">
            <DollarSign className="h-5 w-5 text-green-400" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">Deal Stats</h3>
        </div>
        <Link
          href="/crm"
          className="text-green-400 hover:text-green-300 text-sm flex items-center gap-1 transition"
        >
          View CRM <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="p-6">
        {!currentWorkspace ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <DollarSign className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">
              Select a workspace to view deal stats.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {/* Total Deals */}
            <div className="p-4 bg-muted/50 rounded-lg border border-border/50">
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 className="h-4 w-4 text-blue-400" />
                <span className="text-muted-foreground text-sm">
                  Total Deals
                </span>
              </div>
              <p className="text-2xl font-bold text-foreground">{totalDeals}</p>
            </div>

            {/* Pipeline Value */}
            <div className="p-4 bg-muted/50 rounded-lg border border-border/50">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="h-4 w-4 text-green-400" />
                <span className="text-muted-foreground text-sm">
                  Pipeline Value
                </span>
              </div>
              <p className="text-2xl font-bold text-foreground">
                {formatCurrency(pipelineValue)}
              </p>
            </div>

            {/* Won Deals */}
            <div className="p-4 bg-muted/50 rounded-lg border border-border/50">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4 text-emerald-400" />
                <span className="text-muted-foreground text-sm">Won Deals</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{wonDeals}</p>
            </div>

            {/* Active */}
            <div className="p-4 bg-muted/50 rounded-lg border border-border/50">
              <div className="flex items-center gap-2 mb-2">
                <Target className="h-4 w-4 text-amber-400" />
                <span className="text-muted-foreground text-sm">Active</span>
              </div>
              <p className="text-2xl font-bold text-foreground">
                {activeDeals}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
