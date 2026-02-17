"use client";

import { useState, useEffect } from "react";
import { Clock } from "lucide-react";
import { publicProjectApi, PublicReleaseItem } from "@/lib/api";
import { LoadingSpinner, EmptyState } from "./shared";

interface ReleasesTabProps {
  publicSlug: string;
}

const RELEASE_STATUS_COLORS: Record<string, string> = {
  planning: "text-muted-foreground bg-accent",
  in_progress: "text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30",
  code_freeze: "text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30",
  testing: "text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30",
  released: "text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30",
  cancelled: "text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30",
};

export function ReleasesTab({ publicSlug }: ReleasesTabProps) {
  const [releases, setReleases] = useState<PublicReleaseItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    publicProjectApi.getReleases(publicSlug).then(setReleases).finally(() => setIsLoading(false));
  }, [publicSlug]);

  if (isLoading) return <LoadingSpinner />;
  if (releases.length === 0) return <EmptyState message="No releases" />;

  return (
    <div className="space-y-3">
      {releases.map((release) => (
        <div key={release.id} className="bg-muted rounded-lg p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-foreground font-medium">{release.name}</h3>
                {release.version && (
                  <span className="text-xs font-mono text-muted-foreground bg-accent px-1.5 py-0.5 rounded">
                    v{release.version}
                  </span>
                )}
              </div>
              {release.description && (
                <p className="text-muted-foreground text-sm mt-1 line-clamp-2">{release.description}</p>
              )}
              <div className="flex items-center gap-3 mt-2">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${RELEASE_STATUS_COLORS[release.status] || RELEASE_STATUS_COLORS.planning}`}>
                  {release.status.replace("_", " ")}
                </span>
                {release.target_date && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {new Date(release.target_date).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
