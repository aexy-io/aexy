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
      <div className="px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-cyan-500/10 rounded-lg">
            <Clock className="h-5 w-5 text-cyan-400" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">Frameworks & Tools</h3>
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
                <span className="inline-flex items-center gap-2 bg-primary-900/30 hover:bg-primary-900/50 text-primary-300 px-4 py-2 rounded-lg text-sm cursor-help transition">
                  {fw.name}
                  <span className="text-xs text-primary-400/60 bg-primary-900/50 px-2 py-0.5 rounded-full">
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
