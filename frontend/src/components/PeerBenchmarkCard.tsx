"use client";

import { useState, useEffect, useCallback } from "react";
import { BarChart2, TrendingUp, TrendingDown, RefreshCw } from "lucide-react";
import { analysisApi, BenchmarkResult } from "@/lib/api";

interface PeerBenchmarkCardProps {
  developerId: string;
}

export function PeerBenchmarkCard({ developerId }: PeerBenchmarkCardProps) {
  const [benchmark, setBenchmark] = useState<BenchmarkResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBenchmark = useCallback(async () => {
    if (!developerId) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await analysisApi.getBenchmark(developerId);
      setBenchmark(data);
    } catch (err) {
      console.error("Failed to fetch benchmark:", err);
      setError("Unable to load benchmark data");
    } finally {
      setIsLoading(false);
    }
  }, [developerId]);

  useEffect(() => {
    fetchBenchmark();
  }, [fetchBenchmark]);

  const getPercentileColor = (percentile: number) => {
    if (percentile >= 75) return "text-green-400";
    if (percentile >= 50) return "text-amber-400";
    if (percentile >= 25) return "text-orange-400";
    return "text-red-400";
  };

  const getPercentileBgColor = (percentile: number) => {
    if (percentile >= 75) return "bg-green-500";
    if (percentile >= 50) return "bg-amber-500";
    if (percentile >= 25) return "bg-orange-500";
    return "bg-red-500";
  };

  const getDeltaIcon = (delta: number) => {
    if (delta > 0) return <TrendingUp className="h-3 w-3 text-green-400" />;
    if (delta < 0) return <TrendingDown className="h-3 w-3 text-red-400" />;
    return null;
  };

  if (isLoading) {
    return (
      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
        <div className="animate-pulse">
          <div className="h-6 bg-slate-700 rounded w-40 mb-4"></div>
          <div className="h-24 bg-slate-700 rounded mb-4"></div>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-6 bg-slate-700 rounded w-3/4"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !benchmark) {
    return (
      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BarChart2 className="h-5 w-5 text-primary-400" />
            <h3 className="text-lg font-semibold text-white">Peer Benchmark</h3>
          </div>
          <button
            onClick={fetchBenchmark}
            className="text-slate-400 hover:text-white transition"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
        <p className="text-slate-400 text-sm">
          {error || "Benchmark data not available. More peers needed for comparison."}
        </p>
      </div>
    );
  }

  // Get top 5 comparisons sorted by percentile
  const allComparisons = [
    ...benchmark.language_comparisons,
    ...benchmark.framework_comparisons,
    ...benchmark.domain_comparisons,
  ].sort((a, b) => b.percentile - a.percentile);

  const topComparisons = allComparisons.slice(0, 5);

  return (
    <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart2 className="h-5 w-5 text-primary-400" />
          <h3 className="text-lg font-semibold text-white">Peer Benchmark</h3>
        </div>
        <button
          onClick={fetchBenchmark}
          className="text-slate-400 hover:text-white transition"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Overall Percentile */}
      <div className="bg-slate-700/50 rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400 mb-1">Overall Ranking</div>
            <div
              className={`text-3xl font-bold ${getPercentileColor(benchmark.percentile_overall)}`}
            >
              {Math.round(benchmark.percentile_overall)}
              <span className="text-lg">th</span>
            </div>
            <div className="text-xs text-slate-500">percentile</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-400 mb-1">Peer Group</div>
            <div className="text-lg text-white">{benchmark.peer_group_size}</div>
            <div className="text-xs text-slate-500">developers</div>
          </div>
        </div>
      </div>

      {/* Top Skills */}
      {topComparisons.length > 0 && (
        <div className="space-y-3 mb-4">
          <div className="text-xs text-slate-400 font-medium">
            Skill Rankings
          </div>
          {topComparisons.map((comp) => (
            <div key={comp.skill}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-white">{comp.skill}</span>
                  {getDeltaIcon(comp.delta)}
                </div>
                <span
                  className={`text-sm font-medium ${getPercentileColor(comp.percentile)}`}
                >
                  {Math.round(comp.percentile)}%
                </span>
              </div>
              <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className={`h-full ${getPercentileBgColor(comp.percentile)} rounded-full transition-all duration-500`}
                  style={{ width: `${comp.percentile}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Strengths & Growth */}
      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-700">
        <div>
          <div className="text-xs text-green-400 font-medium mb-2">
            Strengths
          </div>
          <div className="space-y-1">
            {benchmark.strengths.slice(0, 3).map((s) => (
              <div
                key={s}
                className="text-xs text-slate-300 bg-green-900/20 px-2 py-1 rounded"
              >
                {s}
              </div>
            ))}
            {benchmark.strengths.length === 0 && (
              <div className="text-xs text-slate-500">Building up...</div>
            )}
          </div>
        </div>
        <div>
          <div className="text-xs text-amber-400 font-medium mb-2">
            Growth Areas
          </div>
          <div className="space-y-1">
            {benchmark.growth_opportunities.slice(0, 3).map((g) => (
              <div
                key={g}
                className="text-xs text-slate-300 bg-amber-900/20 px-2 py-1 rounded"
              >
                {g}
              </div>
            ))}
            {benchmark.growth_opportunities.length === 0 && (
              <div className="text-xs text-slate-500">All looking good!</div>
            )}
          </div>
        </div>
      </div>

      {/* Recommendations */}
      {benchmark.recommendations.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-700">
          <div className="text-xs text-slate-500">
            {benchmark.recommendations[0]}
          </div>
        </div>
      )}
    </div>
  );
}
