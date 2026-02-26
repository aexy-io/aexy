"use client";

import { Clock } from "lucide-react";
import { SimpleTooltip as Tooltip } from "@/components/ui/tooltip";

interface Framework {
  name: string;
  proficiency_score: number;
  category: string;
  usage_count: number;
}

interface FrameworksToolsWidgetProps {
  frameworks: Framework[] | undefined;
}

export function FrameworksToolsWidget({ frameworks }: FrameworksToolsWidgetProps) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 bg-cyan-500/10 rounded-lg shrink-0">
            <Clock className="h-4 w-4 text-cyan-400" />
          </div>
          <h3 className="text-sm font-semibold text-foreground truncate">Frameworks & Tools</h3>
        </div>
      </div>
      <div className="p-6">
        {frameworks?.length ? (
          <div className="flex flex-wrap gap-2">
            {frameworks.map((fw) => (
              <Tooltip
                key={fw.name}
                content={`${fw.proficiency_score}% proficiency | ${fw.category} | ${fw.usage_count} uses`}
              >
                <span className="inline-flex items-center gap-2 bg-primary-100 dark:bg-primary-900/30 hover:bg-primary-900/50 text-primary-300 px-4 py-2 rounded-lg text-sm cursor-help transition">
                  {fw.name}
                  <span className="text-xs text-primary-400/60 bg-primary-100 dark:bg-primary-900/50 px-2 py-0.5 rounded-full">
                    {fw.proficiency_score}%
                  </span>
                </span>
              </Tooltip>
            ))}
          </div>
        ) : (
          <div className="text-center py-6">
            <p className="text-muted-foreground text-sm">No frameworks detected yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
