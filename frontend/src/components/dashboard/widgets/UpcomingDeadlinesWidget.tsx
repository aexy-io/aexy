"use client";

import Link from "next/link";
import {
  Clock,
  ChevronRight,
  CalendarClock,
  AlertCircle,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useTeams } from "@/hooks/useTeams";
import { useActiveSprint, useSprintTasks } from "@/hooks/useSprints";

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getUrgencyClass(dueDateStr: string): string {
  const now = new Date();
  const dueDate = new Date(dueDateStr);
  const diffMs = dueDate.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays < 0) return "text-red-400";
  if (diffDays <= 2) return "text-amber-400";
  return "text-muted-foreground";
}

function getUrgencyLabel(dueDateStr: string): string | null {
  const now = new Date();
  const dueDate = new Date(dueDateStr);
  const diffMs = dueDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return "Overdue";
  if (diffDays === 0) return "Due today";
  if (diffDays === 1) return "Due tomorrow";
  if (diffDays <= 2) return `${diffDays} days left`;
  return null;
}

export function UpcomingDeadlinesWidget() {
  const { currentWorkspace } = useWorkspace();
  const { teams } = useTeams(currentWorkspace?.id || null);
  const defaultTeamId = teams?.[0]?.id || null;
  const { sprint: activeSprint, isLoading: isSprintLoading } = useActiveSprint(
    currentWorkspace?.id || null,
    defaultTeamId
  );
  const { tasks, isLoading: isTasksLoading } = useSprintTasks(
    activeSprint?.id || null
  );

  const isLoading = isSprintLoading || isTasksLoading;

  if (isLoading) {
    return (
      <div className="bg-background/50 border border-border rounded-xl p-6 animate-pulse">
        <div className="h-6 w-44 bg-muted rounded mb-4" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  // Show incomplete tasks from the active sprint (sprint end date is the deadline)
  const sprintEndDate = activeSprint?.end_date;
  const incompleteTasks = (tasks || [])
    .filter((task) => task.status !== "done")
    .slice(0, 5);

  return (
    <div className="bg-background/50 border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 bg-orange-500/10 rounded-lg shrink-0">
            <Clock className="h-4 w-4 text-orange-400" />
          </div>
          <h3 className="text-sm font-semibold text-foreground truncate">Upcoming Deadlines</h3>
        </div>
        <Link
          href="/sprints"
          className="text-orange-400 hover:text-orange-300 text-xs flex items-center gap-0.5 transition whitespace-nowrap shrink-0"
        >
          View all <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="p-6">
        {!currentWorkspace ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <CalendarClock className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">
              Select a workspace to view deadlines.
            </p>
          </div>
        ) : !activeSprint ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">
              No active sprint
            </p>
          </div>
        ) : incompleteTasks.length === 0 ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">
              All tasks complete!
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Sprint deadline banner */}
            {sprintEndDate && (
              <div className={`flex items-center justify-between p-2 rounded-lg border border-border/50 ${getUrgencyClass(sprintEndDate) === "text-red-400" ? "bg-red-500/5" : "bg-muted/30"}`}>
                <span className="text-xs text-muted-foreground">Sprint ends</span>
                <span className={`text-sm font-medium ${getUrgencyClass(sprintEndDate)}`}>
                  {formatDate(sprintEndDate)}
                  {getUrgencyLabel(sprintEndDate) && (
                    <span className="ml-1 text-xs">({getUrgencyLabel(sprintEndDate)})</span>
                  )}
                </span>
              </div>
            )}

            {/* Incomplete tasks */}
            <div className="space-y-2">
              {incompleteTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between gap-3 p-3 bg-muted/50 rounded-lg border border-border/50"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {task.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                      {task.status.replace(/_/g, " ")}
                    </p>
                  </div>
                  {task.priority && (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      task.priority === "critical" ? "bg-red-500/20 text-red-400" :
                      task.priority === "high" ? "bg-orange-500/20 text-orange-400" :
                      task.priority === "medium" ? "bg-amber-500/20 text-amber-400" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {task.priority}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
