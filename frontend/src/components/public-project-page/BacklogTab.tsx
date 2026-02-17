"use client";

import { useState, useEffect } from "react";
import { publicProjectApi, PublicTaskItem } from "@/lib/api";
import { PRIORITY_COLORS, TASK_STATUS_COLORS } from "./constants";
import { EmptyState, LoadingSpinner } from "./shared";

interface BacklogTabProps {
  publicSlug: string;
}

export function BacklogTab({ publicSlug }: BacklogTabProps) {
  const [tasks, setTasks] = useState<PublicTaskItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    publicProjectApi.getBacklog(publicSlug).then(setTasks).finally(() => setIsLoading(false));
  }, [publicSlug]);

  if (isLoading) return <LoadingSpinner />;
  if (tasks.length === 0) return <EmptyState message="No backlog items" />;

  return (
    <div className="space-y-3">
      {tasks.map((task) => (
        <div key={task.id} className="bg-muted rounded-lg p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h3 className="text-foreground font-medium">{task.title}</h3>
              {task.description && (
                <p className="text-muted-foreground text-sm mt-1 line-clamp-2">{task.description}</p>
              )}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium}`}>
                  {task.priority}
                </span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span className={`w-2 h-2 rounded-full ${TASK_STATUS_COLORS[task.status] || TASK_STATUS_COLORS.todo}`} />
                  {task.status.replace("_", " ")}
                </span>
                {task.story_points && (
                  <span className="text-xs text-muted-foreground">{task.story_points} pts</span>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
