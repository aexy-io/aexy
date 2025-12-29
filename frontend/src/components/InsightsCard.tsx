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
      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
        <div className="animate-pulse">
          <div className="h-6 bg-slate-700 rounded w-32 mb-4"></div>
          <div className="h-20 bg-slate-700 rounded mb-4"></div>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-6 bg-slate-700 rounded w-3/4"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!insights) {
    return (
      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-primary-400" />
            <h3 className="text-lg font-semibold text-white">AI Insights</h3>
          </div>
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="text-slate-400 hover:text-white transition disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
        <p className="text-slate-400 text-sm">
          AI-powered insights are being generated. Click refresh to analyze your profile.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-primary-400" />
          <h3 className="text-lg font-semibold text-white">AI Insights</h3>
        </div>
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="text-slate-400 hover:text-white transition disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      {insights.skill_summary && (
        <p className="text-slate-300 text-sm mb-4 leading-relaxed">
          {insights.skill_summary}
        </p>
      )}

      {insights.strengths.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-green-400" />
            <span className="text-sm font-medium text-white">Strengths</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {insights.strengths.map((strength) => (
              <span
                key={strength}
                className="bg-green-900/30 text-green-300 px-2 py-1 rounded text-xs"
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
            <span className="text-sm font-medium text-white">Growth Areas</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {insights.growth_areas.map((area) => (
              <span
                key={area}
                className="bg-amber-900/30 text-amber-300 px-2 py-1 rounded text-xs"
              >
                {area}
              </span>
            ))}
          </div>
        </div>
      )}

      {insights.recommended_tasks.length > 0 && (
        <div className="pt-4 border-t border-slate-700">
          <span className="text-xs text-slate-400 block mb-2">
            Recommended task types:
          </span>
          <ul className="text-xs text-slate-300 space-y-1">
            {insights.recommended_tasks.slice(0, 3).map((task, i) => (
              <li key={i}>• {task}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
