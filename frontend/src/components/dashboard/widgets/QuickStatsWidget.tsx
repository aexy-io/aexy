"use client";

import {
  Code,
  Zap,
  GitPullRequest,
  Activity,
} from "lucide-react";

interface QuickStatsWidgetProps {
  totalLanguages: number;
  totalFrameworks: number;
  topLanguage: string;
  avgPRSize: number;
  collaborationStyle: string;
}

export function QuickStatsWidget({
  totalLanguages,
  totalFrameworks,
  topLanguage,
  avgPRSize,
  collaborationStyle,
}: QuickStatsWidgetProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="bg-card border border-border rounded-xl p-4 hover:border-border-strong transition">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-info/10 rounded-lg">
            <Code className="w-5 h-5 text-info" />
          </div>
          <span className="text-muted-foreground text-sm">Languages</span>
        </div>
        <p className="text-2xl font-bold text-foreground">{totalLanguages}</p>
        <p className="text-xs text-muted-foreground mt-1">Top: {topLanguage}</p>
      </div>
      <div className="bg-card border border-border rounded-xl p-4 hover:border-border-strong transition">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-purple-500/10 rounded-lg">
            <Zap className="w-5 h-5 text-purple-500" />
          </div>
          <span className="text-muted-foreground text-sm">Frameworks</span>
        </div>
        <p className="text-2xl font-bold text-foreground">{totalFrameworks}</p>
        <p className="text-xs text-muted-foreground mt-1">Active technologies</p>
      </div>
      <div className="bg-card border border-border rounded-xl p-4 hover:border-border-strong transition">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-success/10 rounded-lg">
            <GitPullRequest className="w-5 h-5 text-success" />
          </div>
          <span className="text-muted-foreground text-sm">Avg PR Size</span>
        </div>
        <p className="text-2xl font-bold text-foreground">{avgPRSize.toFixed(0)}</p>
        <p className="text-xs text-muted-foreground mt-1">lines per PR</p>
      </div>
      <div className="bg-card border border-border rounded-xl p-4 hover:border-border-strong transition">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-warning/10 rounded-lg">
            <Activity className="w-5 h-5 text-warning" />
          </div>
          <span className="text-muted-foreground text-sm">Work Style</span>
        </div>
        <p className="text-lg font-bold text-foreground capitalize">
          {collaborationStyle || "N/A"}
        </p>
        <p className="text-xs text-muted-foreground mt-1">Collaboration type</p>
      </div>
    </div>
  );
}
