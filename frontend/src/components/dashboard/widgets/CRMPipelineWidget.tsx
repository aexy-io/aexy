"use client";

import Link from "next/link";
import {
  Building2,
  ChevronRight,
  DollarSign,
  TrendingUp,
  Users,
  ArrowUpRight,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useCRMObjects, useCRMRecords } from "@/hooks/useCRM";

export function CRMPipelineWidget() {
  const { currentWorkspace } = useWorkspace();
  const { objects, isLoading: objectsLoading } = useCRMObjects(currentWorkspace?.id || null);

  // Find the Deals object (or first object as fallback)
  const dealsObject = objects?.find((o: { name: string }) => o.name.toLowerCase() === "deals" || o.name.toLowerCase() === "deal") || objects?.[0];

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
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  // Calculate stats from records
  const totalDeals = records?.length || 0;
  const totalValue = records?.reduce((sum, r) => sum + (typeof r.values?.value === "number" ? r.values.value : 0), 0) || 0;
  const wonDeals = records?.filter((r) => {
    const status = r.values?.status;
    return status === "won" || status === "closed_won";
  }).length || 0;

  // Group by stage for pipeline view
  const stageMap = new Map<string, { count: number; value: number }>();
  records?.forEach((r) => {
    const stage = String(r.values?.stage || "Unknown");
    const existing = stageMap.get(stage) || { count: 0, value: 0 };
    stageMap.set(stage, {
      count: existing.count + 1,
      value: existing.value + (typeof r.values?.value === "number" ? r.values.value : 0),
    });
  });
  const stages = Array.from(stageMap.entries()).map(([name, data]) => ({ name, ...data }));

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value}`;
  };

  return (
    <div className="bg-background/50 border border-border rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-cyan-500/10 rounded-lg">
            <Building2 className="h-5 w-5 text-cyan-400" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">CRM Pipeline</h3>
        </div>
        <Link
          href="/crm"
          className="text-cyan-400 hover:text-cyan-300 text-sm flex items-center gap-1 transition"
        >
          View CRM <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="p-6">
        {!currentWorkspace ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <Building2 className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">
              Select a workspace to view CRM data.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Users className="h-3 w-3 text-cyan-400" />
                  <span className="text-xs text-muted-foreground">Deals</span>
                </div>
                <p className="text-lg font-bold text-foreground">{totalDeals}</p>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <DollarSign className="h-3 w-3 text-green-400" />
                  <span className="text-xs text-muted-foreground">Value</span>
                </div>
                <p className="text-lg font-bold text-foreground">
                  {formatCurrency(totalValue)}
                </p>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <TrendingUp className="h-3 w-3 text-emerald-400" />
                  <span className="text-xs text-muted-foreground">Won</span>
                </div>
                <p className="text-lg font-bold text-foreground">{wonDeals}</p>
              </div>
            </div>

            {/* Pipeline stages */}
            {stages.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">
                  Pipeline Stages
                </p>
                {stages.slice(0, 4).map((stage, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-2 bg-muted/30 rounded-lg"
                  >
                    <span className="text-sm text-foreground">{stage.name}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        {stage.count} deals
                      </span>
                      <span className="text-sm font-medium text-foreground">
                        {formatCurrency(stage.value)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-muted-foreground text-sm">No active deals yet.</p>
                <Link
                  href="/crm/deals/new"
                  className="inline-flex items-center gap-1 mt-2 text-cyan-400 hover:text-cyan-300 text-sm transition"
                >
                  Create first deal <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
