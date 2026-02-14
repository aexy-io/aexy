"use client";

import { Sparkles } from "lucide-react";
import { InsightsCard } from "@/components/InsightsCard";
import { SoftSkillsCard } from "@/components/SoftSkillsCard";
import { GrowthTrajectoryCard } from "@/components/GrowthTrajectoryCard";
import { PeerBenchmarkCard } from "@/components/PeerBenchmarkCard";
import type { DeveloperInsights, SoftSkillsProfile } from "@/lib/api";

interface AIInsightsWidgetProps {
  insights: DeveloperInsights | null;
  softSkills: SoftSkillsProfile | null;
  insightsLoading: boolean;
  softSkillsLoading: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
  growth: unknown;
  userId?: string;
  showInsights: boolean;
  showSoftSkills: boolean;
  showGrowth: boolean;
  showBenchmark: boolean;
}

export function AIInsightsWidget({
  insights,
  softSkills,
  insightsLoading,
  softSkillsLoading,
  isRefreshing,
  onRefresh,
  growth,
  userId,
  showInsights,
  showSoftSkills,
  showGrowth,
  showBenchmark,
}: AIInsightsWidgetProps) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-gradient-to-br from-primary-500/20 to-purple-500/20 rounded-lg">
          <Sparkles className="h-5 w-5 text-primary-400" />
        </div>
        <h2 className="text-xl font-bold text-foreground">AI-Powered Insights</h2>
      </div>
      {(showInsights || showSoftSkills) && (
        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          {showInsights && (
            <InsightsCard
              insights={insights}
              isLoading={insightsLoading}
              onRefresh={onRefresh}
              isRefreshing={isRefreshing}
            />
          )}
          {showSoftSkills && (
            <SoftSkillsCard
              softSkills={softSkills}
              isLoading={softSkillsLoading}
            />
          )}
        </div>
      )}
      {(showGrowth || showBenchmark) && (
        <div className="grid lg:grid-cols-2 gap-6">
          {showGrowth && (
            <GrowthTrajectoryCard growth={growth || null} />
          )}
          {showBenchmark && userId && <PeerBenchmarkCard developerId={userId} />}
        </div>
      )}
    </div>
  );
}
