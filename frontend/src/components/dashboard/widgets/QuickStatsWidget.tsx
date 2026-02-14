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
  const stats = [
    {
      icon: Code,
      iconBg: "bg-info/10",
      iconColor: "text-info",
      label: "Languages",
      value: String(totalLanguages),
      description: `Top: ${topLanguage}`,
    },
    {
      icon: Zap,
      iconBg: "bg-purple-500/10",
      iconColor: "text-purple-500",
      label: "Frameworks",
      value: String(totalFrameworks),
      description: "Active technologies",
    },
    {
      icon: GitPullRequest,
      iconBg: "bg-success/10",
      iconColor: "text-success",
      label: "Avg PR Size",
      value: avgPRSize.toFixed(0),
      description: "lines per PR",
    },
    {
      icon: Activity,
      iconBg: "bg-warning/10",
      iconColor: "text-warning",
      label: "Work Style",
      value: collaborationStyle || "N/A",
      description: "Collaboration type",
      smallValue: true,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <div
            key={stat.label}
            className="bg-card border border-border rounded-xl p-3 hover:border-border-strong transition min-w-0"
          >
            <div className="flex items-center gap-2 mb-2 min-w-0">
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
  );
}
