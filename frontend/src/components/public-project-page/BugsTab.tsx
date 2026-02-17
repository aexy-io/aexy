"use client";

import { useState, useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { publicProjectApi, PublicBugItem } from "@/lib/api";
import { LoadingSpinner, EmptyState } from "./shared";

interface BugsTabProps {
  publicSlug: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  blocker: "text-red-400 bg-red-900/30",
  critical: "text-red-400 bg-red-900/30",
  major: "text-orange-400 bg-orange-900/30",
  minor: "text-yellow-400 bg-yellow-900/30",
  trivial: "text-muted-foreground bg-accent",
};

export function BugsTab({ publicSlug }: BugsTabProps) {
  const [bugs, setBugs] = useState<PublicBugItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    publicProjectApi.getBugs(publicSlug).then(setBugs).finally(() => setIsLoading(false));
  }, [publicSlug]);

  if (isLoading) return <LoadingSpinner />;
  if (bugs.length === 0) return <EmptyState message="No bugs reported" />;

  return (
    <div className="space-y-3">
      {bugs.map((bug) => (
        <div key={bug.id} className="bg-muted rounded-lg p-4">
          <div className="flex items-start gap-3">
            <span className="text-xs font-mono text-muted-foreground bg-accent px-2 py-1 rounded">{bug.key}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-foreground font-medium">{bug.title}</h3>
                {bug.is_regression && (
                  <span className="text-xs text-red-400 bg-red-900/30 px-1.5 py-0.5 rounded flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Regression
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${SEVERITY_COLORS[bug.severity] || SEVERITY_COLORS.minor}`}>
                  {bug.severity}
                </span>
                <span className="text-xs text-muted-foreground">{bug.bug_type}</span>
                <span className="text-xs text-muted-foreground">{bug.status.replace("_", " ")}</span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
