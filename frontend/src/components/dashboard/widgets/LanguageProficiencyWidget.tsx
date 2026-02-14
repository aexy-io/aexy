"use client";

import Link from "next/link";
import { Code, TrendingUp, ChevronRight } from "lucide-react";
import { SimpleTooltip as Tooltip } from "@/components/ui/tooltip";

interface Language {
  name: string;
  proficiency_score: number;
  commits_count: number;
  trend: string;
}

interface LanguageProficiencyWidgetProps {
  languages: Language[] | undefined;
}

function getTrendColor(trend: string): string {
  switch (trend) {
    case "growing":
      return "text-green-400";
    case "declining":
      return "text-red-400";
    default:
      return "text-muted-foreground/70";
  }
}

export function LanguageProficiencyWidget({ languages }: LanguageProficiencyWidgetProps) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary-500/10 rounded-lg">
            <Code className="h-5 w-5 text-primary-400" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">Language Proficiency</h3>
        </div>
        <Link href="/profile" className="text-primary-400 hover:text-primary-300 text-sm flex items-center gap-1 transition">
          View all <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="p-6">
        {languages?.length ? (
          <div className="grid md:grid-cols-2 gap-6">
            {languages.slice(0, 6).map((lang, index) => (
              <div key={lang.name} className="group">
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground/70 text-xs font-mono">#{index + 1}</span>
                    <span className="text-foreground font-medium">{lang.name}</span>
                  </div>
                  <Tooltip content={`Score: ${lang.proficiency_score}/100 based on commits & lines of code`}>
                    <span className="text-muted-foreground text-sm cursor-help tabular-nums">
                      {lang.proficiency_score}%
                    </span>
                  </Tooltip>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-primary-600 to-primary-400 rounded-full transition-all duration-500 group-hover:from-primary-500 group-hover:to-primary-300"
                    style={{ width: `${lang.proficiency_score}%` }}
                  />
                </div>
                <div className="flex justify-between items-center text-xs text-muted-foreground/70 mt-1.5">
                  <span>{lang.commits_count.toLocaleString()} commits</span>
                  <span className={`flex items-center gap-1 ${getTrendColor(lang.trend)}`}>
                    {lang.trend === "growing" && <TrendingUp className="w-3 h-3" />}
                    {lang.trend}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <Code className="w-8 h-8 text-muted-foreground/50" />
            </div>
            <p className="text-muted-foreground text-sm">
              No language data yet. Connect your GitHub to analyze your contributions.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
