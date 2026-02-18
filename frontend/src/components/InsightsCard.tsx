"use client";

import { Lightbulb, TrendingUp, AlertCircle, RefreshCw } from "lucide-react";
import { DeveloperInsights } from "@/lib/api";

interface InsightsCardProps {
  insights: DeveloperInsights | null;
  isLoading?: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function InsightsCard({
  insights,
  isLoading,
  onRefresh,
  isRefreshing
}: InsightsCardProps) {
  if (isLoading) {
    return (
      <div className="bg-muted rounded-xl p-6 border border-border">
        <div className="animate-pulse">
          <div className="h-6 bg-accent rounded w-32 mb-4"></div>
          <div className="h-20 bg-accent rounded mb-4"></div>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-6 bg-accent rounded w-3/4"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!insights) {
    return (
      <div className="bg-muted rounded-xl p-6 border border-border">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-primary-400" />
            <h3 className="text-lg font-semibold text-foreground">AI Insights</h3>
          </div>
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="text-muted-foreground hover:text-foreground transition disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
        <p className="text-muted-foreground text-sm">
          AI-powered insights are being generated. Click refresh to analyze your profile.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-muted rounded-xl p-6 border border-border">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-primary-400" />
          <h3 className="text-lg font-semibold text-foreground">AI Insights</h3>
        </div>
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="text-muted-foreground hover:text-foreground transition disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      {insights.skill_summary && (
        <p className="text-foreground text-sm mb-4 leading-relaxed">
          {insights.skill_summary}
        </p>
      )}

      {insights.strengths.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-green-400" />
            <span className="text-sm font-medium text-foreground">Strengths</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {insights.strengths.map((strength) => (
              <span
                key={strength}
                className="bg-green-100 dark:bg-green-900/30 text-green-300 px-2 py-1 rounded text-xs"
              >
                {strength}
              </span>
            ))}
          </div>
        </div>
      )}

      {insights.growth_areas.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="h-4 w-4 text-amber-400" />
            <span className="text-sm font-medium text-foreground">Growth Areas</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {insights.growth_areas.map((area) => (
              <span
                key={area}
                className="bg-amber-100 dark:bg-amber-900/30 text-amber-300 px-2 py-1 rounded text-xs"
              >
                {area}
              </span>
            ))}
          </div>
        </div>
      )}

      {insights.recommended_tasks.length > 0 && (
        <div className="pt-4 border-t border-border">
          <span className="text-xs text-muted-foreground block mb-2">
            Recommended task types:
          </span>
          <ul className="text-xs text-foreground space-y-1">
            {insights.recommended_tasks.slice(0, 3).map((task, i) => (
              <li key={i}>• {task}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
