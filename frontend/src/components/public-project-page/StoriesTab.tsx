"use client";

import { useState, useEffect } from "react";
import { publicProjectApi, PublicStoryItem } from "@/lib/api";
import { PRIORITY_COLORS } from "./constants";
import { LoadingSpinner, EmptyState } from "./shared";

interface StoriesTabProps {
  publicSlug: string;
}

export function StoriesTab({ publicSlug }: StoriesTabProps) {
  const [stories, setStories] = useState<PublicStoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    publicProjectApi.getStories(publicSlug).then(setStories).finally(() => setIsLoading(false));
  }, [publicSlug]);

  if (isLoading) return <LoadingSpinner />;
  if (stories.length === 0) return <EmptyState message="No user stories" />;

  return (
    <div className="space-y-3">
      {stories.map((story) => (
        <div key={story.id} className="bg-muted rounded-lg p-4">
          <div className="flex items-start gap-3">
            <span className="text-xs font-mono text-muted-foreground bg-accent px-2 py-1 rounded">{story.key}</span>
            <div className="flex-1 min-w-0">
              <h3 className="text-foreground font-medium">{story.title}</h3>
              <p className="text-muted-foreground text-sm mt-1">
                As a <span className="text-foreground">{story.as_a}</span>, I want{" "}
                <span className="text-foreground">{story.i_want}</span>
                {story.so_that && (
                  <>, so that <span className="text-foreground">{story.so_that}</span></>
                )}
              </p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${PRIORITY_COLORS[story.priority] || PRIORITY_COLORS.medium}`}>
                  {story.priority}
                </span>
                <span className="text-xs text-muted-foreground">{story.status.replace("_", " ")}</span>
                {story.story_points && (
                  <span className="text-xs text-muted-foreground">{story.story_points} pts</span>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
