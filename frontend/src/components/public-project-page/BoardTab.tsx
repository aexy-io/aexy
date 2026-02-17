"use client";

import { useState, useEffect } from "react";
import { publicProjectApi, PublicBoardData } from "@/lib/api";
import { PRIORITY_COLORS } from "./constants";
import { LoadingSpinner, EmptyState } from "./shared";

interface BoardTabProps {
  publicSlug: string;
}

const BOARD_COLUMNS = [
  { id: "todo", label: "To Do", color: "border-muted-foreground" },
  { id: "in_progress", label: "In Progress", color: "border-blue-500" },
  { id: "review", label: "Review", color: "border-purple-500" },
  { id: "done", label: "Done", color: "border-green-500" },
];

export function BoardTab({ publicSlug }: BoardTabProps) {
  const [board, setBoard] = useState<PublicBoardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    publicProjectApi.getBoard(publicSlug).then(setBoard).finally(() => setIsLoading(false));
  }, [publicSlug]);

  if (isLoading) return <LoadingSpinner />;
  if (!board) return <EmptyState message="No board data" />;

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {BOARD_COLUMNS.map((column) => {
        const tasks = board[column.id as keyof PublicBoardData] || [];
        return (
          <div key={column.id} className={`bg-muted/50 rounded-lg p-3 border-t-2 ${column.color}`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-foreground">{column.label}</h3>
              <span className="text-xs text-muted-foreground bg-accent px-2 py-0.5 rounded-full">
                {tasks.length}
              </span>
            </div>
            <div className="space-y-2">
              {tasks.slice(0, 10).map((task) => (
                <div key={task.id} className="bg-muted rounded-lg p-3">
                  <h4 className="text-sm text-foreground font-medium line-clamp-2">{task.title}</h4>
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`px-1.5 py-0.5 rounded text-xs ${PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium}`}>
                      {task.priority}
                    </span>
                    {task.story_points && (
                      <span className="text-xs text-muted-foreground">{task.story_points} pts</span>
                    )}
                  </div>
                </div>
              ))}
              {tasks.length > 10 && (
                <p className="text-xs text-muted-foreground text-center py-2">+{tasks.length - 10} more</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
