"use client";

import {
  Code,
  Zap,
  GitPullRequest,
  Activity,
  BarChart3,
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
  const stats = [
    {
      label: "Languages",
      value: String(totalLanguages),
      description: `Top: ${topLanguage}`,
      icon: Code,
      iconColor: "text-info",
      iconBg: "bg-info/10",
    },
    {
      label: "Frameworks",
      value: String(totalFrameworks),
      description: "Active technologies",
      icon: Zap,
      iconColor: "text-purple-500",
      iconBg: "bg-purple-500/10",
    },
    {
      label: "Avg PR Size",
      value: avgPRSize.toFixed(0),
      description: "lines per PR",
      icon: GitPullRequest,
      iconColor: "text-success",
      iconBg: "bg-success/10",
    },
    {
      label: "Work Style",
      value: collaborationStyle || "N/A",
      description: "Collaboration type",
      icon: Activity,
      iconColor: "text-warning",
      iconBg: "bg-warning/10",
      smallValue: true,
    },
  ];

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 bg-info/10 rounded-lg shrink-0">
            <BarChart3 className="h-4 w-4 text-info" />
          </div>
          <h3 className="text-sm font-semibold text-foreground truncate">Quick Stats</h3>
        </div>
      </div>
      <div className="p-4">
        <div className="grid grid-cols-2 gap-3">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <div
                key={stat.label}
                className="bg-muted rounded-xl p-3 hover:bg-muted/80 transition min-w-0"
              >
                <div className="flex items-center gap-2 mb-1.5 min-w-0">
                  <div className={`p-1.5 ${stat.iconBg} rounded-lg shrink-0`}>
                    <Icon className={`w-4 h-4 ${stat.iconColor}`} />
                  </div>
                  <span className="text-muted-foreground text-xs truncate">{stat.label}</span>
                </div>
                <p className={`${stat.smallValue ? "text-base" : "text-xl"} font-bold text-foreground truncate capitalize`}>
                  {stat.value}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{stat.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
