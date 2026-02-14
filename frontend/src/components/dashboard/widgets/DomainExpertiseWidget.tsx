"use client";

import { TrendingUp } from "lucide-react";
import { SimpleTooltip as Tooltip } from "@/components/ui/tooltip";

interface Domain {
  name: string;
  confidence_score: number;
}

interface DomainExpertiseWidgetProps {
  domains: Domain[] | undefined;
}

export function DomainExpertiseWidget({ domains }: DomainExpertiseWidgetProps) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500/10 rounded-lg">
            <TrendingUp className="h-5 w-5 text-amber-400" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">Domain Expertise</h3>
        </div>
      </div>
      <div className="p-6">
        {domains?.length ? (
          <div className="flex flex-wrap gap-2">
            {domains.map((domain) => (
              <Tooltip
                key={domain.name}
                content={`Confidence: ${domain.confidence_score}% based on file types & commits`}
              >
                <span className="inline-flex items-center gap-2 bg-muted hover:bg-accent text-slate-300 px-4 py-2 rounded-lg text-sm cursor-help transition">
                  {domain.name.replace("_", " ")}
                  <span className="text-xs text-muted-foreground/70 bg-muted px-2 py-0.5 rounded-full">
                    {domain.confidence_score}%
                  </span>
                </span>
              </Tooltip>
            ))}
          </div>
        ) : (
          <div className="text-center py-6">
            <p className="text-muted-foreground text-sm">No domains detected yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
